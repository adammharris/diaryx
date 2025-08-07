/**
 * E2E Encryption Service Types
 * 
 * TypeScript interfaces and types for the end-to-end encryption system.
 * Defines the data structures used across all E2E encryption modules.
 */

/**
 * Represents an active E2E encryption session
 */
export interface E2ESession {
  userId: string;
  userKeyPair: import('../../crypto/KeyManager.js').UserKeyPair;
  publicKeyB64: string;
  isUnlocked: boolean;
}

/**
 * Structure for storing encrypted user keys in localStorage
 */
export interface StoredUserKeys {
  encryptedSecretKeyB64: string;
  publicKeyB64: string;
  userId: string;
  // Biometric authentication data (optional)
  biometricEnabled?: boolean;
  encryptedPasswordB64?: string; // E2E password encrypted with biometric data
}