/**
 * End-to-End Encryption Service
 * Integrates KeyManager and EntryCryptor with the application
 * Handles user flows: signup, login, entry creation, sharing, and reading
 */

import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import { fetch } from '../utils/fetch.js';
import { KeyManager, type UserKeyPair, type UserKeyPairB64 } from '../crypto/KeyManager.js';
import { EntryCryptor, type EntryObject, type EncryptedEntryData } from '../crypto/EntryCryptor.js';
import { biometricAuthService, type BiometricAuthResult } from './biometric-auth.service.js';
import nacl from 'tweetnacl';
import { decodeBase64 } from 'tweetnacl-util';

interface E2ESession {
  userId: string;
  userKeyPair: UserKeyPair;
  publicKeyB64: string;
  isUnlocked: boolean;
}

interface StoredUserKeys {
  encryptedSecretKeyB64: string;
  publicKeyB64: string;
  userId: string;
  // Biometric authentication data (optional)
  biometricEnabled?: boolean;
  encryptedPasswordB64?: string; // E2E password encrypted with biometric data
}

export class E2EEncryptionService {
  private currentSession: E2ESession | null = null;
  private sessionStore: Writable<E2ESession | null> = writable(null);
  private readonly STORAGE_KEY = 'diaryx_user_keys';

  constructor() {
    if (browser) {
      this.initializeFromStorage();
    }
  }
  /**
   * Initialize session from stored encrypted keys if available
   */
  private initializeFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return;

      const storedKeys: StoredUserKeys = JSON.parse(stored);
      // Session is locked until user provides password
      this.sessionStore.set({
        userId: storedKeys.userId,
        userKeyPair: { publicKey: new Uint8Array(), secretKey: new Uint8Array() },
        publicKeyB64: storedKeys.publicKeyB64,
        isUnlocked: false
      });
    } catch (error) {
      console.error('Failed to initialize from storage:', error);
      this.clearStoredKeys();
    }
  }

  /**
   * Generate new user keys during signup
   */
  generateUserKeys(): UserKeyPairB64 {
    return KeyManager.generateUserKeysB64();
  }

  /**
   * Complete user signup - store encrypted keys locally
   */
  completeSignup(userId: string, keyPair: UserKeyPairB64, password: string): boolean {
    // Input validation
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      console.error('Invalid user ID provided');
      return false;
    }
    
    if (!keyPair?.publicKey || !keyPair?.secretKey) {
      console.error('Invalid key pair provided');
      return false;
    }
    
    if (!password || typeof password !== 'string' || password.length < 8) {
      console.error('Invalid password provided - must be at least 8 characters');
      return false;
    }

    try {
      // Encrypt the secret key with the user's password
      const encryptedSecretKeyB64 = KeyManager.encryptSecretKey(keyPair.secretKey, password);
      
      // Store encrypted keys locally
      const storedKeys: StoredUserKeys = {
        encryptedSecretKeyB64,
        publicKeyB64: keyPair.publicKey,
        userId
      };
      
      if (browser) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storedKeys));
      }
      
      // Create active session
      const userKeyPair: UserKeyPair = {
        publicKey: KeyManager.publicKeyFromB64(keyPair.publicKey),
        secretKey: KeyManager.secretKeyFromB64(keyPair.secretKey)
      };
      
      // Validate the key pair works
      if (!KeyManager.validateKeyPair(userKeyPair)) {
        console.error('Generated key pair validation failed');
        KeyManager.clearKeyPair(userKeyPair);
        return false;
      }
      
      this.currentSession = {
        userId,
        userKeyPair,
        publicKeyB64: keyPair.publicKey,
        isUnlocked: true
      };
      
      this.sessionStore.set(this.currentSession);
      
      // Update user profile with encryption keys in the backend
      this.updateUserEncryptionKeys(userId, keyPair.publicKey, encryptedSecretKeyB64);
      
      return true;
    } catch (error) {
      console.error('Signup completion failed:', error);
      return false;
    }
  }

  /**
   * Login with password - decrypt stored keys
   */
  login(password: string): boolean {
    // Input validation
    if (!password || typeof password !== 'string' || password.length === 0) {
      console.error('Invalid password provided');
      return false;
    }

    try {
      const stored = browser ? localStorage.getItem(this.STORAGE_KEY) : null;
      if (!stored) {
        console.error('No stored keys found');
        return false;
      }

      const storedKeys: StoredUserKeys = JSON.parse(stored);
      
      // Validate stored data structure
      if (!storedKeys.encryptedSecretKeyB64 || !storedKeys.publicKeyB64 || !storedKeys.userId) {
        console.error('Invalid stored keys structure');
        this.clearStoredKeys();
        return false;
      }
      
      // Decrypt the secret key
      const secretKey = KeyManager.decryptSecretKey(storedKeys.encryptedSecretKeyB64, password);
      if (!secretKey) {
        console.error('Failed to decrypt secret key - wrong password?');
        return false;
      }
      
      // Create active session
      const userKeyPair: UserKeyPair = {
        publicKey: KeyManager.publicKeyFromB64(storedKeys.publicKeyB64),
        secretKey
      };
      
      // Validate the key pair works
      if (!KeyManager.validateKeyPair(userKeyPair)) {
        console.error('Invalid key pair after decryption');
        KeyManager.clearKeyPair(userKeyPair);
        return false;
      }
      
      this.currentSession = {
        userId: storedKeys.userId,
        userKeyPair,
        publicKeyB64: storedKeys.publicKeyB64,
        isUnlocked: true
      };
      
      this.sessionStore.set(this.currentSession);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }

  /**
   * Logout - clear session and sensitive data
   */
  logout(): void {
    if (this.currentSession) {
      // Clear sensitive data from memory
      KeyManager.clearKeyPair(this.currentSession.userKeyPair);
      this.currentSession = null;
    }
    
    this.sessionStore.set(null);
  }

  /**
   * Check if biometric authentication is available and enabled
   */
  async isBiometricAvailable(): Promise<boolean> {
    if (!browser) return false;
    
    const isSupported = await biometricAuthService.isSupported();
    const hasStoredKeys = this.hasStoredKeys();
    
    return isSupported && hasStoredKeys;
  }

  /**
   * Check if biometric authentication is enabled for the current user
   */
  isBiometricEnabled(): boolean {
    if (!browser) return false;
    
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return false;

      const storedKeys: StoredUserKeys = JSON.parse(stored);
      return storedKeys.biometricEnabled === true && !!storedKeys.encryptedPasswordB64;
    } catch (error) {
      console.error('Failed to check biometric status:', error);
      return false;
    }
  }

  /**
   * Enable biometric authentication for the current user
   */
  async enableBiometric(password: string): Promise<boolean> {
    if (!browser) {
      console.error('Biometric authentication not available outside browser');
      return false;
    }

    if (!await this.isBiometricAvailable()) {
      console.error('Biometric authentication not available on this device');
      return false;
    }

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        console.error('No stored keys found');
        return false;
      }

      const storedKeys: StoredUserKeys = JSON.parse(stored);
      
      // Verify the password works first
      if (!this.login(password)) {
        console.error('Invalid password provided');
        return false;
      }

      // Create biometric credential
      const credential = await biometricAuthService.createCredential(storedKeys.userId);
      if (!credential) {
        console.error('Failed to create biometric credential');
        return false;
      }

      // Authenticate immediately to get authenticator data for encryption
      const authResult = await biometricAuthService.authenticate();
      if (!authResult.success || !authResult.authenticatorData) {
        console.error('Biometric authentication failed after creation');
        biometricAuthService.removeCredential();
        return false;
      }

      // Encrypt the password with biometric data
      const encryptedPassword = await biometricAuthService.encryptPassword(
        password, 
        authResult.authenticatorData
      );

      // Update stored keys with biometric data
      const updatedKeys: StoredUserKeys = {
        ...storedKeys,
        biometricEnabled: true,
        encryptedPasswordB64: encryptedPassword
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedKeys));
      
      console.log('Biometric authentication enabled successfully');
      return true;

    } catch (error) {
      console.error('Failed to enable biometric authentication:', error);
      // Clean up any partial setup
      biometricAuthService.removeCredential();
      return false;
    }
  }

  /**
   * Disable biometric authentication
   */
  disableBiometric(): boolean {
    if (!browser) return false;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return false;

      const storedKeys: StoredUserKeys = JSON.parse(stored);
      
      // Remove biometric data from stored keys
      const updatedKeys: StoredUserKeys = {
        encryptedSecretKeyB64: storedKeys.encryptedSecretKeyB64,
        publicKeyB64: storedKeys.publicKeyB64,
        userId: storedKeys.userId
        // Remove biometric fields
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedKeys));
      
      // Remove biometric credential
      biometricAuthService.removeCredential();
      
      console.log('Biometric authentication disabled');
      return true;

    } catch (error) {
      console.error('Failed to disable biometric authentication:', error);
      return false;
    }
  }

  /**
   * Attempt to login using biometric authentication
   */
  async loginWithBiometric(): Promise<boolean> {
    if (!browser) {
      console.error('Biometric authentication not available outside browser');
      return false;
    }

    if (!this.isBiometricEnabled()) {
      console.error('Biometric authentication not enabled');
      return false;
    }

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        console.error('No stored keys found');
        return false;
      }

      const storedKeys: StoredUserKeys = JSON.parse(stored);
      if (!storedKeys.encryptedPasswordB64) {
        console.error('No encrypted password found');
        return false;
      }

      // Authenticate with biometrics
      const authResult: BiometricAuthResult = await biometricAuthService.authenticate();
      if (!authResult.success || !authResult.authenticatorData) {
        console.error('Biometric authentication failed:', authResult.error);
        return false;
      }

      // Decrypt password using biometric data
      const password = await biometricAuthService.decryptPassword(
        storedKeys.encryptedPasswordB64,
        authResult.authenticatorData
      );

      // Use decrypted password for normal login
      const loginSuccess = this.login(password);
      
      // Clear password from memory immediately
      password.replace(/./g, '0'); // Overwrite string content
      
      if (loginSuccess) {
        console.log('Biometric login successful');
        return true;
      } else {
        console.error('Login failed with decrypted password');
        return false;
      }

    } catch (error) {
      console.error('Biometric login failed:', error);
      return false;
    }
  }

  /**
   * Get biometric credential information
   */
  getBiometricInfo(): { enabled: boolean; credentialInfo: any } {
    return {
      enabled: this.isBiometricEnabled(),
      credentialInfo: biometricAuthService.getCredentialInfo()
    };
  }

  /**
   * Clear all stored keys (for account deletion or reset)
   */
  clearStoredKeys(): void {
    if (browser) {
      localStorage.removeItem(this.STORAGE_KEY);
    }
    this.logout();
  }

  /**
   * Check if user has stored keys (but may be locked)
   */
  hasStoredKeys(): boolean {
    if (!browser) return false;
    const stored = localStorage.getItem(this.STORAGE_KEY);
    return !!stored;
  }

  /**
   * Check if session is unlocked and ready for crypto operations
   */
  isUnlocked(): boolean {
    return this.currentSession?.isUnlocked || false;
  }

  /**
   * Get current user's public key (Base64)
   */
  getCurrentPublicKey(): string | null {
    return this.currentSession?.publicKeyB64 || null;
  }

  /**
   * Get current user ID
   */
  getCurrentUserId(): string | null {
    return this.currentSession?.userId || null;
  }

  /**
   * Encrypt a new entry for the current user
   */
  /**
   * Encrypt an entry with an existing entry key (for updates)
   * This maintains key consistency while generating a new content nonce
   */
  async encryptEntryWithExistingKey(
    entryObject: EntryObject, 
    existingEncryptedEntryKeyB64: string, 
    existingKeyNonceB64: string
  ): Promise<EncryptedEntryData | null> {
    if (!this.currentSession || !this.currentSession.isUnlocked) {
      console.error('Cannot encrypt entry - session not unlocked');
      return null;
    }

    // Validate inputs
    if (!entryObject || !existingEncryptedEntryKeyB64 || !existingKeyNonceB64) {
      console.error('Missing required parameters for encryption with existing key');
      return null;
    }

    try {
      console.log('=== Encrypting with existing key ===');
      
      // Decode the existing encrypted key and nonce
      const existingEncryptedKeyBytes = decodeBase64(existingEncryptedEntryKeyB64);
      const existingKeyNonceBytes = decodeBase64(existingKeyNonceB64);
      
      // Decrypt the existing entry key to reuse it
      const decryptedEntryKey = nacl.box.open(
        existingEncryptedKeyBytes,
        existingKeyNonceBytes,
        this.currentSession.userKeyPair.publicKey,
        this.currentSession.userKeyPair.secretKey
      );

      if (!decryptedEntryKey) {
        console.error('Failed to decrypt existing entry key');
        return null;
      }

      console.log('Successfully decrypted existing entry key, length:', decryptedEntryKey.length);

      // Now encrypt the new content with the existing key but new nonce
      const entryJson = JSON.stringify(entryObject);
      const entryBytes = new TextEncoder().encode(entryJson);
      
      // Generate NEW content nonce (critical for security)
      const newContentNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      
      // Encrypt content with existing key + new nonce
      const encryptedContent = nacl.secretbox(entryBytes, newContentNonce, decryptedEntryKey);
      
      // Clear the decrypted key from memory
      if (decryptedEntryKey.fill) {
        decryptedEntryKey.fill(0);
      }

      const { encodeBase64 } = await import('tweetnacl-util');
      const result = {
        encryptedContentB64: encodeBase64(encryptedContent),
        contentNonceB64: encodeBase64(newContentNonce),
        encryptedEntryKeyB64: existingEncryptedEntryKeyB64, // Reuse existing
        keyNonceB64: existingKeyNonceB64 // Reuse existing
      };

      console.log('Encryption with existing key completed:', {
        contentLength: result.encryptedContentB64.length,
        newContentNonce: result.contentNonceB64,
        reusingEntryKey: true
      });

      return result;
    } catch (error) {
      console.error('Failed to encrypt with existing key:', error);
      return null;
    }
  }

  encryptEntry(entryObject: EntryObject): EncryptedEntryData | null {
    if (!this.currentSession || !this.currentSession.isUnlocked) {
      console.error('Cannot encrypt entry - session not unlocked');
      return null;
    }
    
    if (!entryObject || typeof entryObject !== 'object') {
      console.error('Invalid entry object provided');
      return null;
    }

    try {
      return EntryCryptor.encryptEntry(entryObject, this.currentSession.userKeyPair);
    } catch (error) {
      console.error('Entry encryption failed:', error);
      return null;
    }
  }

  /**
   * Decrypt an entry (owned or shared)
   */
  decryptEntry(encryptedData: EncryptedEntryData, authorPublicKeyB64: string): EntryObject | null {
    if (!this.currentSession || !this.currentSession.isUnlocked) {
      console.error('Cannot decrypt entry - session not unlocked');
      return null;
    }
    
    if (!this.validateEncryptedEntryData(encryptedData)) {
      console.error('Invalid encrypted entry data provided');
      return null;
    }
    
    if (!authorPublicKeyB64 || typeof authorPublicKeyB64 !== 'string') {
      console.error('Invalid author public key provided');
      return null;
    }

    try {
      console.log('=== E2E Service Decryption Debug ===');
      console.log('Encrypted data structure:', {
        hasEncryptedContent: !!encryptedData.encryptedContentB64,
        hasContentNonce: !!encryptedData.contentNonceB64,
        hasEncryptedEntryKey: !!encryptedData.encryptedEntryKeyB64,
        hasKeyNonce: !!encryptedData.keyNonceB64,
        encryptedContentLength: encryptedData.encryptedContentB64?.length,
        contentNonceLength: encryptedData.contentNonceB64?.length,
        encryptedEntryKeyLength: encryptedData.encryptedEntryKeyB64?.length,
        keyNonceLength: encryptedData.keyNonceB64?.length
      });
      
      const authorPublicKey = KeyManager.publicKeyFromB64(authorPublicKeyB64);
      console.log('Author public key decoded successfully, length:', authorPublicKey.length);
      console.log('Current user secret key length:', this.currentSession.userKeyPair.secretKey.length);
      console.log('Current user public key:', this.currentSession.publicKeyB64);
      console.log('Author public key B64:', authorPublicKeyB64);
      console.log('Is self-encrypted entry:', this.currentSession.publicKeyB64 === authorPublicKeyB64);
      
      // Quick validation test - encrypt and decrypt a test entry to verify the system works
      if (this.currentSession.publicKeyB64 === authorPublicKeyB64) {
        console.log('=== Running encryption system validation test ===');
        try {
          const testEntry = { title: 'Test', content: 'Test content' };
          const testEncrypted = EntryCryptor.encryptEntry(testEntry, this.currentSession.userKeyPair);
          const testDecrypted = EntryCryptor.decryptEntry(
            testEncrypted,
            this.currentSession.userKeyPair.secretKey,
            this.currentSession.userKeyPair.publicKey
          );
          console.log('Encryption system validation:', testDecrypted ? 'PASS' : 'FAIL');
          if (testDecrypted) {
            console.log('Test decrypted content:', testDecrypted.content);
          }
        } catch (testError) {
          console.error('Encryption system validation failed:', testError);
        }
      }
      
      const result = EntryCryptor.decryptEntry(
        encryptedData,
        this.currentSession.userKeyPair.secretKey,
        authorPublicKey
      );
      
      console.log('=== E2E Service Decryption Result ===');
      console.log('Decryption result:', result ? 'success' : 'failed');
      
      if (!result) {
        console.log('=== Running specific data test on failed decryption ===');
        this.testSpecificEncryptionData(encryptedData, authorPublicKeyB64);
      }
      
      return result;
    } catch (error) {
      console.error('Entry decryption failed:', error);
      return null;
    }
  }

  /**
   * Re-wrap an entry key for sharing with another user
   */
  rewrapEntryKeyForUser(
    encryptedEntryKey: string,
    keyNonce: string,
    recipientPublicKeyB64: string
  ): { encryptedEntryKeyB64: string; keyNonceB64: string } | null {
    if (!this.currentSession || !this.currentSession.isUnlocked) {
      console.error('Cannot rewrap entry key - session not unlocked');
      return null;
    }
    
    if (!encryptedEntryKey || !keyNonce || !recipientPublicKeyB64) {
      console.error('Missing required parameters for key rewrapping');
      return null;
    }
    
    if (typeof encryptedEntryKey !== 'string' || typeof keyNonce !== 'string' || typeof recipientPublicKeyB64 !== 'string') {
      console.error('Invalid parameter types for key rewrapping');
      return null;
    }

    try {
      const recipientPublicKey = KeyManager.publicKeyFromB64(recipientPublicKeyB64);
      return EntryCryptor.rewrapEntryKey(
        encryptedEntryKey,
        keyNonce,
        this.currentSession.userKeyPair,
        recipientPublicKey
      );
    } catch (error) {
      console.error('Entry key rewrapping failed:', error);
      return null;
    }
  }

  /**
   * Generate content hashes for indexing
   */
  generateHashes(entryObject: EntryObject): {
    titleHash: string;
    contentHash: string;
    previewHash: string;
  } {
    return {
      titleHash: EntryCryptor.generateTitleHash(entryObject.title),
      contentHash: EntryCryptor.generateContentHash(entryObject),
      previewHash: EntryCryptor.generatePreviewHash(entryObject.content)
    };
  }

  /**
   * Create encryption metadata for database storage
   */
  createEncryptionMetadata(): Record<string, any> {
    return EntryCryptor.createEncryptionMetadata();
  }

  /**
   * Validate encrypted entry data structure
   */
  validateEncryptedEntryData(data: any): data is EncryptedEntryData {
    return EntryCryptor.validateEncryptedEntryData(data);
  }

  /**
   * Change password - re-encrypt stored secret key
   */
  changePassword(oldPassword: string, newPassword: string): boolean {
    // Input validation
    if (!oldPassword || typeof oldPassword !== 'string') {
      console.error('Invalid old password provided');
      return false;
    }
    
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      console.error('Invalid new password provided - must be at least 8 characters');
      return false;
    }
    
    if (oldPassword === newPassword) {
      console.error('New password must be different from old password');
      return false;
    }

    try {
      const stored = browser ? localStorage.getItem(this.STORAGE_KEY) : null;
      if (!stored) {
        console.error('No stored keys found');
        return false;
      }

      const storedKeys: StoredUserKeys = JSON.parse(stored);
      
      // Validate stored data structure
      if (!storedKeys.encryptedSecretKeyB64 || !storedKeys.publicKeyB64 || !storedKeys.userId) {
        console.error('Invalid stored keys structure');
        return false;
      }
      
      // Decrypt with old password
      const secretKey = KeyManager.decryptSecretKey(storedKeys.encryptedSecretKeyB64, oldPassword);
      if (!secretKey) {
        console.error('Failed to decrypt with old password');
        return false;
      }
      
      // Re-encrypt with new password
      const newEncryptedSecretKeyB64 = KeyManager.encryptSecretKey(secretKey, newPassword);
      
      // Update stored keys
      const updatedKeys: StoredUserKeys = {
        ...storedKeys,
        encryptedSecretKeyB64: newEncryptedSecretKeyB64
      };
      
      if (browser) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedKeys));
      }
      
      // Clear old secret key from memory
      KeyManager.clearKey(secretKey);
      
      // Update session if currently unlocked
      if (this.currentSession && this.currentSession.isUnlocked) {
        // Re-validate current session after password change
        if (!KeyManager.validateKeyPair(this.currentSession.userKeyPair)) {
          console.error('Session validation failed after password change');
          this.logout();
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Password change failed:', error);
      return false;
    }
  }

  /**
   * Get reactive store for UI updates
   */
  get store() {
    return this.sessionStore;
  }

  /**
   * Debug method: Compare encrypted data between what was sent and what was received
   */
  debugCompareEncryptedData(sentData: EncryptedEntryData, receivedData: EncryptedEntryData): void {
    console.log('=== Encrypted Data Comparison ===');
    console.log('Sent encryptedContentB64:', sentData.encryptedContentB64);
    console.log('Received encryptedContentB64:', receivedData.encryptedContentB64);
    console.log('Content matches:', sentData.encryptedContentB64 === receivedData.encryptedContentB64);
    
    console.log('Sent contentNonceB64:', sentData.contentNonceB64);
    console.log('Received contentNonceB64:', receivedData.contentNonceB64);
    console.log('Nonce matches:', sentData.contentNonceB64 === receivedData.contentNonceB64);
    
    console.log('Sent encryptedEntryKeyB64:', sentData.encryptedEntryKeyB64);
    console.log('Received encryptedEntryKeyB64:', receivedData.encryptedEntryKeyB64);
    console.log('Entry key matches:', sentData.encryptedEntryKeyB64 === receivedData.encryptedEntryKeyB64);
    
    console.log('Sent keyNonceB64:', sentData.keyNonceB64);
    console.log('Received keyNonceB64:', receivedData.keyNonceB64);
    console.log('Key nonce matches:', sentData.keyNonceB64 === receivedData.keyNonceB64);
  }

  /**
   * Debug method: Test encryption/decryption round-trip
   */
  testEncryptionRoundTrip(): boolean {
    if (!this.currentSession || !this.currentSession.isUnlocked) {
      console.error('Cannot test encryption - session not unlocked');
      return false;
    }

    try {
      const testEntry = {
        title: 'Encryption Test Entry',
        content: 'This is a test entry to validate encryption/decryption works correctly.'
      };

      console.log('=== Encryption Round-Trip Test ===');
      console.log('Original entry:', testEntry);

      // Encrypt
      const encrypted = EntryCryptor.encryptEntry(testEntry, this.currentSession.userKeyPair);
      console.log('Encryption successful, data lengths:', {
        encryptedContent: encrypted.encryptedContentB64.length,
        contentNonce: encrypted.contentNonceB64.length,
        encryptedEntryKey: encrypted.encryptedEntryKeyB64.length,
        keyNonce: encrypted.keyNonceB64.length
      });

      // Decrypt
      const decrypted = EntryCryptor.decryptEntry(
        encrypted,
        this.currentSession.userKeyPair.secretKey,
        this.currentSession.userKeyPair.publicKey
      );

      console.log('Decryption result:', decrypted);
      
      if (decrypted && decrypted.title === testEntry.title && decrypted.content === testEntry.content) {
        console.log('✅ Encryption round-trip test PASSED');
        return true;
      } else {
        console.error('❌ Encryption round-trip test FAILED - content mismatch');
        return false;
      }
    } catch (error) {
      console.error('❌ Encryption round-trip test FAILED with error:', error);
      return false;
    }
  }

  /**
   * Debug method: Analyze why a specific encrypted entry fails to decrypt
   */
  analyzeFailedDecryption(encryptedData: EncryptedEntryData, authorPublicKeyB64: string): void {
    if (!this.currentSession || !this.currentSession.isUnlocked) {
      console.error('Cannot analyze - session not unlocked');
      return;
    }

    console.log('=== Failed Decryption Analysis ===');
    
    try {
      // Test if we can decrypt the entry key successfully
      const authorPublicKey = KeyManager.publicKeyFromB64(authorPublicKeyB64);
      const encryptedEntryKey = decodeBase64(encryptedData.encryptedEntryKeyB64);
      const keyNonce = decodeBase64(encryptedData.keyNonceB64);
      
      console.log('Testing entry key decryption...');
      const entryKey = nacl.box.open(encryptedEntryKey, keyNonce, authorPublicKey, this.currentSession.userKeyPair.secretKey);
      
      if (!entryKey) {
        console.error('❌ Entry key decryption failed - this suggests key mismatch');
        return;
      }
      
      console.log('✅ Entry key decrypted successfully');
      
      // Now test if we can create valid test data with the same key
      console.log('Testing symmetric encryption with recovered entry key...');
      const testData = 'Test data with recovered key';
      const testBytes = new TextEncoder().encode(testData);
      const testNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const testEncrypted = nacl.secretbox(testBytes, testNonce, entryKey);
      const testDecrypted = nacl.secretbox.open(testEncrypted, testNonce, entryKey);
      
      if (testDecrypted) {
        console.log('✅ Symmetric encryption/decryption with recovered key works');
        console.log('❌ This confirms the original encrypted content is corrupted');
      } else {
        console.error('❌ Even fresh symmetric encryption fails with recovered key');
      }
      
      // Compare the failing data format
      const encryptedContent = decodeBase64(encryptedData.encryptedContentB64);
      const contentNonce = decodeBase64(encryptedData.contentNonceB64);
      
      console.log('Failing data analysis:', {
        encryptedContentLength: encryptedContent.length,
        contentNonceLength: contentNonce.length,
        entryKeyLength: entryKey.length,
        isValidContentNonce: contentNonce.length === nacl.secretbox.nonceLength,
        isValidEntryKey: entryKey.length === nacl.secretbox.keyLength,
        hasMinimumContentLength: encryptedContent.length >= nacl.secretbox.overheadLength
      });
      
      // Clear the entry key
      KeyManager.clearKey(entryKey);
      
    } catch (error) {
      console.error('Analysis failed:', error);
    }
  }

  /**
   * Debug method: Test encryption/decryption with specific data that's failing
   */
  testSpecificEncryptionData(encryptedData: EncryptedEntryData, authorPublicKeyB64: string): void {
    if (!this.currentSession || !this.currentSession.isUnlocked) {
      console.error('Cannot test - session not unlocked');
      return;
    }

    console.log('=== Testing Specific Failed Data ===');
    
    try {
      // First, let's see if we can decrypt the entry key successfully
      const authorPublicKey = KeyManager.publicKeyFromB64(authorPublicKeyB64);
      const encryptedEntryKey = decodeBase64(encryptedData.encryptedEntryKeyB64);
      const keyNonce = decodeBase64(encryptedData.keyNonceB64);
      
      console.log('Attempting to decrypt entry key...');
      const entryKey = nacl.box.open(encryptedEntryKey, keyNonce, authorPublicKey, this.currentSession.userKeyPair.secretKey);
      
      if (!entryKey) {
        console.error('❌ Entry key decryption failed');
        return;
      }
      
      console.log('✅ Entry key decrypted successfully');
      
      // Now let's try to decrypt the content
      const encryptedContent = decodeBase64(encryptedData.encryptedContentB64);
      const contentNonce = decodeBase64(encryptedData.contentNonceB64);
      
      console.log('Attempting to decrypt content...');
      const decryptedContentBytes = nacl.secretbox.open(encryptedContent, contentNonce, entryKey);
      
      if (!decryptedContentBytes) {
        console.error('❌ Content decryption failed');
        
        // Let's try encrypting some test data with the recovered key to see if it works
        console.log('Testing recovered key with fresh data...');
        const testData = 'test data with recovered key';
        const testBytes = new TextEncoder().encode(testData);
        const testNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
        const testEncrypted = nacl.secretbox(testBytes, testNonce, entryKey);
        const testDecrypted = nacl.secretbox.open(testEncrypted, testNonce, entryKey);
        
        if (testDecrypted) {
          console.log('✅ Recovered key works for new data - original content is corrupted');
          console.log('Decrypted test:', new TextDecoder().decode(testDecrypted));
        } else {
          console.error('❌ Recovered key doesn\'t work even for new data');
        }
        
        // Let's also try using the original content nonce with fresh data
        console.log('Testing original content nonce with fresh data...');
        const testWithOriginalNonce = nacl.secretbox(testBytes, contentNonce, entryKey);
        const testDecryptedWithOriginalNonce = nacl.secretbox.open(testWithOriginalNonce, contentNonce, entryKey);
        
        if (testDecryptedWithOriginalNonce) {
          console.log('✅ Original nonce works - content data is definitely corrupted');
        } else {
          console.error('❌ Original nonce doesn\'t work with fresh data');
        }
        
      } else {
        console.log('✅ Content decrypted successfully');
        const entryJson = new TextDecoder().decode(decryptedContentBytes);
        console.log('Decrypted content:', entryJson);
      }
      
      // Clear the entry key
      KeyManager.clearKey(entryKey);
      
    } catch (error) {
      console.error('Test failed with error:', error);
    }
  }

  /**
   * Get current session (read-only)
   */
  getCurrentSession(): E2ESession | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  /**
   * Validate current session integrity
   */
  validateSession(): boolean {
    if (!this.currentSession || !this.currentSession.isUnlocked) {
      return false;
    }
    
    try {
      return KeyManager.validateKeyPair(this.currentSession.userKeyPair);
    } catch (error) {
      console.error('Session validation failed:', error);
      this.logout();
      return false;
    }
  }

  /**
   * Lock the current session (keep keys in memory but mark as locked)
   */
  lockSession(): void {
    if (this.currentSession) {
      this.currentSession.isUnlocked = false;
      this.sessionStore.set(this.currentSession);
    }
  }

  /**
   * Unlock session with password verification
   */
  unlockSession(password: string): boolean {
    if (!this.currentSession || this.currentSession.isUnlocked) {
      return false;
    }
    
    if (!password || typeof password !== 'string') {
      return false;
    }
    
    try {
      const stored = browser ? localStorage.getItem(this.STORAGE_KEY) : null;
      if (!stored) {
        return false;
      }
      
      const storedKeys: StoredUserKeys = JSON.parse(stored);
      const secretKey = KeyManager.decryptSecretKey(storedKeys.encryptedSecretKeyB64, password);
      
      if (!secretKey) {
        return false;
      }
      
      // Clear the test key
      KeyManager.clearKey(secretKey);
      
      this.currentSession.isUnlocked = true;
      this.sessionStore.set(this.currentSession);
      return true;
    } catch (error) {
      console.error('Session unlock failed:', error);
      return false;
    }
  }

  /**
   * Check if user has existing encryption keys in the database
   */
  async hasCloudEncryptionKeys(userId: string): Promise<boolean> {
    try {
      const { apiAuthService } = await import('./api-auth.service');
      
      if (!apiAuthService.isAuthenticated()) {
        console.log('Cannot check cloud keys: user not authenticated');
        return false;
      }

      const apiUrl = (import.meta.env.VITE_API_BASE_URL);
      const fullUrl = `${apiUrl}/users/${userId}`;
      console.log("Fetching from:", fullUrl);
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get user profile: ${response.status}`);
      }

      const result = await response.json();
      console.log('User profile data:', {
        public_key: result.data?.public_key ? 'present' : 'missing',
        encrypted_private_key: result.data?.encrypted_private_key ? 'present' : 'missing',
        user_id: userId
      });
      
      const hasKeys = !!(result.data?.public_key && result.data?.encrypted_private_key);
      
      console.log('Cloud encryption keys check:', hasKeys ? 'found' : 'not found');
      return hasKeys;
    } catch (error) {
      console.error('Failed to check cloud encryption keys:', error);
      return false;
    }
  }

  /**
   * Restore encryption keys from the cloud
   */
  async restoreKeysFromCloud(userId: string, password: string): Promise<boolean> {
    // Input validation
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      console.error('Invalid user ID provided');
      return false;
    }
    
    if (!password || typeof password !== 'string' || password.length === 0) {
      console.error('Invalid password provided');
      return false;
    }

    try {
      console.log('=== Restoring keys from cloud for user:', userId);
      
      const { apiAuthService } = await import('./api-auth.service');
      
      if (!apiAuthService.isAuthenticated()) {
        console.log('Cannot restore keys: user not authenticated');
        return false;
      }

      const apiUrl = (import.meta.env.VITE_API_BASE_URL);
      console.log('Fetching user profile from:', `${apiUrl}/users/${userId}`);

      const response = await fetch(`${apiUrl}/users/${userId}`, {
        method: 'GET',
        headers: {
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        console.error('API request failed:', response.status, response.statusText);
        throw new Error(`Failed to get user profile: ${response.status}`);
      }

      const result = await response.json();
      const userData = result.data;
      
      console.log('User profile fetched:', {
        hasPublicKey: !!userData?.public_key,
        hasEncryptedPrivateKey: !!userData?.encrypted_private_key,
        publicKeyLength: userData?.public_key?.length,
        encryptedPrivateKeyLength: userData?.encrypted_private_key?.length
      });
      
      if (!userData?.public_key || !userData?.encrypted_private_key) {
        console.log('No cloud encryption keys found in user profile');
        return false;
      }
      
      // Validate key formats (basic check for Base64)
      try {
        atob(userData.public_key);
        atob(userData.encrypted_private_key);
      } catch (error) {
        console.error('Invalid key format in cloud data');
        return false;
      }

      console.log('Attempting to decrypt private key with provided password...');
      
      // Try to decrypt the private key with the provided password
      const secretKey = KeyManager.decryptSecretKey(userData.encrypted_private_key, password);
      if (!secretKey) {
        console.error('Failed to decrypt private key - invalid password or corrupted key');
        return false;
      }

      console.log('Private key decrypted successfully');

      // Store the keys locally
      const storedKeys: StoredUserKeys = {
        encryptedSecretKeyB64: userData.encrypted_private_key,
        publicKeyB64: userData.public_key,
        userId
      };
      
      if (browser) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storedKeys));
        console.log('Keys stored in localStorage');
      }
      
      // Create active session
      const userKeyPair: UserKeyPair = {
        publicKey: KeyManager.publicKeyFromB64(userData.public_key),
        secretKey: secretKey
      };
      
      // Validate the restored key pair
      if (!KeyManager.validateKeyPair(userKeyPair)) {
        console.error('Restored key pair validation failed');
        KeyManager.clearKeyPair(userKeyPair);
        return false;
      }
      
      this.currentSession = {
        userId,
        userKeyPair,
        publicKeyB64: userData.public_key,
        isUnlocked: true
      };
      
      this.sessionStore.set(this.currentSession);
      
      console.log('=== Successfully restored encryption keys from cloud ===');
      console.log('Public key (first 20 chars):', userData.public_key.substring(0, 20));
      return true;
    } catch (error) {
      console.error('Failed to restore keys from cloud:', error);
      return false;
    }
  }

  /**
   * Update user's encryption keys in the backend database
   */
  private async updateUserEncryptionKeys(userId: string, publicKeyB64: string, encryptedPrivateKeyB64: string): Promise<void> {
    try {
      const { apiAuthService } = await import('./api-auth.service');
      
      if (!apiAuthService.isAuthenticated()) {
        console.log('Cannot update encryption keys: user not authenticated');
        return;
      }

      const apiUrl = (import.meta.env.VITE_API_BASE_URL);
      const fullUrl = `${apiUrl}/users/${userId}`;
      console.log("Fetching from:", fullUrl);
      const response = await fetch(fullUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...apiAuthService.getAuthHeaders()
        },
        body: JSON.stringify({
          public_key: publicKeyB64,
          encrypted_private_key: encryptedPrivateKeyB64
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to update encryption keys: ${response.status}`);
      }

      console.log('User encryption keys updated successfully');
    } catch (error) {
      console.error('Failed to update user encryption keys:', error);
    }
  }
}

// Export singleton instance
export const e2eEncryptionService = new E2EEncryptionService();

// Export store for reactive UI updates
export const e2eSessionStore = e2eEncryptionService.store;