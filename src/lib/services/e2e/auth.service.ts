/**
 * E2E Authentication Service
 * 
 * Handles user authentication flows including signup, login, and password management.
 * Manages cryptographic key generation and user credential validation.
 */

import { browser } from '$app/environment';
import { KeyManager, type UserKeyPairB64 } from '../../crypto/KeyManager.js';
import { sessionManager } from './session-manager.service.js';
import { e2eStorage } from './storage.service.js';
import type { StoredUserKeys } from './types.js';

/**
 * E2E Authentication Service
 * 
 * Manages user signup, login, and password operations with encryption keys.
 */
export class E2EAuthService {

  /**
   * Generate new user keys during signup
   * 
   * Creates a new cryptographic key pair for the user.
   * This should only be called during initial user registration.
   * 
   * @returns {UserKeyPairB64} Base64-encoded public and secret key pair
   */
  generateUserKeys(): UserKeyPairB64 {
    return KeyManager.generateUserKeysB64();
  }

  /**
   * Complete user signup - store encrypted keys locally
   * 
   * Finalizes user registration by encrypting and storing the user's key pair.
   * The secret key is encrypted with the user's password before storage.
   * 
   * @param {string} userId - Unique identifier for the user
   * @param {UserKeyPairB64} keyPair - Base64-encoded key pair from generateUserKeys()
   * @param {string} password - User's password (minimum 8 characters)
   * @returns {Promise<boolean>} True if signup completed successfully
   */
  async completeSignup(userId: string, keyPair: UserKeyPairB64, password: string): Promise<boolean> {
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
      
      e2eStorage.storeKeys(storedKeys);
      
      // Create active session
      const userKeyPair = {
        publicKey: KeyManager.publicKeyFromB64(keyPair.publicKey),
        secretKey: KeyManager.secretKeyFromB64(keyPair.secretKey)
      };
      
      // Validate the key pair works
      if (!KeyManager.validateKeyPair(userKeyPair)) {
        console.error('Generated key pair validation failed');
        KeyManager.clearKeyPair(userKeyPair);
        return false;
      }
      
      sessionManager.createSession(userId, userKeyPair, keyPair.publicKey);
      
      return true;
    } catch (error) {
      console.error('Signup completion failed:', error);
      return false;
    }
  }

  /**
   * Login with password - decrypt stored keys
   * 
   * Authenticates the user and unlocks their encryption session.
   * Decrypts the stored secret key using the provided password.
   * 
   * @param {string} password - User's password
   * @returns {boolean} True if login successful and session unlocked
   */
  login(password: string): boolean {
    // Input validation
    if (!password || typeof password !== 'string' || password.length === 0) {
      console.error('Invalid password provided');
      return false;
    }

    try {
      const storedKeys = e2eStorage.getStoredKeys();
      if (!storedKeys) {
        console.error('No stored keys found');
        return false;
      }
      
      // Decrypt the secret key
      const secretKey = KeyManager.decryptSecretKey(storedKeys.encryptedSecretKeyB64, password);
      if (!secretKey) {
        console.error('Failed to decrypt secret key - wrong password?');
        return false;
      }
      
      // Create active session
      const userKeyPair = {
        publicKey: KeyManager.publicKeyFromB64(storedKeys.publicKeyB64),
        secretKey
      };
      
      // Validate the key pair works
      if (!KeyManager.validateKeyPair(userKeyPair)) {
        console.error('Invalid key pair after decryption');
        KeyManager.clearKeyPair(userKeyPair);
        return false;
      }
      
      sessionManager.createSession(storedKeys.userId, userKeyPair, storedKeys.publicKeyB64);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }

  /**
   * Change password - re-encrypt stored secret key
   * 
   * Changes the user's password by re-encrypting the stored secret key.
   * Requires the current password for verification.
   * 
   * @param {string} oldPassword - Current password
   * @param {string} newPassword - New password (minimum 8 characters)
   * @returns {boolean} True if password change successful
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
      const storedKeys = e2eStorage.getStoredKeys();
      if (!storedKeys) {
        console.error('No stored keys found');
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
      const success = e2eStorage.updateStoredKeys({
        encryptedSecretKeyB64: newEncryptedSecretKeyB64
      });
      
      // Clear old secret key from memory
      KeyManager.clearKey(secretKey);
      
      if (!success) {
        console.error('Failed to update stored keys');
        return false;
      }
      
      // Update session if currently unlocked
      const currentSession = sessionManager.getCurrentSession();
      if (currentSession && currentSession.isUnlocked) {
        // Re-validate current session after password change
        if (!sessionManager.validateSession()) {
          console.error('Session validation failed after password change');
          sessionManager.logout();
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
   * Logout - clear session
   * 
   * Clears the current session and sensitive data.
   */
  logout(): void {
    sessionManager.logout();
  }

  /**
   * Check if user has stored keys
   * 
   * @returns {boolean} True if stored keys exist
   */
  hasStoredKeys(): boolean {
    return e2eStorage.hasStoredKeys();
  }

  /**
   * Clear all stored keys (for account deletion or reset)
   * 
   * Permanently removes all stored encryption keys and session data.
   * This is irreversible and should only be used for account deletion or reset.
   */
  clearStoredKeys(): void {
    e2eStorage.clearStoredKeys();
    sessionManager.logout();
  }

  /**
   * Validate password format
   * 
   * @param {string} password - Password to validate
   * @returns {Object} Validation result with details
   */
  validatePassword(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!password || typeof password !== 'string') {
      errors.push('Password is required');
    } else {
      if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
      }
      
      // Add more validation rules as needed
      // if (!/[A-Z]/.test(password)) {
      //   errors.push('Password must contain at least one uppercase letter');
      // }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get authentication status
   * 
   * @returns {Object} Current authentication state
   */
  getAuthStatus(): {
    hasStoredKeys: boolean;
    hasSession: boolean;
    isUnlocked: boolean;
    userId: string | null;
  } {
    const sessionStatus = sessionManager.getSessionStatus();
    
    return {
      hasStoredKeys: sessionStatus.hasStoredKeys,
      hasSession: sessionStatus.hasSession,
      isUnlocked: sessionStatus.isUnlocked,
      userId: sessionStatus.userId
    };
  }
}

// Export singleton instance
export const e2eAuth = new E2EAuthService();