/**
 * EntryCryptor Module - Handles encryption and decryption of individual journal entries
 * Part of the client-side E2E encryption system
 */

import nacl from 'tweetnacl';
import { decodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';
import type { UserKeyPair } from './KeyManager.js';

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
    // Generate a new random symmetric key for this entry
    const entryKey = nacl.randomBytes(nacl.secretbox.keyLength);
    
    // Serialize the entry object to JSON and convert to bytes
    const entryJson = JSON.stringify(entryObject);
    const entryBytes = new TextEncoder().encode(entryJson);
    
    // Generate nonce for content encryption
    const contentNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    
    // Encrypt the entry content with the symmetric key
    const encryptedContent = nacl.secretbox(entryBytes, contentNonce, entryKey);
    
    // Generate nonce for key encryption
    const keyNonce = nacl.randomBytes(nacl.box.nonceLength);
    
    // Encrypt the entry key for the owner using their public key
    const encryptedEntryKey = nacl.box(entryKey, keyNonce, ownerKeyPair.publicKey, ownerKeyPair.secretKey);
    
    // Clear the entry key from memory
    entryKey.fill(0);
    
    return {
      encryptedContentB64: encodeBase64(encryptedContent),
      contentNonceB64: encodeBase64(contentNonce),
      encryptedEntryKeyB64: encodeBase64(encryptedEntryKey),
      keyNonceB64: encodeBase64(keyNonce)
    };
  }

  /**
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
    try {
      // Decode the Base64 data
      const encryptedContent = decodeBase64(encryptedData.encryptedContentB64);
      const contentNonce = decodeBase64(encryptedData.contentNonceB64);
      const encryptedEntryKey = decodeBase64(encryptedData.encryptedEntryKeyB64);
      const keyNonce = decodeBase64(encryptedData.keyNonceB64);
      
      // Decrypt the entry key using box (asymmetric decryption)
      const entryKey = nacl.box.open(encryptedEntryKey, keyNonce, authorPublicKey, userSecretKey);
      
      if (!entryKey) {
        console.error('Failed to decrypt entry key');
        return null;
      }
      
      // Use the decrypted entry key to decrypt the content (symmetric decryption)
      const decryptedContentBytes = nacl.secretbox.open(encryptedContent, contentNonce, entryKey);
      
      console.log('Decryption debug:', {
        entryKeyLength: entryKey?.length,
        encryptedContentLength: encryptedContent?.length,
        contentNonceLength: contentNonce?.length,
        decryptedContentBytes: decryptedContentBytes ? `Uint8Array(${decryptedContentBytes.length})` : 'null',
        decryptedContentBytesType: typeof decryptedContentBytes
      });
      
      if (!decryptedContentBytes) {
        console.error('Failed to decrypt entry content - nacl.secretbox.open returned null');
        // Clear the entry key from memory
        entryKey.fill(0);
        return null;
      }
      
      // Convert decrypted bytes to string and parse JSON
      console.log('Attempting to decode UTF8 from:', decryptedContentBytes);
      const entryJson = decodeUTF8(decryptedContentBytes);
      console.log('Decoded JSON string:', entryJson);
      const entryObject = JSON.parse(entryJson) as EntryObject;
      
      // Clear sensitive data from memory
      entryKey.fill(0);
      
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
    try {
      // Decode the encrypted entry key and nonce
      const encryptedKeyBytes = decodeBase64(encryptedEntryKey);
      const nonceBytes = decodeBase64(keyNonce);
      
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
      entryKey.fill(0);
      
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
  static encryptField(fieldValue: string, entryKey: Uint8Array): { encrypted: string; nonce: string } {
    const fieldBytes = new TextEncoder().encode(fieldValue);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const encrypted = nacl.secretbox(fieldBytes, nonce, entryKey);
    
    return {
      encrypted: encodeBase64(encrypted),
      nonce: encodeBase64(nonce)
    };
  }

  /**
   * Decrypt individual fields from database storage
   */
  static decryptField(encryptedField: string, nonce: string, entryKey: Uint8Array): string | null {
    try {
      const encryptedBytes = decodeBase64(encryptedField);
      const nonceBytes = decodeBase64(nonce);
      const decryptedBytes = nacl.secretbox.open(encryptedBytes, nonceBytes, entryKey);
      
      if (!decryptedBytes) {
        return null;
      }
      
      return decodeUTF8(decryptedBytes);
    } catch (error) {
      console.error('Field decryption failed:', error);
      return null;
    }
  }
}