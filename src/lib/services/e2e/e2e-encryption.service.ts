/**
 * End-to-End Encryption Service
 * 
 * Main E2E encryption service that integrates all E2E modules.
 * Provides the primary API for encryption/decryption operations and user flows.
 * 
 * @description This service acts as the main facade for the E2E encryption system,
 * coordinating between authentication, session management, storage, biometrics, cloud sync,
 * and debug utilities. It provides the core encryption/decryption methods and maintains
 * backward compatibility with the original service interface.
 */

import { KeyManager, type UserKeyPairB64 } from '../../crypto/KeyManager.js';
import { EntryCryptor, type EntryObject, type EncryptedEntryData } from '../../crypto/EntryCryptor.js';
import { decodeBase64 } from 'tweetnacl-util';
import nacl from 'tweetnacl';

// Import all E2E modules
import { sessionManager } from './session-manager.service.js';
import { e2eAuth } from './auth.service.js';
import { e2eBiometric } from './biometric.service.js';
import { e2eCloudSync } from './cloud-sync.service.js';
import { e2eDebug } from './debug.service.js';

/**
 * End-to-End Encryption Service
 * 
 * Main service class that coordinates all E2E encryption functionality.
 */
export class E2EEncryptionService {

  constructor() {
    // No initialization needed - modules handle their own setup
  }

  // ============================================================================
  // CORE ENCRYPTION/DECRYPTION METHODS
  // ============================================================================

  /**
   * Encrypt a new entry for the current user
   * 
   * @param {EntryObject} entryObject - The entry data to encrypt
   * @returns {EncryptedEntryData | null} Encrypted entry data or null if failed
   */
  encryptEntry(entryObject: EntryObject): EncryptedEntryData | null {
    const session = sessionManager.getCurrentSession();
    if (!session || !session.isUnlocked) {
      console.error('Cannot encrypt entry - session not unlocked');
      return null;
    }
    
    if (!entryObject || typeof entryObject !== 'object') {
      console.error('Invalid entry object provided');
      return null;
    }

    try {
      return EntryCryptor.encryptEntry(entryObject, session.userKeyPair);
    } catch (error) {
      console.error('Entry encryption failed:', error);
      return null;
    }
  }

  /**
   * Encrypt an entry with an existing entry key (for updates)
   * 
   * @param {EntryObject} entryObject - The entry data to encrypt
   * @param {string} existingEncryptedEntryKeyB64 - Existing encrypted entry key
   * @param {string} existingKeyNonceB64 - Existing key nonce
   * @returns {Promise<EncryptedEntryData | null>} Encrypted entry data or null if failed
   */
  async encryptEntryWithExistingKey(
    entryObject: EntryObject, 
    existingEncryptedEntryKeyB64: string, 
    existingKeyNonceB64: string
  ): Promise<EncryptedEntryData | null> {
    const session = sessionManager.getCurrentSession();
    if (!session || !session.isUnlocked) {
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
        session.userKeyPair.publicKey,
        session.userKeyPair.secretKey
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

  /**
   * Decrypt an entry (owned or shared)
   * 
   * @param {EncryptedEntryData} encryptedData - The encrypted entry data
   * @param {string} authorPublicKeyB64 - Public key of the entry's author
   * @returns {EntryObject | null} Decrypted entry object or null if failed
   */
  decryptEntry(encryptedData: EncryptedEntryData, authorPublicKeyB64: string): EntryObject | null {
    const session = sessionManager.getCurrentSession();
    if (!session || !session.isUnlocked) {
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
      console.log('Current user secret key length:', session.userKeyPair.secretKey.length);
      console.log('Current user public key:', session.publicKeyB64);
      console.log('Author public key B64:', authorPublicKeyB64);
      console.log('Is self-encrypted entry:', session.publicKeyB64 === authorPublicKeyB64);
      
      // Quick validation test - encrypt and decrypt a test entry to verify the system works
      if (session.publicKeyB64 === authorPublicKeyB64) {
        console.log('=== Running encryption system validation test ===');
        try {
          const testEntry = { title: 'Test', content: 'Test content' };
          const testEncrypted = EntryCryptor.encryptEntry(testEntry, session.userKeyPair);
          const testDecrypted = EntryCryptor.decryptEntry(
            testEncrypted,
            session.userKeyPair.secretKey,
            session.userKeyPair.publicKey
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
        session.userKeyPair.secretKey,
        authorPublicKey
      );
      
      console.log('=== E2E Service Decryption Result ===');
      console.log('Decryption result:', result ? 'success' : 'failed');
      
      if (!result) {
        console.log('=== Running specific data test on failed decryption ===');
        e2eDebug.testSpecificEncryptionData(encryptedData, authorPublicKeyB64);
      }
      
      return result;
    } catch (error) {
      console.error('Entry decryption failed:', error);
      return null;
    }
  }

  /**
   * Re-wrap an entry key for sharing with another user
   * 
   * @param {string} encryptedEntryKey - The encrypted entry key to re-wrap
   * @param {string} keyNonce - The nonce used with the entry key
   * @param {string} recipientPublicKeyB64 - Public key of the recipient user
   * @returns {Object | null} New encrypted key and nonce for recipient, or null if failed
   */
  rewrapEntryKeyForUser(
    encryptedEntryKey: string,
    keyNonce: string,
    recipientPublicKeyB64: string
  ): { encryptedEntryKeyB64: string; keyNonceB64: string } | null {
    const session = sessionManager.getCurrentSession();
    if (!session || !session.isUnlocked) {
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
        session.userKeyPair,
        recipientPublicKey
      );
    } catch (error) {
      console.error('Entry key rewrapping failed:', error);
      return null;
    }
  }

  /**
   * Generate content hashes for indexing
   * 
   * @param {EntryObject} entryObject - The entry to generate hashes for
   * @returns {Object} Object containing title, content, and preview hashes
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
   * 
   * @returns {Record<string, any>} Encryption metadata object
   */
  createEncryptionMetadata(): Record<string, any> {
    return EntryCryptor.createEncryptionMetadata();
  }

  /**
   * Validate encrypted entry data structure
   * 
   * @param {any} data - Data to validate
   * @returns {boolean} True if data is valid EncryptedEntryData
   */
  validateEncryptedEntryData(data: any): data is EncryptedEntryData {
    return EntryCryptor.validateEncryptedEntryData(data);
  }

  // ============================================================================
  // AUTHENTICATION METHODS (delegate to auth service)
  // ============================================================================

  generateUserKeys(): UserKeyPairB64 {
    return e2eAuth.generateUserKeys();
  }

  async completeSignup(userId: string, keyPair: UserKeyPairB64, password: string): Promise<boolean> {
    const result = await e2eAuth.completeSignup(userId, keyPair, password);
    
    if (result) {
      // After successful signup, optionally backup to cloud
      try {
        const hasExistingKeys = await e2eCloudSync.hasCloudEncryptionKeys(userId);
        if (!hasExistingKeys) {
          console.log('First-time signup: storing encryption keys in backend');
          await e2eCloudSync.backupKeysToCloud(userId, keyPair, password);
        } else {
          console.log('User already has encryption keys in backend, skipping backup');
        }
      } catch (error) {
        console.error('Failed to backup keys to cloud after signup:', error);
        // Don't fail the signup if cloud backup fails
      }
    }
    
    return result;
  }

  login(password: string): boolean {
    return e2eAuth.login(password);
  }

  logout(): void {
    e2eAuth.logout();
  }

  changePassword(oldPassword: string, newPassword: string): boolean {
    return e2eAuth.changePassword(oldPassword, newPassword);
  }

  hasStoredKeys(): boolean {
    return e2eAuth.hasStoredKeys();
  }

  clearStoredKeys(): void {
    e2eAuth.clearStoredKeys();
  }

  // ============================================================================
  // SESSION METHODS (delegate to session manager)
  // ============================================================================

  isUnlocked(): boolean {
    return sessionManager.isUnlocked();
  }

  getCurrentPublicKey(): string | null {
    return sessionManager.getCurrentPublicKey();
  }

  getCurrentUserId(): string | null {
    return sessionManager.getCurrentUserId();
  }

  getCurrentSession() {
    return sessionManager.getCurrentSession();
  }

  validateSession(): boolean {
    return sessionManager.validateSession();
  }

  lockSession(): void {
    sessionManager.lockSession();
  }

  unlockSession(password: string): boolean {
    return sessionManager.unlockSession(password);
  }

  get store() {
    return sessionManager.store;
  }

  // ============================================================================
  // BIOMETRIC METHODS (delegate to biometric service)
  // ============================================================================

  async isBiometricAvailable(): Promise<boolean> {
    return e2eBiometric.isBiometricAvailable();
  }

  isBiometricEnabled(): boolean {
    return e2eBiometric.isBiometricEnabled();
  }

  async enableBiometric(password: string): Promise<boolean> {
    return e2eBiometric.enableBiometric(password);
  }

  disableBiometric(): boolean {
    return e2eBiometric.disableBiometric();
  }

  async loginWithBiometric(): Promise<boolean> {
    return e2eBiometric.loginWithBiometric();
  }

  getBiometricInfo() {
    return e2eBiometric.getBiometricInfo();
  }

  // ============================================================================
  // CLOUD SYNC METHODS (delegate to cloud sync service)
  // ============================================================================

  async hasCloudEncryptionKeys(userId: string): Promise<boolean> {
    return e2eCloudSync.hasCloudEncryptionKeys(userId);
  }

  async restoreKeysFromCloud(userId: string, password: string): Promise<boolean> {
    return e2eCloudSync.restoreKeysFromCloud(userId, password);
  }

  // ============================================================================
  // DEBUG METHODS (delegate to debug service)
  // ============================================================================

  debugCompareEncryptedData(sentData: EncryptedEntryData, receivedData: EncryptedEntryData): void {
    e2eDebug.debugCompareEncryptedData(sentData, receivedData);
  }

  testEncryptionRoundTrip(): boolean {
    return e2eDebug.testEncryptionRoundTrip();
  }

  analyzeFailedDecryption(encryptedData: EncryptedEntryData, authorPublicKeyB64: string): void {
    e2eDebug.analyzeFailedDecryption(encryptedData, authorPublicKeyB64);
  }

  testSpecificEncryptionData(encryptedData: EncryptedEntryData, authorPublicKeyB64: string): void {
    e2eDebug.testSpecificEncryptionData(encryptedData, authorPublicKeyB64);
  }
}

// Export singleton instance
export const e2eEncryptionService = new E2EEncryptionService();

// Export store for reactive UI updates
export const e2eSessionStore = sessionManager.store;