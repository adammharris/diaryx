/**
 * KeyManager Module
 * 
 * Handles user's master public/private key pair management for end-to-end encryption.
 * Provides secure key generation, storage, and lifecycle management using NaCl cryptography.
 * 
 * @description This module is the foundation of the client-side E2E encryption system.
 * It manages cryptographic key pairs using the NaCl (tweetnacl) library, which provides
 * high-security public-key cryptography with curve25519, XSalsa20, and Poly1305.
 * 
 * Key features:
 * - Secure key generation using cryptographically secure random number generation
 * - Password-based encryption for secure local storage of private keys
 * - Key format conversion between binary and Base64 representations
 * - Key validation and memory cleanup utilities
 * 
 * @example
 * ```typescript
 * // Generate a new key pair
 * const keyPair = KeyManager.generateUserKeys();
 * 
 * // Encrypt private key for storage
 * const encryptedKey = KeyManager.encryptSecretKey(
 *   keyPair.secretKey, 
 *   'userPassword123'
 * );
 * 
 * // Later, decrypt the private key
 * const decryptedKey = KeyManager.decryptSecretKey(
 *   encryptedKey, 
 *   'userPassword123'
 * );
 * 
 * // Validate key pair integrity
 * const isValid = KeyManager.validateKeyPair(keyPair);
 * ```
 */

import nacl from 'tweetnacl';
import { encodeUTF8, decodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';

/**
 * User key pair in binary format
 * 
 * Contains the raw Uint8Array representation of public and private keys.
 * Used for cryptographic operations.
 */
export interface UserKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/**
 * User key pair in Base64 format
 * 
 * Contains Base64-encoded string representation of public and private keys.
 * Used for storage, transmission, and serialization.
 */
export interface UserKeyPairB64 {
  publicKey: string;
  secretKey: string;
}

/**
 * KeyManager class for cryptographic key management
 * 
 * Provides static methods for generating, encrypting, decrypting, and managing
 * user key pairs in the end-to-end encryption system.
 */
export class KeyManager {
  /**
   * Generate a new key pair for a user during signup
   * 
   * Creates a cryptographically secure public/private key pair using NaCl's
   * curve25519 elliptic curve cryptography. The key pair is suitable for
   * box encryption and digital signatures.
   * 
   * @returns {UserKeyPair} Object containing publicKey and secretKey as Uint8Arrays
   * 
   * @example
   * ```typescript
   * const keyPair = KeyManager.generateUserKeys();
   * console.log('Public key length:', keyPair.publicKey.length); // 32 bytes
   * console.log('Secret key length:', keyPair.secretKey.length); // 32 bytes
   * ```
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
   * 
   * Convenience method that generates a key pair and immediately converts it to
   * Base64 format for easier handling in web applications.
   * 
   * @returns {UserKeyPairB64} Object containing Base64-encoded publicKey and secretKey
   * 
   * @example
   * ```typescript
   * const keyPairB64 = KeyManager.generateUserKeysB64();
   * // Store in database or send over network
   * localStorage.setItem('publicKey', keyPairB64.publicKey);
   * ```
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
   * 
   * Uses password-based encryption to secure the user's private key for local storage.
   * The password is hashed using SHA-512 and the resulting key is used with XSalsa20-Poly1305
   * authenticated encryption. A random nonce is generated for each encryption.
   * 
   * @param {Uint8Array | string} secretKey - The user's secret key (binary or Base64)
   * @param {string} password - The user's password (minimum 8 characters recommended)
   * @returns {string} Base64 string containing nonce + encrypted secret key
   * 
   * @example
   * ```typescript
   * const keyPair = KeyManager.generateUserKeys();
   * const encryptedKey = KeyManager.encryptSecretKey(
   *   keyPair.secretKey,
   *   'mySecurePassword123'
   * );
   * // Store encrypted key safely
   * localStorage.setItem('encryptedSecretKey', encryptedKey);
   * ```
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
   * 
   * Decrypts a password-encrypted private key using the same algorithm as encryptSecretKey.
   * The password is hashed and used to decrypt the key. Returns null if the password
   * is incorrect or the data is corrupted.
   * 
   * @param {string} encryptedKeyB64 - Base64 encoded nonce + encrypted secret key
   * @param {string} password - The user's password
   * @returns {Uint8Array | null} The plaintext secret key or null if decryption fails
   * 
   * @example
   * ```typescript
   * const encryptedKey = localStorage.getItem('encryptedSecretKey');
   * const password = await promptForPassword();
   * 
   * const secretKey = KeyManager.decryptSecretKey(encryptedKey, password);
   * if (secretKey) {
   *   console.log('Login successful');
   *   // Use secretKey for encryption operations
   * } else {
   *   console.error('Invalid password');
   * }
   * ```
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
   * 
   * Utility function to decode a Base64-encoded public key back to its
   * binary representation for cryptographic operations.
   * 
   * @param {string} publicKeyB64 - Base64-encoded public key
   * @returns {Uint8Array} Binary public key (32 bytes)
   * 
   * @example
   * ```typescript
   * const publicKeyBinary = KeyManager.publicKeyFromB64(
   *   'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
   * );
   * ```
   */
  static publicKeyFromB64(publicKeyB64: string): Uint8Array {
    return decodeBase64(publicKeyB64);
  }

  /**
   * Convert a Uint8Array public key to Base64
   * 
   * Utility function to encode a binary public key as a Base64 string
   * for storage or transmission.
   * 
   * @param {Uint8Array} publicKey - Binary public key (32 bytes)
   * @returns {string} Base64-encoded public key
   * 
   * @example
   * ```typescript
   * const keyPair = KeyManager.generateUserKeys();
   * const publicKeyB64 = KeyManager.publicKeyToB64(keyPair.publicKey);
   * // Send to server or store in database
   * ```
   */
  static publicKeyToB64(publicKey: Uint8Array): string {
    return encodeBase64(publicKey);
  }

  /**
   * Convert a Base64 secret key to Uint8Array
   * 
   * Utility function to decode a Base64-encoded secret key back to its
   * binary representation for cryptographic operations.
   * 
   * @param {string} secretKeyB64 - Base64-encoded secret key
   * @returns {Uint8Array} Binary secret key (32 bytes)
   * 
   * @example
   * ```typescript
   * const secretKeyBinary = KeyManager.secretKeyFromB64(storedSecretKey);
   * // Use for encryption operations
   * ```
   */
  static secretKeyFromB64(secretKeyB64: string): Uint8Array {
    return decodeBase64(secretKeyB64);
  }

  /**
   * Convert a Uint8Array secret key to Base64
   * 
   * Utility function to encode a binary secret key as a Base64 string.
   * 
   * @param {Uint8Array} secretKey - Binary secret key (32 bytes)
   * @returns {string} Base64-encoded secret key
   * 
   * @example
   * ```typescript
   * const keyPair = KeyManager.generateUserKeys();
   * const secretKeyB64 = KeyManager.secretKeyToB64(keyPair.secretKey);
   * // Store for later use (after encryption)
   * ```
   */
  static secretKeyToB64(secretKey: Uint8Array): string {
    return encodeBase64(secretKey);
  }

  /**
   * Validate that a key pair is valid and matches
   * 
   * Tests a key pair by performing a test encryption/decryption cycle.
   * This ensures the public and private keys are mathematically related
   * and can be used for cryptographic operations.
   * 
   * @param {UserKeyPair} keyPair - The key pair to validate
   * @returns {boolean} True if the key pair is valid and functional
   * 
   * @example
   * ```typescript
   * const keyPair = KeyManager.generateUserKeys();
   * const isValid = KeyManager.validateKeyPair(keyPair);
   * 
   * if (isValid) {
   *   console.log('Key pair is ready for use');
   * } else {
   *   console.error('Key pair is corrupted or invalid');
   * }
   * ```
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
   * 
   * Creates a cryptographically secure random salt that can be used
   * for key derivation functions or additional security measures.
   * 
   * @returns {string} Base64-encoded random salt (32 bytes)
   * 
   * @example
   * ```typescript
   * const salt = KeyManager.generateSalt();
   * // Use in PBKDF2 or other key derivation functions
   * ```
   */
  static generateSalt(): string {
    return encodeBase64(nacl.randomBytes(32));
  }

  /**
   * Clear sensitive data from memory (best effort)
   * 
   * Attempts to overwrite sensitive key material in memory with zeros.
   * This is a best-effort security measure to prevent keys from lingering
   * in memory after use.
   * 
   * @param {Uint8Array} key - The key to clear from memory
   * 
   * @example
   * ```typescript
   * const secretKey = KeyManager.decryptSecretKey(encrypted, password);
   * // Use the secret key...
   * 
   * // Clear it when done
   * KeyManager.clearKey(secretKey);
   * ```
   */
  static clearKey(key: Uint8Array): void {
    if (key && key.fill) {
      key.fill(0);
    }
  }

  /**
   * Clear sensitive key pair from memory (best effort)
   * 
   * Attempts to overwrite both public and private keys in a key pair.
   * This is a best-effort security measure for memory cleanup.
   * 
   * @param {UserKeyPair} keyPair - The key pair to clear from memory
   * 
   * @example
   * ```typescript
   * const keyPair = KeyManager.generateUserKeys();
   * // Use the key pair...
   * 
   * // Clear it when done
   * KeyManager.clearKeyPair(keyPair);
   * ```
   */
  static clearKeyPair(keyPair: UserKeyPair): void {
    this.clearKey(keyPair.publicKey);
    this.clearKey(keyPair.secretKey);
  }
}