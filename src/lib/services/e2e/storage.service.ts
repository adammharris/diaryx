/**
 * E2E Encryption Storage Service
 * 
 * Handles local storage operations for encrypted user keys.
 * Manages localStorage read/write operations and data validation.
 */

import { browser } from '$app/environment';
import type { StoredUserKeys, E2ESession } from './types.js';

/**
 * E2E Storage Service
 * 
 * Manages encrypted key storage in localStorage.
 */
export class E2EStorageService {
  private readonly STORAGE_KEY = 'diaryx_user_keys';

  /**
   * Initialize session from stored encrypted keys if available
   * 
   * Attempts to restore a locked session from localStorage.
   * The session remains locked until the user provides their password.
   * 
   * @returns {Partial<E2ESession> | null} Partial session data or null if none found
   */
  initializeFromStorage(): Partial<E2ESession> | null {
    if (!browser) return null;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return null;

      const storedKeys: StoredUserKeys = JSON.parse(stored);
      
      // Validate stored data structure
      if (!storedKeys.userId || !storedKeys.publicKeyB64 || !storedKeys.encryptedSecretKeyB64) {
        console.error('Invalid stored keys structure, clearing...');
        this.clearStoredKeys();
        return null;
      }

      // Return partial session (locked until password provided)
      return {
        userId: storedKeys.userId,
        publicKeyB64: storedKeys.publicKeyB64,
        isUnlocked: false
      };
    } catch (error) {
      console.error('Failed to initialize from storage:', error);
      this.clearStoredKeys();
      return null;
    }
  }

  /**
   * Store encrypted user keys in localStorage
   * 
   * @param {StoredUserKeys} storedKeys - The keys to store
   */
  storeKeys(storedKeys: StoredUserKeys): void {
    if (!browser) return;

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storedKeys));
    } catch (error) {
      console.error('Failed to store keys:', error);
      throw error;
    }
  }

  /**
   * Get stored keys from localStorage
   * 
   * @returns {StoredUserKeys | null} Stored keys or null if not found/invalid
   */
  getStoredKeys(): StoredUserKeys | null {
    if (!browser) return null;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return null;

      const storedKeys: StoredUserKeys = JSON.parse(stored);
      
      // Validate structure
      if (!storedKeys.userId || !storedKeys.publicKeyB64 || !storedKeys.encryptedSecretKeyB64) {
        console.error('Invalid stored keys structure');
        return null;
      }

      return storedKeys;
    } catch (error) {
      console.error('Failed to get stored keys:', error);
      return null;
    }
  }

  /**
   * Update stored keys (e.g., for password changes or biometric setup)
   * 
   * @param {Partial<StoredUserKeys>} updates - Updates to apply
   * @returns {boolean} True if update successful
   */
  updateStoredKeys(updates: Partial<StoredUserKeys>): boolean {
    if (!browser) return false;

    try {
      const existing = this.getStoredKeys();
      if (!existing) return false;

      const updatedKeys: StoredUserKeys = {
        ...existing,
        ...updates
      };

      this.storeKeys(updatedKeys);
      return true;
    } catch (error) {
      console.error('Failed to update stored keys:', error);
      return false;
    }
  }

  /**
   * Clear all stored keys (for account deletion or reset)
   * 
   * Permanently removes all stored encryption keys.
   */
  clearStoredKeys(): void {
    if (browser) {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  /**
   * Check if user has stored keys
   * 
   * @returns {boolean} True if stored keys exist
   */
  hasStoredKeys(): boolean {
    if (!browser) return false;
    const stored = localStorage.getItem(this.STORAGE_KEY);
    return !!stored;
  }

  /**
   * Check if biometric authentication is enabled
   * 
   * @returns {boolean} True if biometric auth is enabled
   */
  isBiometricEnabled(): boolean {
    if (!browser) return false;
    
    try {
      const storedKeys = this.getStoredKeys();
      if (!storedKeys) return false;

      return storedKeys.biometricEnabled === true && !!storedKeys.encryptedPasswordB64;
    } catch (error) {
      console.error('Failed to check biometric status:', error);
      return false;
    }
  }

  /**
   * Enable biometric authentication by updating stored keys
   * 
   * @param {string} encryptedPasswordB64 - Encrypted password for biometric auth
   * @returns {boolean} True if successfully enabled
   */
  enableBiometric(encryptedPasswordB64: string): boolean {
    return this.updateStoredKeys({
      biometricEnabled: true,
      encryptedPasswordB64
    });
  }

  /**
   * Disable biometric authentication
   * 
   * @returns {boolean} True if successfully disabled
   */
  disableBiometric(): boolean {
    if (!browser) return false;

    try {
      const storedKeys = this.getStoredKeys();
      if (!storedKeys) return false;

      // Remove biometric fields
      const updatedKeys: StoredUserKeys = {
        encryptedSecretKeyB64: storedKeys.encryptedSecretKeyB64,
        publicKeyB64: storedKeys.publicKeyB64,
        userId: storedKeys.userId
      };

      this.storeKeys(updatedKeys);
      return true;
    } catch (error) {
      console.error('Failed to disable biometric authentication:', error);
      return false;
    }
  }

  /**
   * Get the storage key (for debugging purposes)
   */
  getStorageKey(): string {
    return this.STORAGE_KEY;
  }
}

// Export singleton instance
export const e2eStorage = new E2EStorageService();