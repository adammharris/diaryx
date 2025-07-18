/**
 * Encryption Service for Diaryx
 * Centralized encryption/decryption with session management
 */

import { writable } from 'svelte/store';
import { encrypt, decrypt, isEncrypted } from '../utils/crypto.js';
import type { JournalEntry } from '../storage/types.js';

interface PasswordSession {
  password: string;
  cachedAt: number;
  lastUsed: number;
  decryptedContent?: string;
}

interface EncryptionState {
  sessions: Map<string, PasswordSession>;
  isPrompting: boolean;
  promptingEntryId: string | null;
  lastAttemptFailed: boolean;
  sessionTimeout: number;
}

class EncryptionService {
  private state: EncryptionState = {
    sessions: new Map(),
    isPrompting: false,
    promptingEntryId: null,
    lastAttemptFailed: false,
    sessionTimeout: 2 * 60 * 60 * 1000 // 2 hours
  };

  private store = writable(this.state);
  private cleanupTimer: number | null = null;
  private notifyMetadataUpdate?: (entryId: string, decryptedContent: string) => void;

  constructor() {
    this.startCleanupTimer();
  }

  private updateStore(): void {
    this.store.set({ ...this.state });
  }

  // Public subscribe method for reactivity
  subscribe = this.store.subscribe;

  // Session Management
  hasCachedPassword(entryId: string): boolean {
    const session = this.state.sessions.get(entryId);
    if (!session) return false;

    const now = Date.now();
    const isExpired = (now - session.lastUsed) > this.state.sessionTimeout;
    
    if (isExpired) {
      this.state.sessions.delete(entryId);
      this.updateStore();
      return false;
    }
    
    return true;
  }

  cachePassword(entryId: string, password: string, decryptedContent?: string): void {
    const now = Date.now();
    this.state.sessions.set(entryId, {
      password,
      cachedAt: now,
      lastUsed: now,
      decryptedContent
    });
    this.state.lastAttemptFailed = false;
    this.updateStore();

    // Update metadata with decrypted content if provided
    if (decryptedContent) {
      this.notifyMetadataUpdate?.(entryId, decryptedContent);
    }
  }

  clearPassword(entryId: string): void {
    this.state.sessions.delete(entryId);
    this.updateStore();
  }

  clearAllPasswords(): void {
    this.state.sessions.clear();
    this.state.isPrompting = false;
    this.state.promptingEntryId = null;
    this.state.lastAttemptFailed = false;
    this.updateStore();
  }

  getCachedDecryptedContent(entryId: string): string | null {
    const session = this.state.sessions.get(entryId);
    if (!session?.decryptedContent) return null;

    const now = Date.now();
    const isExpired = (now - session.cachedAt) > this.state.sessionTimeout;
    
    if (isExpired) {
      this.state.sessions.delete(entryId);
      this.updateStore();
      return null;
    }

    // Update last used time
    session.lastUsed = now;
    this.updateStore();
    return session.decryptedContent;
  }

  // Encryption Operations
  async encryptContent(content: string, password: string): Promise<string> {
    return await encrypt(content, password);
  }

  async decryptContent(encryptedContent: string, password: string): Promise<string> {
    return await decrypt(encryptedContent, password);
  }

  isContentEncrypted(content: string): boolean {
    return isEncrypted(content);
  }

  // Entry Operations
  async tryDecryptEntry(entry: JournalEntry): Promise<JournalEntry | null> {
    if (!this.isContentEncrypted(entry.content)) {
      return entry;
    }

    const session = this.state.sessions.get(entry.id);
    if (!session) return null;

    const now = Date.now();
    const isExpired = (now - session.lastUsed) > this.state.sessionTimeout;
    
    if (isExpired) {
      this.state.sessions.delete(entry.id);
      this.updateStore();
      return null;
    }

    try {
      session.lastUsed = now;
      const decryptedContent = await this.decryptContent(entry.content, session.password);
      
      // Cache the decrypted content
      session.decryptedContent = decryptedContent;
      this.updateStore();
      
      return {
        ...entry,
        content: decryptedContent
      };
    } catch (error) {
      // Password is invalid, remove from cache
      this.state.sessions.delete(entry.id);
      this.updateStore();
      return null;
    }
  }

  async encryptEntry(entry: JournalEntry, entryId: string): Promise<string> {
    const session = this.state.sessions.get(entryId);
    if (!session) {
      throw new Error('No cached password found for entry');
    }

    return await this.encryptContent(entry.content, session.password);
  }

  async validatePassword(encryptedContent: string, password: string): Promise<boolean> {
    try {
      await this.decryptContent(encryptedContent, password);
      return true;
    } catch {
      return false;
    }
  }

  // Prompt Management
  startPrompting(entryId: string): void {
    this.state.isPrompting = true;
    this.state.promptingEntryId = entryId;
    this.state.lastAttemptFailed = false;
    this.updateStore();
  }

  endPrompting(): void {
    this.state.isPrompting = false;
    this.state.promptingEntryId = null;
    this.state.lastAttemptFailed = false;
    this.updateStore();
  }

  handleFailedAttempt(): void {
    this.state.lastAttemptFailed = true;
    this.updateStore();
  }

  async submitPassword(entryId: string, password: string, encryptedContent: string): Promise<boolean> {
    try {
      const decryptedContent = await this.decryptContent(encryptedContent, password);
      
      // Success - cache password
      this.cachePassword(entryId, password, decryptedContent);
      this.state.isPrompting = false;
      this.state.promptingEntryId = null;
      this.state.lastAttemptFailed = false;
      this.updateStore();

      // Update metadata with decrypted content for preview
      if (decryptedContent) {
        this.notifyMetadataUpdate?.(entryId, decryptedContent);
      }

      return true;
    } catch {
      this.state.lastAttemptFailed = true;
      this.updateStore();
      return false;
    }
  }

  // Batch Operations
  async batchUnlock(password: string, encryptedEntries: JournalEntry[]): Promise<{
    successCount: number;
    failedEntries: string[];
    unlockedEntries: string[];
  }> {
    const results = {
      successCount: 0,
      failedEntries: [] as string[],
      unlockedEntries: [] as string[]
    };

    const now = Date.now();
    
    for (const entry of encryptedEntries) {
      try {
        const decryptedContent = await this.decryptContent(entry.content, password);
        
        // Success - cache the password
        this.state.sessions.set(entry.id, {
          password,
          cachedAt: now,
          lastUsed: now,
          decryptedContent
        });
        
        results.successCount++;
        results.unlockedEntries.push(entry.id);
      } catch {
        results.failedEntries.push(entry.id);
      }
    }

    this.updateStore();

    // Update metadata for successfully decrypted entries
    if (results.unlockedEntries.length > 0 && this.notifyMetadataUpdate) {
      for (const entryId of results.unlockedEntries) {
        const session = this.state.sessions.get(entryId);
        if (session?.decryptedContent) {
          this.notifyMetadataUpdate(entryId, session.decryptedContent);
        }
      }
    }

    return results;
  }

  // Getters for reactive state
  get isPrompting(): boolean {
    return this.state.isPrompting;
  }

  get promptingEntryId(): string | null {
    return this.state.promptingEntryId;
  }

  get lastAttemptFailed(): boolean {
    return this.state.lastAttemptFailed;
  }

  get sessionTimeout(): number {
    return this.state.sessionTimeout;
  }

  setSessionTimeout(timeoutMs: number): void {
    this.state.sessionTimeout = timeoutMs;
    this.updateStore();
  }

  // Cleanup Management
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const sessionsToDelete: string[] = [];

      for (const [entryId, session] of this.state.sessions) {
        if ((now - session.lastUsed) > this.state.sessionTimeout) {
          sessionsToDelete.push(entryId);
        }
      }

      if (sessionsToDelete.length > 0) {
        for (const entryId of sessionsToDelete) {
          this.state.sessions.delete(entryId);
        }
        this.updateStore();
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // Statistics
  getCacheStats(): {
    totalCached: number;
    expiredCount: number;
    oldestCacheTime: number | null;
    newestCacheTime: number | null;
  } {
    const now = Date.now();
    const sessions = Array.from(this.state.sessions.values());
    const expired = sessions.filter(s => (now - s.lastUsed) > this.state.sessionTimeout);
    
    return {
      totalCached: sessions.length,
      expiredCount: expired.length,
      oldestCacheTime: sessions.length > 0 ? Math.min(...sessions.map(s => s.cachedAt)) : null,
      newestCacheTime: sessions.length > 0 ? Math.max(...sessions.map(s => s.cachedAt)) : null
    };
  }

  // Method to set metadata update callback
  setMetadataUpdateCallback(callback: (entryId: string, decryptedContent: string) => void): void {
    this.notifyMetadataUpdate = callback;
  }
}

export const encryptionService = new EncryptionService();