/**
 * Legacy password store - now delegates to encryption service
 * This maintains backward compatibility while using the new encryption service
 */

import { writable } from 'svelte/store';
import { encryptionService } from '../services/encryption.js';
import type { JournalEntry } from '../storage/types.js';

// Create a simple writable store for backward compatibility
const legacyStore = writable({
  cache: {},
  isPrompting: false,
  promptingEntryId: null,
  lastAttemptFailed: false,
  sessionTimeout: 2 * 60 * 60 * 1000
});

// Legacy wrapper that delegates to encryption service
function createPasswordStore() {
  return {
    subscribe: legacyStore.subscribe,
    
    // Delegate all methods to encryption service
    hasCachedPassword: (entryId: string) => encryptionService.hasCachedPassword(entryId),
    tryDecryptWithCache: (entry: JournalEntry) => encryptionService.tryDecryptEntry(entry),
    cachePassword: (entryId: string, password: string, decryptedContent?: string) => 
      encryptionService.cachePassword(entryId, password, decryptedContent),
    validatePassword: (encryptedContent: string, password: string) => 
      encryptionService.validatePassword(encryptedContent, password),
    startPrompting: (entryId: string) => encryptionService.startPrompting(entryId),
    endPrompting: () => encryptionService.endPrompting(),
    handleFailedAttempt: () => encryptionService.handleFailedAttempt(),
    submitPassword: (entryId: string, password: string, encryptedContent: string) => 
      encryptionService.submitPassword(entryId, password, encryptedContent),
    clearPassword: (entryId: string) => encryptionService.clearPassword(entryId),
    clearAllPasswords: () => encryptionService.clearAllPasswords(),
    batchUnlock: (password: string, encryptedEntries: JournalEntry[]) => 
      encryptionService.batchUnlock(password, encryptedEntries),
    setSessionTimeout: (timeoutMs: number) => encryptionService.setSessionTimeout(timeoutMs),
    getCachedDecryptedContent: (entryId: string) => encryptionService.getCachedDecryptedContent(entryId),
    
    // Legacy methods that return promises (for backward compatibility)
    getPromptingState: () => Promise.resolve({
      isPrompting: encryptionService.isPrompting,
      entryId: encryptionService.promptingEntryId,
      lastFailed: encryptionService.lastAttemptFailed
    }),
    getSessionTimeout: () => Promise.resolve(encryptionService.sessionTimeout),
    getCacheStats: () => Promise.resolve(encryptionService.getCacheStats()),
    
    // Cleanup methods
    startCleanupTimer: () => {
      // Cleanup is handled by the encryption service
      console.log('Cleanup timer managed by encryption service');
    },
    stopCleanupTimer: () => {
      // Cleanup is handled by the encryption service
      console.log('Cleanup timer managed by encryption service');
    }
  };
}

export const passwordStore = createPasswordStore();