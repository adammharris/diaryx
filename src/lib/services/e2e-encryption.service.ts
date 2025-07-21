/**
 * End-to-End Encryption Service
 * Integrates KeyManager and EntryCryptor with the application
 * Handles user flows: signup, login, entry creation, sharing, and reading
 */

import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import { KeyManager, type UserKeyPair, type UserKeyPairB64 } from '../crypto/KeyManager.js';
import { EntryCryptor, type EntryObject, type EncryptedEntryData } from '../crypto/EntryCryptor.js';

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
      
      this.currentSession = {
        userId,
        userKeyPair,
        publicKeyB64: keyPair.publicKey,
        isUnlocked: true
      };
      
      this.sessionStore.set(this.currentSession);
      
      // Update user profile with public key in the backend
      this.updateUserPublicKey(userId, keyPair.publicKey);
      
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
    try {
      const stored = browser ? localStorage.getItem(this.STORAGE_KEY) : null;
      if (!stored) {
        console.error('No stored keys found');
        return false;
      }

      const storedKeys: StoredUserKeys = JSON.parse(stored);
      
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
  encryptEntry(entryObject: EntryObject): EncryptedEntryData | null {
    if (!this.currentSession || !this.currentSession.isUnlocked) {
      console.error('Cannot encrypt entry - session not unlocked');
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

    try {
      const authorPublicKey = KeyManager.publicKeyFromB64(authorPublicKeyB64);
      return EntryCryptor.decryptEntry(
        encryptedData,
        this.currentSession.userKeyPair.secretKey,
        authorPublicKey
      );
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
    try {
      const stored = browser ? localStorage.getItem(this.STORAGE_KEY) : null;
      if (!stored) {
        console.error('No stored keys found');
        return false;
      }

      const storedKeys: StoredUserKeys = JSON.parse(stored);
      
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
   * Get current session (read-only)
   */
  getCurrentSession(): E2ESession | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  /**
   * Update user's public key in the backend database
   */
  private async updateUserPublicKey(userId: string, publicKeyB64: string): Promise<void> {
    try {
      const { apiAuthService } = await import('./api-auth.service');
      
      if (!apiAuthService.isAuthenticated()) {
        console.log('Cannot update public key: user not authenticated');
        return;
      }

      const apiUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
      const response = await fetch(`${apiUrl}/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...apiAuthService.getAuthHeaders()
        },
        body: JSON.stringify({
          public_key: publicKeyB64
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to update public key: ${response.status}`);
      }

      console.log('User public key updated successfully');
    } catch (error) {
      console.error('Failed to update user public key:', error);
    }
  }
}

// Export singleton instance
export const e2eEncryptionService = new E2EEncryptionService();

// Export store for reactive UI updates
export const e2eSessionStore = e2eEncryptionService.store;