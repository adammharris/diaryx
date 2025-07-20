/**
 * KeyManager Module - Handles user's master public/private key pair
 * Part of the client-side E2E encryption system
 */

import nacl from 'tweetnacl';
import { encodeUTF8, decodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';

export interface UserKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface UserKeyPairB64 {
  publicKey: string;
  secretKey: string;
}

export class KeyManager {
  /**
   * Generate a new key pair for a user during signup
   */
  static generateUserKeys(): UserKeyPair {
    const keyPair = nacl.box.keyPair();
    return {
      publicKey: keyPair.publicKey,
      secretKey: keyPair.secretKey
    };
  }

  /**
   * Generate a new key pair and return as Base64 strings for easy storage/transmission
   */
  static generateUserKeysB64(): UserKeyPairB64 {
    const keyPair = this.generateUserKeys();
    return {
      publicKey: encodeBase64(keyPair.publicKey),
      secretKey: encodeBase64(keyPair.secretKey)
    };
  }

  /**
   * Securely encrypt the user's private key for storage in browser's Local Storage
   * @param secretKey - The user's secret key (Uint8Array or Base64 string)
   * @param password - The user's password
   * @returns Base64 string containing nonce + encrypted secret key
   */
  static encryptSecretKey(secretKey: Uint8Array | string, password: string): string {
    // Convert secretKey to Uint8Array if it's a string
    const secretKeyBytes = typeof secretKey === 'string' ? decodeBase64(secretKey) : secretKey;
    
    // Generate a random nonce for this encryption
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    
    // Create a key from the user's password using nacl.hash
    const passwordBytes = encodeUTF8(password);
    // Ensure passwordBytes is a Uint8Array for nacl.hash - handle different build environments
    let passwordBytesArray: Uint8Array;
    if (passwordBytes instanceof Uint8Array) {
      passwordBytesArray = passwordBytes;
    } else if (typeof passwordBytes === 'string') {
      // In some builds, encodeUTF8 returns a string, convert it manually
      passwordBytesArray = new TextEncoder().encode(password);
    } else {
      // Fallback: assume it's array-like
      passwordBytesArray = new Uint8Array(passwordBytes);
    }
    const passwordKey = nacl.hash(passwordBytesArray).slice(0, nacl.secretbox.keyLength);
    
    // Encrypt the secret key
    const encryptedSecretKey = nacl.secretbox(secretKeyBytes, nonce, passwordKey);
    
    // Combine nonce + encrypted key and encode as Base64
    const combined = new Uint8Array(nonce.length + encryptedSecretKey.length);
    combined.set(nonce);
    combined.set(encryptedSecretKey, nonce.length);
    
    return encodeBase64(combined);
  }

  /**
   * Decrypt the stored private key on login
   * @param encryptedKeyB64 - Base64 encoded nonce + encrypted secret key
   * @param password - The user's password
   * @returns The plaintext secret key as Uint8Array, or null if decryption fails
   */
  static decryptSecretKey(encryptedKeyB64: string, password: string): Uint8Array | null {
    try {
      // Decode the Base64 string
      const combined = decodeBase64(encryptedKeyB64);
      
      // Extract nonce and encrypted key
      const nonce = combined.slice(0, nacl.secretbox.nonceLength);
      const encryptedSecretKey = combined.slice(nacl.secretbox.nonceLength);
      
      // Derive the password key (must be exact same method as encryption)
      const passwordBytes = encodeUTF8(password);
      // Ensure passwordBytes is a Uint8Array for nacl.hash - handle different build environments
      let passwordBytesArray: Uint8Array;
      if (passwordBytes instanceof Uint8Array) {
        passwordBytesArray = passwordBytes;
      } else if (typeof passwordBytes === 'string') {
        // In some builds, encodeUTF8 returns a string, convert it manually
        passwordBytesArray = new TextEncoder().encode(password);
      } else {
        // Fallback: assume it's array-like
        passwordBytesArray = new Uint8Array(passwordBytes);
      }
      const passwordKey = nacl.hash(passwordBytesArray).slice(0, nacl.secretbox.keyLength);
      
      // Decrypt the secret key
      const decryptedSecretKey = nacl.secretbox.open(encryptedSecretKey, nonce, passwordKey);
      
      return decryptedSecretKey;
    } catch (error) {
      console.error('Failed to decrypt secret key:', error);
      return null;
    }
  }

  /**
   * Convert a Base64 public key to Uint8Array
   */
  static publicKeyFromB64(publicKeyB64: string): Uint8Array {
    return decodeBase64(publicKeyB64);
  }

  /**
   * Convert a Uint8Array public key to Base64
   */
  static publicKeyToB64(publicKey: Uint8Array): string {
    return encodeBase64(publicKey);
  }

  /**
   * Convert a Base64 secret key to Uint8Array
   */
  static secretKeyFromB64(secretKeyB64: string): Uint8Array {
    return decodeBase64(secretKeyB64);
  }

  /**
   * Convert a Uint8Array secret key to Base64
   */
  static secretKeyToB64(secretKey: Uint8Array): string {
    return encodeBase64(secretKey);
  }

  /**
   * Validate that a key pair is valid and matches
   */
  static validateKeyPair(keyPair: UserKeyPair): boolean {
    try {
      // Test encryption/decryption with the key pair
      const testMessageStr = 'test message';
      const testMessage = new TextEncoder().encode(testMessageStr);
      const testNonce = nacl.randomBytes(nacl.box.nonceLength);
      
      const encrypted = nacl.box(testMessage, testNonce, keyPair.publicKey, keyPair.secretKey);
      const decrypted = nacl.box.open(encrypted, testNonce, keyPair.publicKey, keyPair.secretKey);
      
      return decrypted !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate a random salt for additional security (if needed)
   */
  static generateSalt(): string {
    return encodeBase64(nacl.randomBytes(32));
  }

  /**
   * Clear sensitive data from memory (best effort)
   */
  static clearKey(key: Uint8Array): void {
    if (key && key.fill) {
      key.fill(0);
    }
  }

  /**
   * Clear sensitive key pair from memory (best effort)
   */
  static clearKeyPair(keyPair: UserKeyPair): void {
    this.clearKey(keyPair.publicKey);
    this.clearKey(keyPair.secretKey);
  }
}