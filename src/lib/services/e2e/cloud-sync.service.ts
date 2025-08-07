/**
 * E2E Cloud Synchronization Service
 * 
 * Handles backup and restoration of encryption keys to/from the cloud.
 * Manages backend API integration for encryption key storage.
 */

import { KeyManager, type UserKeyPairB64 } from '../../crypto/KeyManager.js';
import { fetch } from '../../utils/fetch.js';
import { sessionManager } from './session-manager.service.js';
import { e2eStorage } from './storage.service.js';
import type { StoredUserKeys } from './types.js';

/**
 * E2E Cloud Sync Service
 * 
 * Manages encryption key backup and restoration with backend services.
 */
export class E2ECloudSyncService {

  /**
   * Check if user has existing encryption keys in the cloud database
   * 
   * @param {string} userId - User identifier to check
   * @returns {Promise<boolean>} True if cloud keys exist
   */
  async hasCloudEncryptionKeys(userId: string): Promise<boolean> {
    try {
      const { apiAuthService } = await import('../api-auth.service.js');
      
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
   * Update user's encryption keys in the backend database
   * 
   * @param {string} userId - User identifier
   * @param {string} publicKeyB64 - Base64-encoded public key
   * @param {string} encryptedPrivateKeyB64 - Encrypted private key
   * @returns {Promise<boolean>} True if update successful
   */
  async updateUserEncryptionKeys(userId: string, publicKeyB64: string, encryptedPrivateKeyB64: string): Promise<boolean> {
    try {
      const { apiAuthService } = await import('../api-auth.service.js');
      
      if (!apiAuthService.isAuthenticated()) {
        console.log('Cannot update encryption keys: user not authenticated');
        return false;
      }

      const apiUrl = (import.meta.env.VITE_API_BASE_URL);
      const fullUrl = `${apiUrl}/users/${userId}`;
      console.log("Updating at:", fullUrl);
      
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
      return true;
    } catch (error) {
      console.error('Failed to update user encryption keys:', error);
      return false;
    }
  }

  /**
   * Backup current user's encryption keys to the cloud
   * 
   * Uploads the user's encrypted keys to the backend for backup/sync purposes.
   * Only backs up if the user doesn't already have keys in the cloud.
   * 
   * @param {string} userId - User identifier
   * @param {UserKeyPairB64} keyPair - User's key pair to backup
   * @param {string} password - User's password for encryption
   * @returns {Promise<boolean>} True if backup successful
   */
  async backupKeysToCloud(userId: string, keyPair: UserKeyPairB64, password: string): Promise<boolean> {
    // Input validation
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      console.error('Invalid user ID provided for backup');
      return false;
    }
    
    if (!keyPair?.publicKey || !keyPair?.secretKey) {
      console.error('Invalid key pair provided for backup');
      return false;
    }
    
    if (!password || typeof password !== 'string' || password.length === 0) {
      console.error('Invalid password provided for backup');
      return false;
    }

    try {
      // Check if user already has keys to avoid overwriting
      const hasExistingKeys = await this.hasCloudEncryptionKeys(userId);
      if (hasExistingKeys) {
        console.log('User already has encryption keys in cloud, skipping backup to prevent overwrite');
        return true; // Consider this successful since keys already exist
      }

      // Encrypt the secret key with the user's password
      const encryptedSecretKeyB64 = KeyManager.encryptSecretKey(keyPair.secretKey, password);
      
      // Upload to cloud
      const success = await this.updateUserEncryptionKeys(userId, keyPair.publicKey, encryptedSecretKeyB64);
      
      if (success) {
        console.log('Successfully backed up encryption keys to cloud');
        return true;
      } else {
        console.error('Failed to backup keys to cloud');
        return false;
      }
    } catch (error) {
      console.error('Key backup to cloud failed:', error);
      return false;
    }
  }

  /**
   * Restore encryption keys from the cloud
   * 
   * Downloads and decrypts user's encryption keys from the backend.
   * Stores them locally and creates an active session.
   * 
   * @param {string} userId - User identifier
   * @param {string} password - User's password for decryption
   * @returns {Promise<boolean>} True if restoration successful
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
      
      const { apiAuthService } = await import('../api-auth.service.js');
      
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
      
      e2eStorage.storeKeys(storedKeys);
      console.log('Keys stored locally');
      
      // Create active session
      const userKeyPair = {
        publicKey: KeyManager.publicKeyFromB64(userData.public_key),
        secretKey: secretKey
      };
      
      // Validate the restored key pair
      if (!KeyManager.validateKeyPair(userKeyPair)) {
        console.error('Restored key pair validation failed');
        KeyManager.clearKeyPair(userKeyPair);
        return false;
      }
      
      sessionManager.createSession(userId, userKeyPair, userData.public_key);
      
      console.log('=== Successfully restored encryption keys from cloud ===');
      console.log('Public key (first 20 chars):', userData.public_key.substring(0, 20));
      return true;
    } catch (error) {
      console.error('Failed to restore keys from cloud:', error);
      return false;
    }
  }

  /**
   * Sync local keys with cloud (bidirectional)
   * 
   * Attempts to synchronize encryption keys between local storage and cloud.
   * If local keys exist but cloud doesn't, backs up to cloud.
   * If cloud keys exist but local doesn't, restores from cloud.
   * 
   * @param {string} userId - User identifier
   * @param {string} password - User's password
   * @returns {Promise<'backup' | 'restore' | 'sync' | 'error'>} Sync operation performed
   */
  async syncKeys(userId: string, password: string): Promise<'backup' | 'restore' | 'sync' | 'error'> {
    try {
      const hasLocalKeys = e2eStorage.hasStoredKeys();
      const hasCloudKeys = await this.hasCloudEncryptionKeys(userId);

      console.log('Key sync status:', { hasLocalKeys, hasCloudKeys });

      if (hasLocalKeys && !hasCloudKeys) {
        // Backup local keys to cloud
        const localKeys = e2eStorage.getStoredKeys();
        if (!localKeys) {
          console.error('Local keys not found during sync');
          return 'error';
        }

        // Convert stored keys to KeyPair format for backup
        const secretKey = KeyManager.decryptSecretKey(localKeys.encryptedSecretKeyB64, password);
        if (!secretKey) {
          console.error('Failed to decrypt local keys for backup');
          return 'error';
        }

        const keyPair: UserKeyPairB64 = {
          publicKey: localKeys.publicKeyB64,
          secretKey: KeyManager.secretKeyToB64(secretKey)
        };

        KeyManager.clearKey(secretKey);

        const backupSuccess = await this.backupKeysToCloud(userId, keyPair, password);
        return backupSuccess ? 'backup' : 'error';

      } else if (!hasLocalKeys && hasCloudKeys) {
        // Restore keys from cloud
        const restoreSuccess = await this.restoreKeysFromCloud(userId, password);
        return restoreSuccess ? 'restore' : 'error';

      } else if (hasLocalKeys && hasCloudKeys) {
        // Both exist - they should be in sync already
        console.log('Keys exist in both locations - assuming synchronized');
        return 'sync';

      } else {
        // Neither exists - this is unusual for a sync operation
        console.log('No keys found in either location during sync');
        return 'error';
      }
    } catch (error) {
      console.error('Key synchronization failed:', error);
      return 'error';
    }
  }

  /**
   * Delete encryption keys from cloud
   * 
   * @param {string} userId - User identifier
   * @returns {Promise<boolean>} True if deletion successful
   */
  async deleteCloudKeys(userId: string): Promise<boolean> {
    try {
      const { apiAuthService } = await import('../api-auth.service.js');
      
      if (!apiAuthService.isAuthenticated()) {
        console.log('Cannot delete cloud keys: user not authenticated');
        return false;
      }

      // Update user profile to remove encryption keys
      const success = await this.updateUserEncryptionKeys(userId, '', '');
      
      if (success) {
        console.log('Successfully deleted encryption keys from cloud');
        return true;
      } else {
        console.error('Failed to delete keys from cloud');
        return false;
      }
    } catch (error) {
      console.error('Failed to delete cloud keys:', error);
      return false;
    }
  }
}

// Export singleton instance
export const e2eCloudSync = new E2ECloudSyncService();