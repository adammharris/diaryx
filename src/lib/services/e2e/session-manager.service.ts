/**
 * E2E Session Manager Service
 * 
 * Manages E2E encryption session state and reactive updates.
 * Handles session creation, validation, locking/unlocking, and store management.
 */

import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import { KeyManager } from '../../crypto/KeyManager.js';
import { e2eStorage } from './storage.service.js';
import type { E2ESession, StoredUserKeys } from './types.js';

/**
 * E2E Session Manager Service
 * 
 * Manages the active encryption session and provides reactive updates.
 */
export class E2ESessionManager {
  private currentSession: E2ESession | null = null;
  private sessionStore: Writable<E2ESession | null> = writable(null);

  constructor() {
    if (browser) {
      this.initializeFromStorage();
    }
  }

  /**
   * Initialize session from stored data
   * 
   * Attempts to restore a locked session from localStorage.
   */
  private initializeFromStorage(): void {
    const sessionData = e2eStorage.initializeFromStorage();
    if (sessionData) {
      // Create locked session
      const session: E2ESession = {
        userId: sessionData.userId!,
        userKeyPair: { publicKey: new Uint8Array(), secretKey: new Uint8Array() },
        publicKeyB64: sessionData.publicKeyB64!,
        isUnlocked: false
      };

      this.currentSession = session;
      this.sessionStore.set(session);
    }
  }

  /**
   * Create a new unlocked session
   * 
   * @param {string} userId - User identifier
   * @param {import('../../crypto/KeyManager.js').UserKeyPair} userKeyPair - User's key pair
   * @param {string} publicKeyB64 - Base64-encoded public key
   * @returns {E2ESession} The created session
   */
  createSession(userId: string, userKeyPair: import('../../crypto/KeyManager.js').UserKeyPair, publicKeyB64: string): E2ESession {
    const session: E2ESession = {
      userId,
      userKeyPair,
      publicKeyB64,
      isUnlocked: true
    };

    this.currentSession = session;
    this.sessionStore.set(session);
    
    return session;
  }

  /**
   * Update the current session
   * 
   * @param {E2ESession} session - Updated session data
   */
  updateSession(session: E2ESession): void {
    this.currentSession = session;
    this.sessionStore.set(session);
  }

  /**
   * Get current session (read-only copy)
   * 
   * @returns {E2ESession | null} Current session or null
   */
  getCurrentSession(): E2ESession | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  /**
   * Check if session is unlocked
   * 
   * @returns {boolean} True if session is unlocked and ready for crypto operations
   */
  isUnlocked(): boolean {
    return this.currentSession?.isUnlocked || false;
  }

  /**
   * Get current user's public key (Base64)
   * 
   * @returns {string | null} Base64-encoded public key or null
   */
  getCurrentPublicKey(): string | null {
    return this.currentSession?.publicKeyB64 || null;
  }

  /**
   * Get current user ID
   * 
   * @returns {string | null} User ID or null
   */
  getCurrentUserId(): string | null {
    return this.currentSession?.userId || null;
  }

  /**
   * Validate current session integrity
   * 
   * @returns {boolean} True if session is valid
   */
  validateSession(): boolean {
    if (!this.currentSession || !this.currentSession.isUnlocked) {
      return false;
    }
    
    try {
      return KeyManager.validateKeyPair(this.currentSession.userKeyPair);
    } catch (error) {
      console.error('Session validation failed:', error);
      this.logout();
      return false;
    }
  }

  /**
   * Lock the current session
   * 
   * Keeps keys in memory but marks session as locked.
   */
  lockSession(): void {
    if (this.currentSession) {
      this.currentSession.isUnlocked = false;
      this.sessionStore.set(this.currentSession);
    }
  }

  /**
   * Unlock session with password verification
   * 
   * @param {string} password - User's password for verification
   * @returns {boolean} True if unlock successful
   */
  unlockSession(password: string): boolean {
    if (!this.currentSession || this.currentSession.isUnlocked) {
      return false;
    }
    
    if (!password || typeof password !== 'string') {
      return false;
    }
    
    try {
      const storedKeys = e2eStorage.getStoredKeys();
      if (!storedKeys) {
        return false;
      }
      
      const secretKey = KeyManager.decryptSecretKey(storedKeys.encryptedSecretKeyB64, password);
      
      if (!secretKey) {
        return false;
      }
      
      // Update session with decrypted key pair
      const userKeyPair = {
        publicKey: KeyManager.publicKeyFromB64(storedKeys.publicKeyB64),
        secretKey
      };

      // Validate key pair
      if (!KeyManager.validateKeyPair(userKeyPair)) {
        KeyManager.clearKeyPair(userKeyPair);
        return false;
      }

      this.currentSession.userKeyPair = userKeyPair;
      this.currentSession.isUnlocked = true;
      this.sessionStore.set(this.currentSession);
      return true;
    } catch (error) {
      console.error('Session unlock failed:', error);
      return false;
    }
  }

  /**
   * Logout - clear session and sensitive data
   * 
   * Securely clears the current session and removes sensitive key material from memory.
   */
  logout(): void {
    if (this.currentSession && this.currentSession.userKeyPair) {
      // Clear sensitive data from memory
      KeyManager.clearKeyPair(this.currentSession.userKeyPair);
    }
    
    this.currentSession = null;
    this.sessionStore.set(null);
  }

  /**
   * Get reactive store for UI updates
   * 
   * @returns {Writable<E2ESession | null>} Reactive store for session state
   */
  get store(): Writable<E2ESession | null> {
    return this.sessionStore;
  }

  /**
   * Check if user has a session (locked or unlocked)
   * 
   * @returns {boolean} True if session exists
   */
  hasSession(): boolean {
    return !!this.currentSession;
  }

  /**
   * Get session status information
   * 
   * @returns {Object} Session status details
   */
  getSessionStatus(): {
    hasSession: boolean;
    isUnlocked: boolean;
    userId: string | null;
    hasStoredKeys: boolean;
  } {
    return {
      hasSession: this.hasSession(),
      isUnlocked: this.isUnlocked(),
      userId: this.getCurrentUserId(),
      hasStoredKeys: e2eStorage.hasStoredKeys()
    };
  }
}

// Export singleton instance
export const sessionManager = new E2ESessionManager();