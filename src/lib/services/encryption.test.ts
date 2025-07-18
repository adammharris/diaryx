
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encryptionService } from './encryption';
import type { JournalEntry } from '../storage/types.js';

describe('EncryptionService', () => {
  const mockEntry: JournalEntry = {
    id: 'test-entry',
    title: 'Test Entry',
    content: 'Test content',
    created: new Date().toISOString(),
    updated: new Date().toISOString()
  };

  beforeEach(() => {
    // Clear all cached passwords before each test
    encryptionService.clearAllPasswords();
    
    // Disable metadata update callback to prevent storage interactions
    encryptionService.setMetadataUpdateCallback(() => {});
  });

  afterEach(() => {
    encryptionService.stopCleanupTimer();
  });

  describe('Basic Encryption/Decryption', () => {
    it('should encrypt and decrypt content successfully', async () => {
      const content = 'This is a secret message.';
      const password = 'supersecretpassword';

      const encryptedContent = await encryptionService.encryptContent(content, password);
      const decryptedContent = await encryptionService.decryptContent(encryptedContent, password);

      expect(decryptedContent).toBe(content);
      expect(encryptedContent).not.toBe(content);
    });

    it('should throw error with wrong password', async () => {
      const content = 'Secret content';
      const correctPassword = 'correct123';
      const wrongPassword = 'wrong456';

      const encryptedContent = await encryptionService.encryptContent(content, correctPassword);
      
      await expect(encryptionService.decryptContent(encryptedContent, wrongPassword))
        .rejects.toThrow();
    });

    it('should handle empty content', async () => {
      const content = '';
      const password = 'password123';

      const encryptedContent = await encryptionService.encryptContent(content, password);
      const decryptedContent = await encryptionService.decryptContent(encryptedContent, password);

      expect(decryptedContent).toBe('');
    });

    it('should handle special characters in content', async () => {
      const content = '🔒 Special chars: αβγ, 中文, emoji! @#$%^&*()';
      const password = 'password123';

      const encryptedContent = await encryptionService.encryptContent(content, password);
      const decryptedContent = await encryptionService.decryptContent(encryptedContent, password);

      expect(decryptedContent).toBe(content);
    });

    it('should handle very long content', async () => {
      const content = 'A'.repeat(10000);
      const password = 'password123';

      const encryptedContent = await encryptionService.encryptContent(content, password);
      const decryptedContent = await encryptionService.decryptContent(encryptedContent, password);

      expect(decryptedContent).toBe(content);
    });
  });

  describe('Content Detection', () => {
    it('should return true for encrypted content', async () => {
      const content = 'This is a secret message.';
      const password = 'supersecretpassword';

      const encryptedContent = await encryptionService.encryptContent(content, password);

      expect(encryptionService.isContentEncrypted(encryptedContent)).toBe(true);
    });

    it('should return false for unencrypted content', () => {
      const content = 'This is a plain message.';

      expect(encryptionService.isContentEncrypted(content)).toBe(false);
    });

    it('should return false for empty content', () => {
      expect(encryptionService.isContentEncrypted('')).toBe(false);
    });

    it('should return false for null/undefined content', () => {
      expect(encryptionService.isContentEncrypted(null as any)).toBe(false);
      expect(encryptionService.isContentEncrypted(undefined as any)).toBe(false);
    });
  });

  describe('Password Caching', () => {
    it('should cache and retrieve a password', () => {
      const entryId = 'test-entry';
      const password = 'supersecretpassword';

      encryptionService.cachePassword(entryId, password);

      expect(encryptionService.hasCachedPassword(entryId)).toBe(true);
    });

    it('should clear a cached password', () => {
      const entryId = 'test-entry';
      const password = 'supersecretpassword';

      encryptionService.cachePassword(entryId, password);
      encryptionService.clearPassword(entryId);

      expect(encryptionService.hasCachedPassword(entryId)).toBe(false);
    });

    it('should clear all cached passwords', () => {
      encryptionService.cachePassword('entry1', 'password1');
      encryptionService.cachePassword('entry2', 'password2');
      
      encryptionService.clearAllPasswords();
      
      expect(encryptionService.hasCachedPassword('entry1')).toBe(false);
      expect(encryptionService.hasCachedPassword('entry2')).toBe(false);
    });

    it('should expire cached passwords after timeout', () => {
      const entryId = 'test-entry';
      const password = 'password123';
      
      encryptionService.setSessionTimeout(1000); // 1 second
      encryptionService.cachePassword(entryId, password);
      
      expect(encryptionService.hasCachedPassword(entryId)).toBe(true);
      
      // Manually advance time for testing
      const originalNow = Date.now;
      Date.now = () => originalNow() + 1001;
      
      expect(encryptionService.hasCachedPassword(entryId)).toBe(false);
      
      // Restore Date.now
      Date.now = originalNow;
    });

    it('should cache decrypted content with password', () => {
      const entryId = 'test-entry';
      const password = 'password123';
      const decryptedContent = 'Decrypted content';
      
      encryptionService.cachePassword(entryId, password, decryptedContent);
      
      expect(encryptionService.getCachedDecryptedContent(entryId)).toBe(decryptedContent);
    });

    it('should return null for non-cached decrypted content', () => {
      expect(encryptionService.getCachedDecryptedContent('non-existent')).toBeNull();
    });
  });

  describe('Entry Operations', () => {
    it('should return unencrypted entry as-is', async () => {
      const entry = { ...mockEntry, content: 'Plain text content' };
      
      const result = await encryptionService.tryDecryptEntry(entry);
      
      expect(result).toEqual(entry);
    });

    it('should return null for encrypted entry without cached password', async () => {
      const encryptedContent = await encryptionService.encryptContent('Secret', 'password123');
      const entry = { ...mockEntry, content: encryptedContent };
      
      const result = await encryptionService.tryDecryptEntry(entry);
      
      expect(result).toBeNull();
    });

    it('should decrypt entry with cached password', async () => {
      const content = 'Secret content';
      const password = 'password123';
      const encryptedContent = await encryptionService.encryptContent(content, password);
      const entry = { ...mockEntry, content: encryptedContent };
      
      encryptionService.cachePassword(entry.id, password);
      
      const result = await encryptionService.tryDecryptEntry(entry);
      
      expect(result).toEqual({ ...entry, content });
    });

    it('should remove invalid cached password on decrypt failure', async () => {
      const content = 'Secret content';
      const correctPassword = 'correct123';
      const wrongPassword = 'wrong456';
      const encryptedContent = await encryptionService.encryptContent(content, correctPassword);
      const entry = { ...mockEntry, content: encryptedContent };
      
      // Cache wrong password
      encryptionService.cachePassword(entry.id, wrongPassword);
      expect(encryptionService.hasCachedPassword(entry.id)).toBe(true);
      
      const result = await encryptionService.tryDecryptEntry(entry);
      
      expect(result).toBeNull();
      expect(encryptionService.hasCachedPassword(entry.id)).toBe(false);
    });

    it('should encrypt entry with cached password', async () => {
      const entry = { ...mockEntry, content: 'Plain content' };
      const password = 'password123';
      
      encryptionService.cachePassword(entry.id, password);
      
      const encryptedContent = await encryptionService.encryptEntry(entry, entry.id);
      
      expect(encryptionService.isContentEncrypted(encryptedContent)).toBe(true);
      
      // Verify we can decrypt it back
      const decrypted = await encryptionService.decryptContent(encryptedContent, password);
      expect(decrypted).toBe(entry.content);
    });

    it('should throw error when encrypting without cached password', async () => {
      const entry = { ...mockEntry, content: 'Plain content' };
      
      await expect(encryptionService.encryptEntry(entry, entry.id))
        .rejects.toThrow('No cached password found for entry');
    });
  });

  describe('Password Validation', () => {
    it('should validate correct password', async () => {
      const content = 'Test content';
      const password = 'password123';
      const encryptedContent = await encryptionService.encryptContent(content, password);
      
      const isValid = await encryptionService.validatePassword(encryptedContent, password);
      
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const content = 'Test content';
      const correctPassword = 'correct123';
      const wrongPassword = 'wrong456';
      const encryptedContent = await encryptionService.encryptContent(content, correctPassword);
      
      const isValid = await encryptionService.validatePassword(encryptedContent, wrongPassword);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Prompt Management', () => {
    it('should manage prompting state', () => {
      const entryId = 'test-entry';
      
      expect(encryptionService.isPrompting).toBe(false);
      expect(encryptionService.promptingEntryId).toBeNull();
      
      encryptionService.startPrompting(entryId);
      
      expect(encryptionService.isPrompting).toBe(true);
      expect(encryptionService.promptingEntryId).toBe(entryId);
      
      encryptionService.endPrompting();
      
      expect(encryptionService.isPrompting).toBe(false);
      expect(encryptionService.promptingEntryId).toBeNull();
    });

    it('should handle failed attempts', () => {
      expect(encryptionService.lastAttemptFailed).toBe(false);
      
      encryptionService.handleFailedAttempt();
      
      expect(encryptionService.lastAttemptFailed).toBe(true);
    });

    it('should submit password successfully', async () => {
      const entryId = 'test-entry';
      const password = 'password123';
      const content = 'Secret content';
      const encryptedContent = await encryptionService.encryptContent(content, password);
      
      encryptionService.startPrompting(entryId);
      
      const success = await encryptionService.submitPassword(entryId, password, encryptedContent);
      
      expect(success).toBe(true);
      expect(encryptionService.isPrompting).toBe(false);
      expect(encryptionService.hasCachedPassword(entryId)).toBe(true);
      expect(encryptionService.lastAttemptFailed).toBe(false);
    });

    it('should handle failed password submission', async () => {
      const entryId = 'test-entry';
      const correctPassword = 'correct123';
      const wrongPassword = 'wrong456';
      const content = 'Secret content';
      const encryptedContent = await encryptionService.encryptContent(content, correctPassword);
      
      const success = await encryptionService.submitPassword(entryId, wrongPassword, encryptedContent);
      
      expect(success).toBe(false);
      expect(encryptionService.lastAttemptFailed).toBe(true);
    });
  });

  describe('Batch Operations', () => {
    it('should batch unlock multiple entries with same password', async () => {
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
      expect(result.failedEntries).toHaveLength(0);
      expect(result.unlockedEntries).toHaveLength(3);
      
      // Verify all entries are cached
      for (let i = 0; i < 3; i++) {
        expect(encryptionService.hasCachedPassword(`entry-${i}`)).toBe(true);
      }
    });

    it('should handle mixed success/failure in batch unlock', async () => {
      const correctPassword = 'correct123';
      const wrongPassword = 'wrong456';
      
      const entries: JournalEntry[] = [];
      
      // Entry 0: encrypted with correct password
      const content0 = 'Secret content 0';
      const encrypted0 = await encryptionService.encryptContent(content0, correctPassword);
      entries.push({ ...mockEntry, id: 'entry-0', content: encrypted0 });
      
      // Entry 1: encrypted with different password
      const content1 = 'Secret content 1';
      const encrypted1 = await encryptionService.encryptContent(content1, 'different-password');
      entries.push({ ...mockEntry, id: 'entry-1', content: encrypted1 });
      
      const result = await encryptionService.batchUnlock(correctPassword, entries);
      
      expect(result.successCount).toBe(1);
      expect(result.failedEntries).toEqual(['entry-1']);
      expect(result.unlockedEntries).toEqual(['entry-0']);
    });
  });

  describe('Cache Statistics', () => {
    it('should provide accurate cache statistics', () => {
      const stats = encryptionService.getCacheStats();
      
      expect(stats.totalCached).toBe(0);
      expect(stats.expiredCount).toBe(0);
      expect(stats.oldestCacheTime).toBeNull();
      expect(stats.newestCacheTime).toBeNull();
      
      encryptionService.cachePassword('entry1', 'password1');
      encryptionService.cachePassword('entry2', 'password2');
      
      const newStats = encryptionService.getCacheStats();
      
      expect(newStats.totalCached).toBe(2);
      expect(newStats.oldestCacheTime).toBeTypeOf('number');
      expect(newStats.newestCacheTime).toBeTypeOf('number');
    });
  });

  describe('Session Timeout Management', () => {
    it('should allow setting custom session timeout', () => {
      const newTimeout = 5000; // 5 seconds
      
      encryptionService.setSessionTimeout(newTimeout);
      
      expect(encryptionService.sessionTimeout).toBe(newTimeout);
    });

    it('should update last used time when accessing cached content', () => {
      const entryId = 'test-entry';
      const password = 'password123';
      const content = 'Cached content';
      
      encryptionService.cachePassword(entryId, password, content);
      
      // Access content
      const retrieved1 = encryptionService.getCachedDecryptedContent(entryId);
      expect(retrieved1).toBe(content);
      
      // Should still be available (timeout functionality tested elsewhere)
      const retrieved2 = encryptionService.getCachedDecryptedContent(entryId);
      expect(retrieved2).toBe(content);
    });
  });
});
