/**
 * EntryCryptor Module - Handles encryption and decryption of individual journal entries
 * Part of the client-side E2E encryption system
 */

import nacl from 'tweetnacl';
import { decodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';
import type { UserKeyPair } from './KeyManager.js';

/**
 * Helper function to convert Uint8Array to hex string (for non-sensitive debugging only)
 */
function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Securely clear a Uint8Array from memory
 */
function secureClear(arr: Uint8Array): void {
  if (arr && arr.fill) {
    arr.fill(0);
  }
}

export interface EntryObject {
  title: string;
  content: string;
  frontmatter?: Record<string, any>;
  tags?: string[];
  [key: string]: any;
}

export interface EncryptedEntryData {
  encryptedContentB64: string;
  contentNonceB64: string;
  encryptedEntryKeyB64: string;
  keyNonceB64: string;
}

export interface RewrappedKey {
  encryptedEntryKeyB64: string;
  keyNonceB64: string;
}

export class EntryCryptor {
  /**
   * Encrypt a new entry for the owner
   * @param entryObject - The entry data to encrypt
   * @param ownerKeyPair - The owner's public/private key pair
   * @returns Object ready to be sent to the API
   */
  static encryptEntry(entryObject: EntryObject, ownerKeyPair: UserKeyPair): EncryptedEntryData {
    // Input validation
    if (!entryObject || typeof entryObject !== 'object') {
      throw new Error('Invalid entry object provided');
    }
    
    if (!ownerKeyPair?.publicKey || !ownerKeyPair?.secretKey) {
      throw new Error('Invalid key pair provided');
    }
    
    if (ownerKeyPair.publicKey.length !== nacl.box.publicKeyLength || 
        ownerKeyPair.secretKey.length !== nacl.box.secretKeyLength) {
      throw new Error('Invalid key pair lengths');
    }

    try {
      // Generate a new random symmetric key for this entry
      const entryKey = nacl.randomBytes(nacl.secretbox.keyLength);
      
      // Serialize the entry object to JSON and convert to bytes
      const entryJson = JSON.stringify(entryObject);
      const entryBytes = new TextEncoder().encode(entryJson);
      
      // Generate nonce for content encryption
      const contentNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      
      // Encrypt the entry content with the symmetric key
      const encryptedContent = nacl.secretbox(entryBytes, contentNonce, entryKey);

      // Encrypt the entry key with the owner's public key (asymmetric encryption)
      const keyNonce = nacl.randomBytes(nacl.box.nonceLength);
      const encryptedEntryKey = nacl.box(entryKey, keyNonce, ownerKeyPair.publicKey, ownerKeyPair.secretKey);

      // Clear the entry key from memory
      secureClear(entryKey);
      
      return {
        encryptedContentB64: encodeBase64(encryptedContent),
        contentNonceB64: encodeBase64(contentNonce),
        encryptedEntryKeyB64: encodeBase64(encryptedEntryKey),
        keyNonceB64: encodeBase64(keyNonce)
      };
    } catch (error) {
      throw new Error(`Entry encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }  /**
   * Decrypt an entry (either owned or shared)
   * @param encryptedData - The encrypted entry data from the API
   * @param userSecretKey - The current user's secret key
   * @param authorPublicKey - The entry author's public key
   * @returns The decrypted entry object, or null if decryption fails
   */
  static decryptEntry(
    encryptedData: EncryptedEntryData,
    userSecretKey: Uint8Array,
    authorPublicKey: Uint8Array
  ): EntryObject | null {
    // Input validation
    if (!this.validateEncryptedEntryData(encryptedData)) {
      console.error('Invalid encrypted entry data structure');
      return null;
    }
    
    if (!userSecretKey || userSecretKey.length !== nacl.box.secretKeyLength) {
      console.error('Invalid user secret key');
      return null;
    }
    
    if (!authorPublicKey || authorPublicKey.length !== nacl.box.publicKeyLength) {
      console.error('Invalid author public key');
      return null;
    }

    try {
      console.log('=== Base64 Decoding Debug ===');
      console.log('Input data lengths (Base64):', {
        encryptedContent: encryptedData.encryptedContentB64.length,
        contentNonce: encryptedData.contentNonceB64.length,
        encryptedEntryKey: encryptedData.encryptedEntryKeyB64.length,
        keyNonce: encryptedData.keyNonceB64.length
      });
      
      // Decode the Base64 data
      const encryptedContent = decodeBase64(encryptedData.encryptedContentB64);
      const contentNonce = decodeBase64(encryptedData.contentNonceB64);
      const encryptedEntryKey = decodeBase64(encryptedData.encryptedEntryKeyB64);
      const keyNonce = decodeBase64(encryptedData.keyNonceB64);
      
      console.log('Decoded data lengths (bytes):', {
        encryptedContent: encryptedContent.length,
        contentNonce: contentNonce.length,
        encryptedEntryKey: encryptedEntryKey.length,
        keyNonce: keyNonce.length
      });
      
      // Validate decoded data lengths
      if (contentNonce.length !== nacl.secretbox.nonceLength) {
        console.error('Invalid content nonce length:', contentNonce.length, 'expected:', nacl.secretbox.nonceLength);
        return null;
      }
      
      if (keyNonce.length !== nacl.box.nonceLength) {
        console.error('Invalid key nonce length:', keyNonce.length, 'expected:', nacl.box.nonceLength);
        return null;
      }
      
      // Validate encrypted content has minimum length (should include auth tag)
      if (encryptedContent.length < nacl.secretbox.overheadLength) {
        console.error('Encrypted content too short:', encryptedContent.length, 'minimum required:', nacl.secretbox.overheadLength);
        return null;
      }
      
      // Decrypt the entry key using box (asymmetric decryption)
      const entryKey = nacl.box.open(encryptedEntryKey, keyNonce, authorPublicKey, userSecretKey);
      
      if (!entryKey) {
        console.error('Failed to decrypt entry key');
        return null;
      }
      
      console.log('=== Detailed Symmetric Decryption Debug ===');
      console.log('Entry key successfully decrypted, length:', entryKey.length);
      console.log('Content nonce length:', contentNonce.length);
      console.log('Encrypted content length:', encryptedContent.length);
      console.log('Expected content nonce length:', nacl.secretbox.nonceLength);
      
      // Additional validation before symmetric decryption
      if (entryKey.length !== nacl.secretbox.keyLength) {
        console.error('Invalid entry key length:', entryKey.length, 'expected:', nacl.secretbox.keyLength);
        secureClear(entryKey);
        return null;
      }
      
      // Use the decrypted entry key to decrypt the content (symmetric decryption)
      const decryptedContentBytes = nacl.secretbox.open(encryptedContent, contentNonce, entryKey);
      
      console.log('Decryption debug:', {
        entryKeyLength: entryKey?.length,
        encryptedContentLength: encryptedContent?.length,
        contentNonceLength: contentNonce?.length,
        decryptedContentBytes: decryptedContentBytes ? `Success - ${decryptedContentBytes.length} bytes` : 'null'
      });
      
      if (!decryptedContentBytes) {
        console.error('Failed to decrypt entry content - nacl.secretbox.open returned null');
        // Clear the entry key from memory
        secureClear(entryKey);
        return null;
      }
      
      // Convert decrypted bytes to string and parse JSON
      const entryJson = new TextDecoder().decode(decryptedContentBytes);
      const entryObject = JSON.parse(entryJson) as EntryObject;
      
      // Clear sensitive data from memory
      secureClear(entryKey);
      
      return entryObject;
    } catch (error) {
      console.error('Entry decryption failed:', error);
      return null;
    }
  }

  /**
   * Re-encrypt an entry key for another user during sharing
   * @param encryptedEntryKey - The encrypted entry key (Base64)
   * @param keyNonce - The nonce used for the entry key encryption (Base64)
   * @param authorKeyPair - The author's key pair (to decrypt the entry key)
   * @param recipientPublicKey - The recipient's public key (to re-encrypt for them)
   * @returns The newly encrypted key and nonce as Base64 strings
   */
  static rewrapEntryKey(
    encryptedEntryKey: string,
    keyNonce: string,
    authorKeyPair: UserKeyPair,
    recipientPublicKey: Uint8Array
  ): RewrappedKey | null {
    // Input validation
    if (!encryptedEntryKey || !keyNonce) {
      console.error('Missing encrypted entry key or nonce');
      return null;
    }
    
    if (!authorKeyPair?.publicKey || !authorKeyPair?.secretKey) {
      console.error('Invalid author key pair');
      return null;
    }
    
    if (!recipientPublicKey || recipientPublicKey.length !== nacl.box.publicKeyLength) {
      console.error('Invalid recipient public key');
      return null;
    }

    try {
      // Decode the encrypted entry key and nonce
      const encryptedKeyBytes = decodeBase64(encryptedEntryKey);
      const nonceBytes = decodeBase64(keyNonce);
      
      // Validate nonce length
      if (nonceBytes.length !== nacl.box.nonceLength) {
        console.error('Invalid nonce length');
        return null;
      }
      
      // Decrypt the entry key using the author's keys
      const entryKey = nacl.box.open(encryptedKeyBytes, nonceBytes, authorKeyPair.publicKey, authorKeyPair.secretKey);
      
      if (!entryKey) {
        console.error('Failed to decrypt entry key for rewrapping');
        return null;
      }
      
      // Generate a new nonce for the recipient
      const newKeyNonce = nacl.randomBytes(nacl.box.nonceLength);
      
      // Re-encrypt the entry key for the recipient
      const newEncryptedEntryKey = nacl.box(entryKey, newKeyNonce, recipientPublicKey, authorKeyPair.secretKey);
      
      // Clear the entry key from memory
      secureClear(entryKey);
      
      return {
        encryptedEntryKeyB64: encodeBase64(newEncryptedEntryKey),
        keyNonceB64: encodeBase64(newKeyNonce)
      };
    } catch (error) {
      console.error('Entry key rewrapping failed:', error);
      return null;
    }
  }

  /**
   * Generate a hash of the entry content for indexing/search
   * This allows the server to detect duplicates without seeing the content
   */
  static generateContentHash(entryObject: EntryObject): string {
    const entryJson = JSON.stringify(entryObject);
    const entryBytes = new TextEncoder().encode(entryJson);
    const hash = nacl.hash(entryBytes);
    return encodeBase64(hash);
  }

  /**
   * Generate a hash of just the title for indexing
   */
  static generateTitleHash(title: string): string {
    const titleBytes = new TextEncoder().encode(title);
    const hash = nacl.hash(titleBytes);
    return encodeBase64(hash);
  }

  /**
   * Generate a preview hash from the first N characters of content
   * This can help with search while maintaining privacy
   */
  static generatePreviewHash(content: string, previewLength: number = 100): string {
    const preview = content.slice(0, previewLength);
    const previewBytes = new TextEncoder().encode(preview);
    const hash = nacl.hash(previewBytes);
    return encodeBase64(hash);
  }

  /**
   * Validate that encrypted entry data has all required fields
   */
  static validateEncryptedEntryData(data: any): data is EncryptedEntryData {
    return (
      typeof data === 'object' &&
      typeof data.encryptedContentB64 === 'string' &&
      typeof data.contentNonceB64 === 'string' &&
      typeof data.encryptedEntryKeyB64 === 'string' &&
      typeof data.keyNonceB64 === 'string'
    );
  }

  /**
   * Create encryption metadata for database storage
   */
  static createEncryptionMetadata(): Record<string, any> {
    return {
      algorithm: 'nacl.box + nacl.secretbox',
      version: '1.0',
      keyDerivation: 'nacl.hash',
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Encrypt individual fields for database storage
   * This is used when we need to encrypt title, content, and frontmatter separately
   */
  static encryptField(fieldValue: string, entryKey: Uint8Array): { encrypted: string; nonce: string } | null {
    if (!fieldValue || typeof fieldValue !== 'string') {
      throw new Error('Invalid field value provided');
    }
    
    if (!entryKey || entryKey.length !== nacl.secretbox.keyLength) {
      throw new Error('Invalid entry key provided');
    }

    try {
      const fieldBytes = new TextEncoder().encode(fieldValue);
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const encrypted = nacl.secretbox(fieldBytes, nonce, entryKey);
      
      return {
        encrypted: encodeBase64(encrypted),
        nonce: encodeBase64(nonce)
      };
    } catch (error) {
      console.error('Field encryption failed:', error);
      return null;
    }
  }

  /**
   * Decrypt individual fields from database storage
   */
  static decryptField(encryptedField: string, nonce: string, entryKey: Uint8Array): string | null {
    if (!encryptedField || !nonce) {
      console.error('Missing encrypted field or nonce');
      return null;
    }
    
    if (!entryKey || entryKey.length !== nacl.secretbox.keyLength) {
      console.error('Invalid entry key provided');
      return null;
    }

    try {
      const encryptedBytes = decodeBase64(encryptedField);
      const nonceBytes = decodeBase64(nonce);
      
      // Validate nonce length
      if (nonceBytes.length !== nacl.secretbox.nonceLength) {
        console.error('Invalid nonce length');
        return null;
      }
      
      const decryptedBytes = nacl.secretbox.open(encryptedBytes, nonceBytes, entryKey);
      
      if (!decryptedBytes) {
        console.error('Failed to decrypt field');
        return null;
      }
      
      return new TextDecoder().decode(decryptedBytes);
    } catch (error) {
      console.error('Field decryption failed:', error);
      return null;
    }
  }
}