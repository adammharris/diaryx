/**
 * Entry Sharing Service
 * Handles multi-user key encryption for shared entries
 */

import { writable, type Writable } from 'svelte/store';
import { fetch } from '../utils/fetch.js';
import { apiAuthService } from './api-auth.service.js';
import { e2eEncryptionService } from './e2e-encryption.service.js';
import { tagService, type Tag } from './tag.service.js';
import { userSearchService, type SearchableUser } from './user-search.service.js';

export interface EntryAccessKey {
  id: string;
  entry_id: string;
  user_id: string;
  encrypted_entry_key: string;
  key_nonce: string;
  created_at: string;
  // Populated via joins
  user?: SearchableUser;
}

export interface ShareEntryData {
  entryId: string;
  tagIds: string[];
  encryptedEntryKey: string;
  keyNonce: string;
}

export interface SharedEntryInfo {
  entryId: string;
  sharedWithUsers: SearchableUser[];
  tags: Tag[];
  accessKeys: EntryAccessKey[];
}

class EntrySharingService {
  private readonly API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  private accessKeysStore: Writable<Map<string, EntryAccessKey[]>> = writable(new Map());

  constructor() {
    // Initialize stores when authenticated
    this.initializeStores();
  }

  private async initializeStores(): Promise<void> {
    if (apiAuthService.isAuthenticated()) {
      try {
        await this.loadUserAccessKeys();
      } catch (error) {
        console.error('Failed to initialize sharing stores:', error);
      }
    }
  }

  /**
   * Share an entry with users through tags
   * This is the main function called when publishing an entry
   */
  async shareEntry(shareData: ShareEntryData): Promise<void> {
    if (!apiAuthService.isAuthenticated()) {
      throw new Error('User must be authenticated to share entries');
    }

    if (!e2eEncryptionService.isUnlocked()) {
      throw new Error('E2E encryption must be unlocked to share entries');
    }

    if (!shareData.entryId || !shareData.tagIds.length) {
      throw new Error('Entry ID and at least one tag are required');
    }

    try {
      console.log('=== Starting Entry Sharing Process ===');
      console.log('Entry ID:', shareData.entryId);
      console.log('Tag IDs:', shareData.tagIds);

      // Get all users assigned to the specified tags
      const allUsersToShareWith = new Map<string, SearchableUser>();
      
      for (const tagId of shareData.tagIds) {
        const usersForTag = await tagService.getTagAssignments(tagId);
        console.log(`Tag ${tagId} assigned to ${usersForTag.length} users`);
        
        for (const user of usersForTag) {
          if (!allUsersToShareWith.has(user.id)) {
            allUsersToShareWith.set(user.id, user);
          }
        }
      }

      // CRITICAL: Always include the author/current user so they can later share the entry
      const currentUser = apiAuthService.getCurrentUser();
      if (currentUser && !allUsersToShareWith.has(currentUser.id)) {
        console.log(`Adding entry author ${currentUser.id} to recipients list`);
        allUsersToShareWith.set(currentUser.id, {
          id: currentUser.id,
          username: currentUser.email || currentUser.id,
          email: currentUser.email || '', 
          public_key: currentUser.public_key || '',
          display_name: currentUser.email || currentUser.id,
          discoverable: true
        });
      }

      const uniqueUsers = Array.from(allUsersToShareWith.values());
      console.log(`Total unique users to share with (including author): ${uniqueUsers.length}`);

      if (uniqueUsers.length === 0) {
        console.log('No users to share with, skipping key generation');
        return;
      }

      // Generate encrypted entry keys for each user
      const keyGenerationPromises = uniqueUsers.map(async (user) => {
        if (!user.public_key) {
          console.warn(`User ${user.id} does not have a public key, skipping`);
          return null;
        }

        try {
          // Use the e2e encryption service to rewrap the key for this user
          const rewrappedKey = e2eEncryptionService.rewrapEntryKeyForUser(
            shareData.encryptedEntryKey,
            shareData.keyNonce,
            user.public_key
          );

          if (!rewrappedKey) {
            console.error(`Failed to rewrap key for user ${user.id}`);
            return null;
          }

          return {
            userId: user.id,
            encryptedEntryKey: rewrappedKey.encryptedEntryKeyB64,
            keyNonce: rewrappedKey.keyNonceB64
          };
        } catch (error) {
          console.error(`Error rewrapping key for user ${user.id}:`, error);
          return null;
        }
      });

      const keyResults = await Promise.all(keyGenerationPromises);
      const validKeys = keyResults.filter(Boolean);

      console.log(`Successfully generated ${validKeys.length} encrypted keys`);

      if (validKeys.length === 0) {
        console.warn('No valid encrypted keys generated');
        return;
      }

      // Store the encrypted keys in the database
      await this.storeEntryAccessKeys(shareData.entryId, validKeys);

      console.log('=== Entry Sharing Process Complete ===');
    } catch (error) {
      console.error('Entry sharing failed:', error);
      throw error;
    }
  }

  /**
   * Store encrypted entry keys in the database
   */
  private async storeEntryAccessKeys(
    entryId: string, 
    keys: Array<{ userId: string; encryptedEntryKey: string; keyNonce: string }>
  ): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/entry-access-keys/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...apiAuthService.getAuthHeaders()
        },
        body: JSON.stringify({
          entry_id: entryId,
          access_keys: keys.map(key => ({
            user_id: key.userId,
            encrypted_entry_key: key.encryptedEntryKey,
            key_nonce: key.keyNonce
          }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to store access keys: ${response.status}`);
      }

      console.log(`Successfully stored ${keys.length} access keys for entry ${entryId}`);
    } catch (error) {
      console.error('Failed to store entry access keys:', error);
      throw error;
    }
  }

  /**
   * Get entry access key for current user
   */
  async getEntryAccessKey(entryId: string): Promise<EntryAccessKey | null> {
    if (!apiAuthService.isAuthenticated()) {
      return null;
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/entry-access-keys/${entryId}`, {
        method: 'GET',
        headers: {
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null; // User doesn't have access to this entry
        }
        throw new Error(`Failed to get entry access key: ${response.status}`);
      }

      const result = await response.json();
      return result.data as EntryAccessKey;
    } catch (error) {
      console.error('Failed to get entry access key:', error);
      return null;
    }
  }

  /**
   * Get all users who have access to an entry (for entry authors)
   */
  async getEntrySharedUsers(entryId: string): Promise<SharedEntryInfo | null> {
    if (!apiAuthService.isAuthenticated()) {
      return null;
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/entries/${entryId}/shared`, {
        method: 'GET',
        headers: {
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to get entry sharing info: ${response.status}`);
      }

      const result = await response.json();
      return result.data as SharedEntryInfo;
    } catch (error) {
      console.error('Failed to get entry sharing info:', error);
      return null;
    }
  }

  /**
   * Revoke access to an entry for a specific user
   */
  async revokeEntryAccess(entryId: string, userId: string): Promise<void> {
    if (!apiAuthService.isAuthenticated()) {
      throw new Error('User must be authenticated to revoke access');
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/entry-access-keys/${entryId}/${userId}`, {
        method: 'DELETE',
        headers: {
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to revoke access: ${response.status}`);
      }

      console.log(`Successfully revoked access for user ${userId} to entry ${entryId}`);
    } catch (error) {
      console.error('Failed to revoke entry access:', error);
      throw error;
    }
  }

  /**
   * Update entry sharing when tags are modified
   */
  async updateEntrySharing(entryId: string, newTagIds: string[]): Promise<void> {
    if (!apiAuthService.isAuthenticated()) {
      throw new Error('User must be authenticated to update sharing');
    }

    if (!e2eEncryptionService.isUnlocked()) {
      throw new Error('E2E encryption must be unlocked to update sharing');
    }

    try {
      // Get current sharing info
      const currentSharing = await this.getEntrySharedUsers(entryId);
      if (!currentSharing) {
        console.log('Entry not currently shared, treating as new share');
        return;
      }

      // Get the entry's current encrypted key (we'll need this to share with new users)
      const currentUser = apiAuthService.getCurrentUser();
      if (!currentUser) {
        throw new Error('No current user found');
      }

      // For now, we'll require the entry to be re-shared completely
      // A more sophisticated implementation could do incremental updates
      console.log('Entry sharing update requires re-sharing with new tag configuration');
      
      // This would typically be called as part of the entry update process
      // where the encrypted entry key is already available
    } catch (error) {
      console.error('Failed to update entry sharing:', error);
      throw error;
    }
  }

  /**
   * Load access keys for entries the current user has access to
   */
  async loadUserAccessKeys(): Promise<void> {
    if (!apiAuthService.isAuthenticated()) {
      return;
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/entry-access-keys`, {
        method: 'GET',
        headers: {
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load access keys: ${response.status}`);
      }

      const result = await response.json();
      const accessKeys = result.data as EntryAccessKey[];

      // Group access keys by entry ID
      const keysByEntry = new Map<string, EntryAccessKey[]>();
      for (const key of accessKeys) {
        if (!keysByEntry.has(key.entry_id)) {
          keysByEntry.set(key.entry_id, []);
        }
        keysByEntry.get(key.entry_id)!.push(key);
      }

      this.accessKeysStore.set(keysByEntry);
    } catch (error) {
      console.error('Failed to load user access keys:', error);
      this.accessKeysStore.set(new Map());
    }
  }

  /**
   * Check if current user has access to an entry
   */
  async hasEntryAccess(entryId: string): Promise<boolean> {
    try {
      const accessKey = await this.getEntryAccessKey(entryId);
      return !!accessKey;
    } catch (error) {
      console.error('Failed to check entry access:', error);
      return false;
    }
  }

  /**
   * Get entries shared with the current user
   */
  async getSharedEntries(): Promise<string[]> {
    if (!apiAuthService.isAuthenticated()) {
      return [];
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/entries/shared-with-me`, {
        method: 'GET',
        headers: {
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get shared entries: ${response.status}`);
      }

      const result = await response.json();
      return result.data.map((entry: any) => entry.id);
    } catch (error) {
      console.error('Failed to get shared entries:', error);
      return [];
    }
  }

  /**
   * Get reactive store for access keys
   */
  get accessKeysStoreReadable() {
    return this.accessKeysStore;
  }

  /**
   * Refresh all sharing data
   */
  async refresh(): Promise<void> {
    if (apiAuthService.isAuthenticated()) {
      await this.loadUserAccessKeys();
    }
  }

  /**
   * Grant access to an existing entry by reusing the author's access key
   * This is used when adding users to tags retroactively
   */
  async grantAccessToExistingEntry(entryId: string, newUserId: string): Promise<boolean> {
    if (!apiAuthService.isAuthenticated()) {
      throw new Error('User must be authenticated to grant access');
    }

    if (!e2eEncryptionService.isUnlocked()) {
      throw new Error('E2E encryption must be unlocked to grant access');
    }

    try {
      console.log(`Granting access to entry ${entryId} for user ${newUserId}`);

      // Get the author's access key for this entry
      const authorAccessKey = await this.getEntryAccessKey(entryId);
      if (!authorAccessKey) {
        throw new Error('No access key found for current user (author should have one)');
      }

      // DETAILED DEBUGGING: Let's trace exactly what's happening
      console.log('=== DETAILED ENTRY KEY DECRYPTION DEBUGGING ===');
      console.log('Entry ID:', entryId);
      console.log('Author access key user_id:', authorAccessKey.user_id);
      console.log('Current user ID:', e2eEncryptionService.getCurrentUserId());
      console.log('IDs match:', authorAccessKey.user_id === e2eEncryptionService.getCurrentUserId());
      
      const currentSession = e2eEncryptionService.getCurrentSession();
      if (currentSession) {
        console.log('Current session public key (B64):', e2eEncryptionService.getCurrentPublicKey());
        console.log('Current session user ID:', currentSession.userId);
        console.log('Session unlocked:', currentSession.isUnlocked);
        
        // Let's manually test the decryption step by step
        try {
          const { decodeBase64 } = await import('tweetnacl-util');
          const nacl = (await import('tweetnacl')).default;
          
          console.log('--- Decryption Parameters ---');
          console.log('Encrypted entry key (B64):', authorAccessKey.encrypted_entry_key);
          console.log('Key nonce (B64):', authorAccessKey.key_nonce);
          
          const encryptedKeyBytes = decodeBase64(authorAccessKey.encrypted_entry_key);
          const nonceBytes = decodeBase64(authorAccessKey.key_nonce);
          
          console.log('Encrypted key length (bytes):', encryptedKeyBytes.length);
          console.log('Nonce length (bytes):', nonceBytes.length);
          console.log('Expected encrypted key length:', nacl.box.overheadLength + 32); // 32 = secretbox key length
          console.log('Expected nonce length:', nacl.box.nonceLength);
          
          console.log('--- Key Pair Information ---');
          console.log('Public key length:', currentSession.userKeyPair.publicKey.length);
          console.log('Secret key length:', currentSession.userKeyPair.secretKey.length);
          console.log('Expected public key length:', nacl.box.publicKeyLength);
          console.log('Expected secret key length:', nacl.box.secretKeyLength);
          
          // Test decryption
          console.log('--- Attempting Decryption ---');
          const decryptedKey = nacl.box.open(
            encryptedKeyBytes,
            nonceBytes,
            currentSession.userKeyPair.publicKey,
            currentSession.userKeyPair.secretKey
          );
          
          console.log('Decryption result:', decryptedKey ? 'SUCCESS' : 'FAILED');
          if (decryptedKey) {
            console.log('Decrypted key length:', decryptedKey.length);
            console.log('Expected key length:', nacl.secretbox.keyLength);
            decryptedKey.fill(0); // Clear from memory
          }
          
        } catch (debugError) {
          console.error('Debug decryption error:', debugError);
        }
      } else {
        console.error('No current session available');
      }
      // CRITICAL TEST: Check what public key is stored in the user's cloud profile
      try {
        const { userSearchService } = await import('./user-search.service.js');
        const currentUserProfile = await userSearchService.getUserById(currentSession?.userId || '');
        
        console.log('--- Cloud Profile vs Session Comparison ---');
        console.log('Current session public key:', e2eEncryptionService.getCurrentPublicKey());
        console.log('Cloud profile public key  :', currentUserProfile?.public_key);
        console.log('Keys match:', e2eEncryptionService.getCurrentPublicKey() === currentUserProfile?.public_key);
        
        if (e2eEncryptionService.getCurrentPublicKey() !== currentUserProfile?.public_key) {
          console.error('🚨 FOUND THE PROBLEM: Session public key differs from cloud profile public key!');
          console.error('This means the user has different encryption keys in their session vs cloud profile.');
          console.error('The entry was encrypted with the cloud profile key, but session has different keys.');
        } else {
          console.log('✅ Keys match, so this is NOT a key mismatch issue');
          console.log('🔍 This suggests the encrypted data in the database may be corrupted');
          console.log('🔍 Or the entry was created with a different key pair that had the same public key (extremely unlikely)');
          
          // Let's test if the current user can decrypt a NEWLY created entry
          console.log('--- Testing Fresh Entry Decryption ---');
          console.log('Can we decrypt the entry we just created? Entry ID: cfa074c9-03b0-4ed8-8161-ebc7c59e5505');
          
          try {
            const freshAccessKey = await this.getEntryAccessKey('cfa074c9-03b0-4ed8-8161-ebc7c59e5505');
            if (freshAccessKey) {
              const freshEncryptedKeyBytes = decodeBase64(freshAccessKey.encrypted_entry_key);
              const freshNonceBytes = decodeBase64(freshAccessKey.key_nonce);
              
              const freshDecryptedKey = nacl.box.open(
                freshEncryptedKeyBytes,
                freshNonceBytes,
                currentSession.userKeyPair.publicKey,
                currentSession.userKeyPair.secretKey
              );
              
              console.log('Fresh entry decryption result:', freshDecryptedKey ? 'SUCCESS' : 'FAILED');
              if (freshDecryptedKey) {
                freshDecryptedKey.fill(0); // Clear from memory
                console.log('✅ Fresh entry CAN be decrypted - this confirms the old entry data is corrupted');
              } else {
                console.log('❌ Fresh entry CANNOT be decrypted - this suggests a deeper encryption issue');
              }
            } else {
              console.log('Could not get access key for fresh entry');
            }
          } catch (freshTestError) {
            console.error('Fresh entry test error:', freshTestError);
          }
        }
      } catch (profileError) {
        console.error('Failed to fetch user profile for comparison:', profileError);
      }
      
      console.log('=== END DEBUGGING ===');

      // Get the new user's public key using direct user lookup
      const { userSearchService } = await import('./user-search.service.js');
      const targetUser = await userSearchService.getUserById(newUserId);
      if (!targetUser || !targetUser.public_key) {
        throw new Error('Target user not found or has no public key');
      }

      // Use the e2e encryption service to rewrap the key for the new user
      const rewrappedKey = e2eEncryptionService.rewrapEntryKeyForUser(
        authorAccessKey.encrypted_entry_key,
        authorAccessKey.key_nonce,
        targetUser.public_key
      );

      if (!rewrappedKey) {
        // This entry was likely created with old encryption keys that no longer match
        // the current user's session. This can happen if keys were regenerated.
        console.warn(`Cannot grant access to entry ${entryId}: Entry key is inaccessible (may have been created with previous encryption keys)`);
        return false; // Return false to indicate this specific entry failed, but don't throw
      }

      // Store the new access key
      await this.storeEntryAccessKeys(entryId, [{
        userId: newUserId,
        encryptedEntryKey: rewrappedKey.encryptedEntryKeyB64,
        keyNonce: rewrappedKey.keyNonceB64
      }]);

      console.log(`Successfully granted access to entry ${entryId} for user ${newUserId}`);
      return true;

    } catch (error) {
      console.error(`Failed to grant access to entry ${entryId} for user ${newUserId}:`, error);
      return false;
    }
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.accessKeysStore.set(new Map());
  }

  /**
   * Revoke all access to an entry for all users
   */
  async revokeAllEntryAccess(entryId: string): Promise<void> {
    if (!apiAuthService.isAuthenticated()) {
      throw new Error('User must be authenticated to revoke access');
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/entry-access-keys/entry/${entryId}`, {
        method: 'DELETE',
        headers: {
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to revoke all access: ${response.status}`);
      }

      console.log(`Successfully revoked all access to entry ${entryId}`);
      
      // Update local cache
      this.accessKeysStore.update(keysByEntry => {
        keysByEntry.delete(entryId);
        return keysByEntry;
      });
    } catch (error) {
      console.error('Failed to revoke all entry access:', error);
      throw error;
    }
  }

  /**
   * Revoke access to an entry for specific users
   */
  async revokeEntryAccessForUsers(entryId: string, userIds: string[]): Promise<void> {
    if (!apiAuthService.isAuthenticated()) {
      throw new Error('User must be authenticated to revoke access');
    }

    if (userIds.length === 0) {
      return; // Nothing to revoke
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/entry-access-keys/bulk-revoke`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...apiAuthService.getAuthHeaders()
        },
        body: JSON.stringify({
          entry_id: entryId,
          user_ids: userIds
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to revoke access for users: ${response.status}`);
      }

      console.log(`Successfully revoked access for ${userIds.length} users to entry ${entryId}`);
      
      // Update local cache
      this.accessKeysStore.update(keysByEntry => {
        const currentKeys = keysByEntry.get(entryId) || [];
        const filteredKeys = currentKeys.filter(key => !userIds.includes(key.user_id));
        if (filteredKeys.length > 0) {
          keysByEntry.set(entryId, filteredKeys);
        } else {
          keysByEntry.delete(entryId);
        }
        return keysByEntry;
      });
    } catch (error) {
      console.error('Failed to revoke entry access for users:', error);
      throw error;
    }
  }

  /**
   * Get all users who currently have access to an entry
   */
  async getEntryAccessUsers(entryId: string): Promise<string[]> {
    if (!apiAuthService.isAuthenticated()) {
      return [];
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/entry-access-keys/entry/${entryId}/users`, {
        method: 'GET',
        headers: {
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return []; // No access keys found
        }
        throw new Error(`Failed to get entry access users: ${response.status}`);
      }

      const result = await response.json();
      const accessKeys = result.data as EntryAccessKey[];
      
      return accessKeys.map(key => key.user_id);
    } catch (error) {
      console.error('Failed to get entry access users:', error);
      return [];
    }
  }

  /**
   * Find all entries that are shared with a specific tag
   */
  async getEntriesSharedWithTag(tagId: string): Promise<string[]> {
    if (!apiAuthService.isAuthenticated()) {
      return [];
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/entries/shared-with-tag/${tagId}`, {
        method: 'GET',
        headers: {
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return []; // No entries found
        }
        throw new Error(`Failed to get entries shared with tag: ${response.status}`);
      }

      const result = await response.json();
      const entries = result.data as Array<{ id: string }>;
      
      return entries.map(entry => entry.id);
    } catch (error) {
      console.error('Failed to get entries shared with tag:', error);
      return [];
    }
  }
}

// Export singleton instance
export const entrySharingService = new EntrySharingService();