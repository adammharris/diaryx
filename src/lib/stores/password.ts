import { writable, get } from 'svelte/store';
import { decrypt, isEncrypted } from '../utils/crypto.js';
import type { JournalEntry } from '../storage/types.js';

interface PasswordCache {
  [entryId: string]: {
    password: string;
    cachedAt: number;
    lastUsed: number;
    decryptedContent?: string; // Cache decrypted content for performance
    isEncrypted?: boolean; // Cache encryption status to avoid checking content
    entryTitle?: string; // Cache entry title to avoid loading from storage
  };
}

interface PasswordState {
  cache: PasswordCache;
  isPrompting: boolean;
  promptingEntryId: string | null;
  lastAttemptFailed: boolean;
  sessionTimeout: number; // in milliseconds
  cleanupInterval: number | null;
}

// Default session timeout: 2 hours
const DEFAULT_SESSION_TIMEOUT = 2 * 60 * 60 * 1000;

const initialState: PasswordState = {
  cache: {},
  isPrompting: false,
  promptingEntryId: null,
  lastAttemptFailed: false,
  sessionTimeout: DEFAULT_SESSION_TIMEOUT,
  cleanupInterval: null
};

function createPasswordStore() {
  const store = writable<PasswordState>(initialState);
  const { subscribe, set, update } = store;

  return {
    subscribe,
    
    // Check if we have a cached password for an entry (and it hasn't expired)
    hasCachedPassword: (entryId: string): boolean => {
      let hasPassword = false;
      update(state => {
        const cached = state.cache[entryId];
        if (cached) {
          const now = Date.now();
          const isExpired = (now - cached.lastUsed) > state.sessionTimeout;
          if (isExpired) {
            // Remove expired password
            delete state.cache[entryId];
            hasPassword = false;
          } else {
            hasPassword = true;
          }
        }
        return state;
      });
      return hasPassword;
    },

    // Try to decrypt entry with cached password
    tryDecryptWithCache: async (entry: JournalEntry): Promise<JournalEntry | null> => {
      if (!isEncrypted(entry.content)) {
        return entry;
      }

      return new Promise<JournalEntry | null>((resolve) => {
        update(state => {
          const cached = state.cache[entry.id];
          if (cached) {
            const now = Date.now();
            const isExpired = (now - cached.lastUsed) > state.sessionTimeout;
            
            if (isExpired) {
              // Password expired, remove from cache
              delete state.cache[entry.id];
              resolve(null);
            } else {
              // Update last used time and try to decrypt
              state.cache[entry.id].lastUsed = now;
              decrypt(entry.content, cached.password)
                .then(decryptedContent => {
                  resolve({
                    ...entry,
                    content: decryptedContent
                  });
                })
                .catch(() => {
                  // Password is invalid, remove from cache
                  delete state.cache[entry.id];
                  resolve(null);
                });
            }
          } else {
            resolve(null);
          }
          return state;
        });
      });
    },

    // Cache a password for an entry after successful decryption
    cachePassword: (entryId: string, password: string, decryptedContent?: string) => {
      const now = Date.now();
      update(state => ({
        ...state,
        cache: {
          ...state.cache,
          [entryId]: {
            password,
            cachedAt: now,
            lastUsed: now
          }
        },
        lastAttemptFailed: false
      }));

      // If decrypted content is provided, update metadata
      if (decryptedContent) {
        // Import storage dynamically to avoid circular dependency
        import('../storage/index.js').then(({ storageService }) => {
          storageService.updateDecryptedTitle(entryId, decryptedContent);
        }).catch(error => {
          console.error('Failed to update metadata for individually decrypted entry:', error);
        });
      }
    },

    // Validate password against encrypted content
    validatePassword: async (encryptedContent: string, password: string): Promise<boolean> => {
      try {
        await decrypt(encryptedContent, password);
        return true;
      } catch {
        return false;
      }
    },

    // Start password prompting for an entry
    startPrompting: (entryId: string) => {
      update(state => ({
        ...state,
        isPrompting: true,
        promptingEntryId: entryId,
        lastAttemptFailed: false
      }));
    },

    // End password prompting
    endPrompting: () => {
      update(state => ({
        ...state,
        isPrompting: false,
        promptingEntryId: null,
        lastAttemptFailed: false
      }));
    },

    // Handle failed password attempt
    handleFailedAttempt: () => {
      update(state => ({
        ...state,
        lastAttemptFailed: true
      }));
    },

    // Submit password and attempt decryption
    submitPassword: async (entryId: string, password: string, encryptedContent: string): Promise<boolean> => {
      try {
        const decryptedContent = await decrypt(encryptedContent, password);
        
        // Success - cache password and update metadata
        const now = Date.now();
        update(state => ({
          ...state,
          cache: {
            ...state.cache,
            [entryId]: {
              password,
              cachedAt: now,
              lastUsed: now
            }
          },
          isPrompting: false,
          promptingEntryId: null,
          lastAttemptFailed: false
        }));

        // Update metadata with decrypted content for preview
        try {
          const { storageService } = await import('../storage/index.js');
          await storageService.updateDecryptedTitle(entryId, decryptedContent);
        } catch (error) {
          console.error('Failed to update metadata for decrypted entry:', error);
        }

        return true;
      } catch {
        // Failed to decrypt
        update(state => ({
          ...state,
          lastAttemptFailed: true
        }));
        return false;
      }
    },

    // Clear cached password for an entry
    clearPassword: (entryId: string) => {
      update(state => {
        const newCache = { ...state.cache };
        delete newCache[entryId];
        return {
          ...state,
          cache: newCache
        };
      });
    },

    // Clear all cached passwords (useful for logout/security)
    clearAllPasswords: () => {
      update(state => ({
        ...state,
        cache: {},
        isPrompting: false,
        promptingEntryId: null,
        lastAttemptFailed: false
      }));
    },

    // Get current prompting state
    getPromptingState: (): Promise<{ isPrompting: boolean; entryId: string | null; lastFailed: boolean }> => {
      return new Promise((resolve) => {
        update(state => {
          resolve({
            isPrompting: state.isPrompting,
            entryId: state.promptingEntryId,
            lastFailed: state.lastAttemptFailed
          });
          return state;
        });
      });
    },

    // Batch unlock: try a password on all encrypted entries
    batchUnlock: async (password: string, encryptedEntries: JournalEntry[]): Promise<{
      successCount: number;
      failedEntries: string[];
      unlockedEntries: string[];
    }> => {
      const results = {
        successCount: 0,
        failedEntries: [] as string[],
        unlockedEntries: [] as string[]
      };

      const now = Date.now();
      const decryptedEntries: Array<{ entryId: string; decryptedContent: string }> = [];
      
      // Test password against all encrypted entries
      for (const entry of encryptedEntries) {
        try {
          const decryptedContent = await decrypt(entry.content, password);
          // Success - cache the password and store decrypted content for metadata update
          results.successCount++;
          results.unlockedEntries.push(entry.id);
          decryptedEntries.push({ entryId: entry.id, decryptedContent });
          
          update(state => ({
            ...state,
            cache: {
              ...state.cache,
              [entry.id]: {
                password,
                cachedAt: now,
                lastUsed: now
              }
            }
          }));
        } catch {
          // Failed to decrypt with this password
          results.failedEntries.push(entry.id);
        }
      }

      // Update metadata for successfully decrypted entries
      // Import storage dynamically to avoid circular dependency
      if (decryptedEntries.length > 0) {
        try {
          const { storageService } = await import('../storage/index.js');
          for (const { entryId, decryptedContent } of decryptedEntries) {
            await storageService.updateDecryptedTitle(entryId, decryptedContent);
          }
        } catch (error) {
          console.error('Failed to update metadata for decrypted entries:', error);
        }
      }

      return results;
    },

    // Set session timeout (in milliseconds)
    setSessionTimeout: (timeoutMs: number) => {
      update(state => ({
        ...state,
        sessionTimeout: timeoutMs
      }));
    },

    // Get current session timeout
    getSessionTimeout: (): Promise<number> => {
      return new Promise((resolve) => {
        update(state => {
          resolve(state.sessionTimeout);
          return state;
        });
      });
    },

    // Start automatic cleanup of expired passwords
    startCleanupTimer: () => {
      update(state => {
        // Clear existing timer if any
        if (state.cleanupInterval) {
          clearInterval(state.cleanupInterval);
        }

        // Set up new cleanup timer (run every 5 minutes)
        const interval = setInterval(() => {
          update(cleanupState => {
            const now = Date.now();
            const newCache = { ...cleanupState.cache };
            let cleaned = false;

            for (const [entryId, cached] of Object.entries(newCache)) {
              if ((now - cached.lastUsed) > cleanupState.sessionTimeout) {
                delete newCache[entryId];
                cleaned = true;
              }
            }

            return cleaned ? { ...cleanupState, cache: newCache } : cleanupState;
          });
        }, 5 * 60 * 1000); // 5 minutes

        return {
          ...state,
          cleanupInterval: interval as any
        };
      });
    },

    // Stop automatic cleanup
    stopCleanupTimer: () => {
      update(state => {
        if (state.cleanupInterval) {
          clearInterval(state.cleanupInterval);
        }
        return {
          ...state,
          cleanupInterval: null
        };
      });
    },

    // Get cache statistics
    getCacheStats: (): Promise<{
      totalCached: number;
      expiredCount: number;
      oldestCacheTime: number | null;
      newestCacheTime: number | null;
    }> => {
      return new Promise((resolve) => {
        update(state => {
          const now = Date.now();
          const cached = Object.values(state.cache);
          const expired = cached.filter(c => (now - c.lastUsed) > state.sessionTimeout);
          
          resolve({
            totalCached: cached.length,
            expiredCount: expired.length,
            oldestCacheTime: cached.length > 0 ? Math.min(...cached.map(c => c.cachedAt)) : null,
            newestCacheTime: cached.length > 0 ? Math.max(...cached.map(c => c.cachedAt)) : null
          });
          return state;
        });
      });
    },

    // Get cached decrypted content if available (optimized for performance)
    getCachedDecryptedContent: (entryId: string): string | null => {
      const state = get(store) as PasswordState;
      const cached = state.cache[entryId];
      
      if (!cached || !cached.decryptedContent) return null;
      
      // Skip timeout check for ultra-fast path - assume recent access means valid cache
      const now = Date.now();
      const isRecent = (now - cached.lastUsed) < 300000; // 5 minutes
      
      if (isRecent) {
        // Ultra-fast path: skip state update for very recent access
        return cached.decryptedContent;
      }
      
      // Check if cache is still valid
      if (now - cached.cachedAt > state.sessionTimeout) {
        // Cache expired, remove it
        update(currentState => {
          const newCache = { ...currentState.cache };
          delete newCache[entryId];
          return { ...currentState, cache: newCache };
        });
        return null;
      }
      
      // Update last used time only if not recent
      update(currentState => ({
        ...currentState,
        cache: {
          ...currentState.cache,
          [entryId]: {
            ...cached,
            lastUsed: now
          }
        }
      }));
      
      return cached.decryptedContent;
    },

    // Cache decrypted content along with password and metadata
    cacheDecryptedContent: (entryId: string, decryptedContent: string, entryTitle?: string) => {
      update(state => {
        const existing = state.cache[entryId];
        if (!existing) return state; // No password cache, don't cache content
        
        return {
          ...state,
          cache: {
            ...state.cache,
            [entryId]: {
              ...existing,
              decryptedContent,
              isEncrypted: true, // Mark as encrypted since we're caching decrypted content
              entryTitle: entryTitle || existing.entryTitle, // Cache title if provided
              lastUsed: Date.now()
            }
          }
        };
      });
    },

    // Check if entry is known to be encrypted without loading it
    isKnownEncrypted: (entryId: string): boolean | null => {
      const state = get(store) as PasswordState;
      const cached = state.cache[entryId];
      return cached?.isEncrypted ?? null; // null = unknown, true/false = known
    },

    // Get cached title if available (optimized for performance)
    getCachedTitle: (entryId: string): string | null => {
      const state = get(store) as PasswordState;
      const cached = state.cache[entryId];
      // Skip validation for ultra-fast path - assume cache is valid if it exists
      return cached?.entryTitle ?? null;
    }
  };
}

export const passwordStore = createPasswordStore();

// Start cleanup timer when store is created
passwordStore.startCleanupTimer();