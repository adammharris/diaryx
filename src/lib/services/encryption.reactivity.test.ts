import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { encryptionService } from './encryption';
import type { JournalEntry } from '../storage/types.js';

describe('EncryptionService Reactivity', () => {
  let unsubscribe: (() => void) | null = null;
  let storeUpdates: any[] = [];

  const mockEntry: JournalEntry = {
    id: 'test-entry',
    title: 'Test Entry',
    content: 'Test content',
    created_at: new Date().toISOString(),
    modified_at: new Date().toISOString(),
    file_path: 'test.md'
  };

  beforeEach(() => {
    // Clear all state and reset timeout to default
    encryptionService.clearAllPasswords();
    encryptionService.setSessionTimeout(2 * 60 * 60 * 1000); // Reset to 2 hours
    
    // Disable metadata update callback to prevent storage interactions
    encryptionService.setMetadataUpdateCallback(() => {});
    
    storeUpdates = [];
    
    // Subscribe to store updates
    unsubscribe = encryptionService.subscribe((state) => {
      storeUpdates.push({ ...state });
    });
  });

  afterEach(() => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    encryptionService.stopCleanupTimer();
  });

  describe('Store State Management', () => {
    it('should initialize with default state', () => {
      const state = get(encryptionService);
      
      expect(state.sessions).toBeInstanceOf(Map);
      expect(state.sessions.size).toBe(0);
      expect(state.isPrompting).toBe(false);
      expect(state.promptingEntryId).toBeNull();
      expect(state.lastAttemptFailed).toBe(false);
      expect(state.sessionTimeout).toBe(2 * 60 * 60 * 1000); // 2 hours
    });

    it('should update store when caching password', () => {
      const entryId = 'test-entry';
      const password = 'password123';
      
      encryptionService.cachePassword(entryId, password);
      
      const state = get(encryptionService);
      expect(state.sessions.has(entryId)).toBe(true);
      expect(state.lastAttemptFailed).toBe(false);
      
      // Check that store was updated
      expect(storeUpdates.length).toBeGreaterThan(1);
      const lastUpdate = storeUpdates[storeUpdates.length - 1];
      expect(lastUpdate.sessions.has(entryId)).toBe(true);
    });

    it('should update store when clearing password', () => {
      const entryId = 'test-entry';
      const password = 'password123';
      
      encryptionService.cachePassword(entryId, password);
      encryptionService.clearPassword(entryId);
      
      const state = get(encryptionService);
      expect(state.sessions.has(entryId)).toBe(false);
      
      // Verify store updates
      expect(storeUpdates.length).toBeGreaterThan(2);
    });

    it('should update store when clearing all passwords', () => {
      encryptionService.cachePassword('entry1', 'password1');
      encryptionService.cachePassword('entry2', 'password2');
      
      encryptionService.clearAllPasswords();
      
      const state = get(encryptionService);
      expect(state.sessions.size).toBe(0);
      expect(state.isPrompting).toBe(false);
      expect(state.promptingEntryId).toBeNull();
      expect(state.lastAttemptFailed).toBe(false);
    });

    it('should update store when starting prompting', () => {
      const entryId = 'test-entry';
      
      encryptionService.startPrompting(entryId);
      
      const state = get(encryptionService);
      expect(state.isPrompting).toBe(true);
      expect(state.promptingEntryId).toBe(entryId);
      expect(state.lastAttemptFailed).toBe(false);
    });

    it('should update store when ending prompting', () => {
      const entryId = 'test-entry';
      
      encryptionService.startPrompting(entryId);
      encryptionService.endPrompting();
      
      const state = get(encryptionService);
      expect(state.isPrompting).toBe(false);
      expect(state.promptingEntryId).toBeNull();
      expect(state.lastAttemptFailed).toBe(false);
    });

    it('should update store when handling failed attempt', () => {
      encryptionService.handleFailedAttempt();
      
      const state = get(encryptionService);
      expect(state.lastAttemptFailed).toBe(true);
    });

    it('should update store when setting session timeout', () => {
      const newTimeout = 5000;
      
      encryptionService.setSessionTimeout(newTimeout);
      
      const state = get(encryptionService);
      expect(state.sessionTimeout).toBe(newTimeout);
    });
  });

  describe('Reactive Getters', () => {
    it('should provide reactive access to prompting state', () => {
      expect(encryptionService.isPrompting).toBe(false);
      
      encryptionService.startPrompting('test-entry');
      expect(encryptionService.isPrompting).toBe(true);
      
      encryptionService.endPrompting();
      expect(encryptionService.isPrompting).toBe(false);
    });

    it('should provide reactive access to prompting entry ID', () => {
      expect(encryptionService.promptingEntryId).toBeNull();
      
      encryptionService.startPrompting('test-entry');
      expect(encryptionService.promptingEntryId).toBe('test-entry');
      
      encryptionService.endPrompting();
      expect(encryptionService.promptingEntryId).toBeNull();
    });

    it('should provide reactive access to last attempt failed state', () => {
      expect(encryptionService.lastAttemptFailed).toBe(false);
      
      encryptionService.handleFailedAttempt();
      expect(encryptionService.lastAttemptFailed).toBe(true);
      
      encryptionService.cachePassword('test', 'password');
      expect(encryptionService.lastAttemptFailed).toBe(false);
    });

    it('should provide reactive access to session timeout', () => {
      const defaultTimeout = 2 * 60 * 60 * 1000;
      expect(encryptionService.sessionTimeout).toBe(defaultTimeout);
      
      const newTimeout = 5000;
      encryptionService.setSessionTimeout(newTimeout);
      expect(encryptionService.sessionTimeout).toBe(newTimeout);
    });
  });

  describe('Session Management Reactivity', () => {
    it('should update store when sessions expire via hasCachedPassword', () => {
      const entryId = 'test-entry';
      const password = 'password123';
      
      encryptionService.setSessionTimeout(1000); // 1 second
      encryptionService.cachePassword(entryId, password);
      
      // Mock time advancement
      const originalNow = Date.now;
      Date.now = () => originalNow() + 1001;
      
      // Trigger expiration check
      const hasPassword = encryptionService.hasCachedPassword(entryId);
      
      expect(hasPassword).toBe(false);
      const state = get(encryptionService);
      expect(state.sessions.has(entryId)).toBe(false);
      
      // Restore Date.now
      Date.now = originalNow;
    });

    it('should preserve sessions that have not expired', () => {
      const entryId = 'test-entry';
      const password = 'password123';
      const content = 'Cached content';
      
      encryptionService.cachePassword(entryId, password, content);
      
      const cachedContent = encryptionService.getCachedDecryptedContent(entryId);
      
      expect(cachedContent).toBe(content);
      const state = get(encryptionService);
      expect(state.sessions.has(entryId)).toBe(true);
    });
  });

  describe('Password Submission Reactivity', () => {
    it('should update store on successful password submission', async () => {
      const entryId = 'test-entry';
      const password = 'password123';
      const content = 'Secret content';
      const encryptedContent = await encryptionService.encryptContent(content, password);
      
      encryptionService.startPrompting(entryId);
      
      const success = await encryptionService.submitPassword(entryId, password, encryptedContent);
      
      expect(success).toBe(true);
      
      const state = get(encryptionService);
      expect(state.isPrompting).toBe(false);
      expect(state.promptingEntryId).toBeNull();
      expect(state.lastAttemptFailed).toBe(false);
      expect(state.sessions.has(entryId)).toBe(true);
    });

    it('should update store on failed password submission', async () => {
      const entryId = 'test-entry';
      const correctPassword = 'correct123';
      const wrongPassword = 'wrong456';
      const content = 'Secret content';
      const encryptedContent = await encryptionService.encryptContent(content, correctPassword);
      
      const success = await encryptionService.submitPassword(entryId, wrongPassword, encryptedContent);
      
      expect(success).toBe(false);
      
      const state = get(encryptionService);
      expect(state.lastAttemptFailed).toBe(true);
    });
  });

  describe('Entry Operations Reactivity', () => {
    it('should update store when trying to decrypt entry with invalid password', async () => {
      const content = 'Secret content';
      const correctPassword = 'correct123';
      const wrongPassword = 'wrong456';
      const encryptedContent = await encryptionService.encryptContent(content, correctPassword);
      const entry = { ...mockEntry, content: encryptedContent };
      
      // Cache wrong password
      encryptionService.cachePassword(entry.id, wrongPassword);
      expect(get(encryptionService).sessions.has(entry.id)).toBe(true);
      
      const result = await encryptionService.tryDecryptEntry(entry);
      
      expect(result).toBeNull();
      
      // Should remove invalid password from store
      const state = get(encryptionService);
      expect(state.sessions.has(entry.id)).toBe(false);
    });

    it('should update store during successful entry decryption', async () => {
      const content = 'Secret content';
      const password = 'password123';
      const encryptedContent = await encryptionService.encryptContent(content, password);
      const entry = { ...mockEntry, content: encryptedContent };
      
      encryptionService.cachePassword(entry.id, password);
      
      const result = await encryptionService.tryDecryptEntry(entry);
      
      expect(result?.content).toBe(content);
      
      // Should update last used time and cache decrypted content
      const state = get(encryptionService);
      const session = state.sessions.get(entry.id);
      expect(session?.decryptedContent).toBe(content);
    });
  });

  describe('Batch Operations Reactivity', () => {
    it('should update store during batch unlock operation', async () => {
      const password = 'shared-password';
      const entries: JournalEntry[] = [];
      
      // Create multiple encrypted entries
      for (let i = 0; i < 3; i++) {
        const content = `Secret content ${i}`;
        const encryptedContent = await encryptionService.encryptContent(content, password);
        entries.push({
          ...mockEntry,
          id: `entry-${i}`,
          content: encryptedContent
        });
      }
      
      const result = await encryptionService.batchUnlock(password, entries);
      
      expect(result.successCount).toBe(3);
      
      // Verify store was updated with all sessions
      const state = get(encryptionService);
      for (let i = 0; i < 3; i++) {
        expect(state.sessions.has(`entry-${i}`)).toBe(true);
      }
    });
  });

  describe('Metadata Update Callback', () => {
    it('should call metadata update callback when caching password with content', () => {
      const mockCallback = vi.fn();
      encryptionService.setMetadataUpdateCallback(mockCallback);
      
      const entryId = 'test-entry';
      const password = 'password123';
      const content = 'Decrypted content';
      
      encryptionService.cachePassword(entryId, password, content);
      
      expect(mockCallback).toHaveBeenCalledWith(entryId, content);
    });

    it('should call metadata update callback during successful password submission', async () => {
      const mockCallback = vi.fn();
      encryptionService.setMetadataUpdateCallback(mockCallback);
      
      const entryId = 'test-entry';
      const password = 'password123';
      const content = 'Secret content';
      const encryptedContent = await encryptionService.encryptContent(content, password);
      
      await encryptionService.submitPassword(entryId, password, encryptedContent);
      
      expect(mockCallback).toHaveBeenCalledWith(entryId, content);
    });

    it('should call metadata update callback during batch unlock', async () => {
      const mockCallback = vi.fn();
      encryptionService.setMetadataUpdateCallback(mockCallback);
      
      const password = 'shared-password';
      const content = 'Secret content';
      const encryptedContent = await encryptionService.encryptContent(content, password);
      const entry = { ...mockEntry, content: encryptedContent };
      
      await encryptionService.batchUnlock(password, [entry]);
      
      expect(mockCallback).toHaveBeenCalledWith(entry.id, content);
    });
  });

  describe('Store Subscription and Unsubscription', () => {
    it('should allow multiple subscribers', () => {
      const updates1: any[] = [];
      const updates2: any[] = [];
      
      const unsubscribe1 = encryptionService.subscribe((state) => {
        updates1.push(state);
      });
      
      const unsubscribe2 = encryptionService.subscribe((state) => {
        updates2.push(state);
      });
      
      encryptionService.cachePassword('test', 'password');
      
      expect(updates1.length).toBeGreaterThan(0);
      expect(updates2.length).toBeGreaterThan(0);
      
      unsubscribe1();
      unsubscribe2();
    });

    it('should stop receiving updates after unsubscription', () => {
      const updates: any[] = [];
      
      const unsubscribe = encryptionService.subscribe((state) => {
        updates.push(state);
      });
      
      encryptionService.cachePassword('test1', 'password1');
      const countAfterFirst = updates.length;
      
      unsubscribe();
      
      encryptionService.cachePassword('test2', 'password2');
      
      expect(updates.length).toBe(countAfterFirst);
    });
  });

  describe('Manual Cleanup Operations', () => {
    it('should clear all sessions when clearAllPasswords is called', () => {
      // Add some sessions
      encryptionService.cachePassword('entry1', 'password1');
      encryptionService.cachePassword('entry2', 'password2');
      
      const initialState = get(encryptionService);
      expect(initialState.sessions.size).toBe(2);
      
      encryptionService.clearAllPasswords();
      
      const finalState = get(encryptionService);
      expect(finalState.sessions.size).toBe(0);
    });
  });
});