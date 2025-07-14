/**
 * Encryption utilities for Diaryx
 * Provides client-side encryption for journal entries using Noble crypto libraries
 */

import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import type { JournalEntry } from '../storage.js';

// Constants for encryption
const SALT_LENGTH = 32;
const IV_LENGTH = 12; // GCM recommended IV length
const TAG_LENGTH = 16; // GCM tag length
const PBKDF2_ITERATIONS = 100000; // OWASP recommended minimum

/**
 * Derives an encryption key from a password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const passwordBytes = new TextEncoder().encode(password);
  return pbkdf2(sha256, passwordBytes, salt, { c: PBKDF2_ITERATIONS, dkLen: 32 });
}

/**
 * Encrypts plaintext data with a password
 * Returns base64-encoded encrypted data with embedded salt and IV
 */
export async function encrypt(plaintext: string, password: string): Promise<string> {
  try {
    // Generate random salt and IV
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    
    // Derive encryption key from password
    const key = await deriveKey(password, salt);
    
    // Encrypt the data
    const plaintextBytes = new TextEncoder().encode(plaintext);
    const cipher = gcm(key, iv);
    const encrypted = cipher.encrypt(plaintextBytes);
    
    // Combine salt + iv + encrypted data
    const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + encrypted.length);
    combined.set(salt, 0);
    combined.set(iv, SALT_LENGTH);
    combined.set(encrypted, SALT_LENGTH + IV_LENGTH);
    
    // Return base64 encoded result
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypts base64-encoded encrypted data with a password
 */
export async function decrypt(encryptedData: string, password: string): Promise<string> {
  try {
    // Decode base64
    const combined = new Uint8Array(
      atob(encryptedData)
        .split('')
        .map(char => char.charCodeAt(0))
    );
    
    // Extract salt, IV, and encrypted data
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH);
    
    // Derive the same key from password and salt
    const key = await deriveKey(password, salt);
    
    // Decrypt the data
    const cipher = gcm(key, iv);
    const decrypted = cipher.decrypt(encrypted);
    
    // Convert back to string
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Invalid password or corrupted data'}`);
  }
}

/**
 * Validates if a string appears to be encrypted data
 */
export function isEncrypted(data: string): boolean {
  try {
    // Check if it's valid base64 and has minimum expected length
    const decoded = atob(data);
    return decoded.length >= SALT_LENGTH + IV_LENGTH + TAG_LENGTH;
  } catch {
    return false;
  }
}

/**
 * Generates a cryptographically secure random password
 */
export function generateSecurePassword(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const randomArray = randomBytes(length);
  return Array.from(randomArray, byte => chars[byte % chars.length]).join('');
}

/**
 * Estimates password strength (basic implementation)
 */
export function estimatePasswordStrength(password: string): 'weak' | 'medium' | 'strong' {
  if (password.length < 8) return 'weak';
  
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSymbols = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  const criteria = [hasLower, hasUpper, hasNumbers, hasSymbols].filter(Boolean).length;
  
  if (password.length >= 12 && criteria >= 3) return 'strong';
  if (password.length >= 8 && criteria >= 2) return 'medium';
  return 'weak';
}

/**
 * Encrypts a journal entry's content
 */
export async function encryptEntry(entry: JournalEntry, password: string): Promise<JournalEntry> {
  const encryptedContent = await encrypt(entry.content, password);
  return {
    ...entry,
    content: encryptedContent,
    modified_at: new Date().toISOString()
  };
}

/**
 * Decrypts a journal entry's content
 */
export async function decryptEntry(entry: JournalEntry, password: string): Promise<JournalEntry> {
  const decryptedContent = await decrypt(entry.content, password);
  return {
    ...entry,
    content: decryptedContent
  };
}

/**
 * Checks if a journal entry appears to be encrypted
 */
export function isEntryEncrypted(entry: JournalEntry): boolean {
  return isEncrypted(entry.content);
}

/**
 * Creates an encryption status indicator for UI
 */
export function getEncryptionStatus(entry: JournalEntry): {
  isEncrypted: boolean;
  indicator: string;
  description: string;
} {
  const encrypted = isEntryEncrypted(entry);
  return {
    isEncrypted: encrypted,
    indicator: encrypted ? '🔒' : '📝',
    description: encrypted ? 'This entry is encrypted' : 'This entry is not encrypted'
  };
}