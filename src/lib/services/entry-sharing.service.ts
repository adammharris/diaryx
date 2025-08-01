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

      const uniqueUsers = Array.from(allUsersToShareWith.values());
      console.log(`Total unique users to share with: ${uniqueUsers.length}`);

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
  get accessKeysStore() {
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
   * Clear all cached data
   */
  clear(): void {
    this.accessKeysStore.set(new Map());
  }
}

// Export singleton instance
export const entrySharingService = new EntrySharingService();