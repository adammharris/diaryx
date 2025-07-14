import { writable } from 'svelte/store';
import { decrypt, isEncrypted } from '../utils/crypto.js';
import type { JournalEntry } from '../storage.js';

interface PasswordCache {
  [entryId: string]: string;
}

interface PasswordState {
  cache: PasswordCache;
  isPrompting: boolean;
  promptingEntryId: string | null;
  lastAttemptFailed: boolean;
}

const initialState: PasswordState = {
  cache: {},
  isPrompting: false,
  promptingEntryId: null,
  lastAttemptFailed: false
};

function createPasswordStore() {
  const { subscribe, set, update } = writable<PasswordState>(initialState);

  return {
    subscribe,
    
    // Check if we have a cached password for an entry
    hasCachedPassword: (entryId: string): boolean => {
      let hasPassword = false;
      update(state => {
        hasPassword = !!state.cache[entryId];
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
          const cachedPassword = state.cache[entry.id];
          if (cachedPassword) {
            // Try to decrypt with cached password
            decrypt(entry.content, cachedPassword)
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
          } else {
            resolve(null);
          }
          return state;
        });
      });
    },

    // Cache a password for an entry after successful decryption
    cachePassword: (entryId: string, password: string) => {
      update(state => ({
        ...state,
        cache: {
          ...state.cache,
          [entryId]: password
        },
        lastAttemptFailed: false
      }));
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
      const isValid = await decrypt(encryptedContent, password)
        .then(() => true)
        .catch(() => false);

      if (isValid) {
        update(state => ({
          ...state,
          cache: {
            ...state.cache,
            [entryId]: password
          },
          isPrompting: false,
          promptingEntryId: null,
          lastAttemptFailed: false
        }));
        return true;
      } else {
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
    }
  };
}

export const passwordStore = createPasswordStore();