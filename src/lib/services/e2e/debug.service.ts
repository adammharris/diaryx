/**
 * E2E Debug Service
 * 
 * Debugging and analysis utilities for E2E encryption.
 * Provides tools for testing encryption/decryption and diagnosing issues.
 */

import nacl from 'tweetnacl';
import { decodeBase64 } from 'tweetnacl-util';
import { KeyManager } from '../../crypto/KeyManager.js';
import { EntryCryptor, type EncryptedEntryData } from '../../crypto/EntryCryptor.js';
import { sessionManager } from './session-manager.service.js';

/**
 * E2E Debug Service
 * 
 * Provides debugging utilities for encryption operations.
 */
export class E2EDebugService {

  /**
   * Test encryption/decryption round-trip
   * 
   * @returns {boolean} True if test passed
   */
  testEncryptionRoundTrip(): boolean {
    const session = sessionManager.getCurrentSession();
    if (!session || !session.isUnlocked) {
      console.error('Cannot test encryption - session not unlocked');
      return false;
    }

    try {
      const testEntry = {
        title: 'Encryption Test Entry',
        content: 'This is a test entry to validate encryption/decryption works correctly.'
      };

      console.log('=== Encryption Round-Trip Test ===');
      console.log('Original entry:', testEntry);

      // Encrypt
      const encrypted = EntryCryptor.encryptEntry(testEntry, session.userKeyPair);
      console.log('Encryption successful, data lengths:', {
        encryptedContent: encrypted.encryptedContentB64.length,
        contentNonce: encrypted.contentNonceB64.length,
        encryptedEntryKey: encrypted.encryptedEntryKeyB64.length,
        keyNonce: encrypted.keyNonceB64.length
      });

      // Decrypt
      const decrypted = EntryCryptor.decryptEntry(
        encrypted,
        session.userKeyPair.secretKey,
        session.userKeyPair.publicKey
      );

      console.log('Decryption result:', decrypted);
      
      if (decrypted && decrypted.title === testEntry.title && decrypted.content === testEntry.content) {
        console.log('✅ Encryption round-trip test PASSED');
        return true;
      } else {
        console.error('❌ Encryption round-trip test FAILED - content mismatch');
        return false;
      }
    } catch (error) {
      console.error('❌ Encryption round-trip test FAILED with error:', error);
      return false;
    }
  }

  /**
   * Compare encrypted data between sent and received
   * 
   * @param {EncryptedEntryData} sentData - Data that was sent
   * @param {EncryptedEntryData} receivedData - Data that was received
   */
  debugCompareEncryptedData(sentData: EncryptedEntryData, receivedData: EncryptedEntryData): void {
    console.log('=== Encrypted Data Comparison ===');
    console.log('Sent encryptedContentB64:', sentData.encryptedContentB64);
    console.log('Received encryptedContentB64:', receivedData.encryptedContentB64);
    console.log('Content matches:', sentData.encryptedContentB64 === receivedData.encryptedContentB64);
    
    console.log('Sent contentNonceB64:', sentData.contentNonceB64);
    console.log('Received contentNonceB64:', receivedData.contentNonceB64);
    console.log('Nonce matches:', sentData.contentNonceB64 === receivedData.contentNonceB64);
    
    console.log('Sent encryptedEntryKeyB64:', sentData.encryptedEntryKeyB64);
    console.log('Received encryptedEntryKeyB64:', receivedData.encryptedEntryKeyB64);
    console.log('Entry key matches:', sentData.encryptedEntryKeyB64 === receivedData.encryptedEntryKeyB64);
    
    console.log('Sent keyNonceB64:', sentData.keyNonceB64);
    console.log('Received keyNonceB64:', receivedData.keyNonceB64);
    console.log('Key nonce matches:', sentData.keyNonceB64 === receivedData.keyNonceB64);
  }

  /**
   * Analyze why a specific encrypted entry fails to decrypt
   * 
   * @param {EncryptedEntryData} encryptedData - The failing encrypted data
   * @param {string} authorPublicKeyB64 - Author's public key
   */
  analyzeFailedDecryption(encryptedData: EncryptedEntryData, authorPublicKeyB64: string): void {
    const session = sessionManager.getCurrentSession();
    if (!session || !session.isUnlocked) {
      console.error('Cannot analyze - session not unlocked');
      return;
    }

    console.log('=== Failed Decryption Analysis ===');
    
    try {
      // Test if we can decrypt the entry key successfully
      const authorPublicKey = KeyManager.publicKeyFromB64(authorPublicKeyB64);
      const encryptedEntryKey = decodeBase64(encryptedData.encryptedEntryKeyB64);
      const keyNonce = decodeBase64(encryptedData.keyNonceB64);
      
      console.log('Testing entry key decryption...');
      const entryKey = nacl.box.open(encryptedEntryKey, keyNonce, authorPublicKey, session.userKeyPair.secretKey);
      
      if (!entryKey) {
        console.error('❌ Entry key decryption failed - this suggests key mismatch');
        return;
      }
      
      console.log('✅ Entry key decrypted successfully');
      
      // Now test if we can create valid test data with the same key
      console.log('Testing symmetric encryption with recovered entry key...');
      const testData = 'Test data with recovered key';
      const testBytes = new TextEncoder().encode(testData);
      const testNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const testEncrypted = nacl.secretbox(testBytes, testNonce, entryKey);
      const testDecrypted = nacl.secretbox.open(testEncrypted, testNonce, entryKey);
      
      if (testDecrypted) {
        console.log('✅ Symmetric encryption/decryption with recovered key works');
        console.log('❌ This confirms the original encrypted content is corrupted');
      } else {
        console.error('❌ Even fresh symmetric encryption fails with recovered key');
      }
      
      // Compare the failing data format
      const encryptedContent = decodeBase64(encryptedData.encryptedContentB64);
      const contentNonce = decodeBase64(encryptedData.contentNonceB64);
      
      console.log('Failing data analysis:', {
        encryptedContentLength: encryptedContent.length,
        contentNonceLength: contentNonce.length,
        entryKeyLength: entryKey.length,
        isValidContentNonce: contentNonce.length === nacl.secretbox.nonceLength,
        isValidEntryKey: entryKey.length === nacl.secretbox.keyLength,
        hasMinimumContentLength: encryptedContent.length >= nacl.secretbox.overheadLength
      });
      
      // Clear the entry key
      KeyManager.clearKey(entryKey);
      
    } catch (error) {
      console.error('Analysis failed:', error);
    }
  }

  /**
   * Test encryption/decryption with specific data that's failing
   * 
   * @param {EncryptedEntryData} encryptedData - The failing encrypted data
   * @param {string} authorPublicKeyB64 - Author's public key
   */
  testSpecificEncryptionData(encryptedData: EncryptedEntryData, authorPublicKeyB64: string): void {
    const session = sessionManager.getCurrentSession();
    if (!session || !session.isUnlocked) {
      console.error('Cannot test - session not unlocked');
      return;
    }

    console.log('=== Testing Specific Failed Data ===');
    
    try {
      // First, let's see if we can decrypt the entry key successfully
      const authorPublicKey = KeyManager.publicKeyFromB64(authorPublicKeyB64);
      const encryptedEntryKey = decodeBase64(encryptedData.encryptedEntryKeyB64);
      const keyNonce = decodeBase64(encryptedData.keyNonceB64);
      
      console.log('Attempting to decrypt entry key...');
      const entryKey = nacl.box.open(encryptedEntryKey, keyNonce, authorPublicKey, session.userKeyPair.secretKey);
      
      if (!entryKey) {
        console.error('❌ Entry key decryption failed');
        return;
      }
      
      console.log('✅ Entry key decrypted successfully');
      
      // Now let's try to decrypt the content
      const encryptedContent = decodeBase64(encryptedData.encryptedContentB64);
      const contentNonce = decodeBase64(encryptedData.contentNonceB64);
      
      console.log('Attempting to decrypt content...');
      const decryptedContentBytes = nacl.secretbox.open(encryptedContent, contentNonce, entryKey);
      
      if (!decryptedContentBytes) {
        console.error('❌ Content decryption failed');
        
        // Let's try encrypting some test data with the recovered key to see if it works
        console.log('Testing recovered key with fresh data...');
        const testData = 'test data with recovered key';
        const testBytes = new TextEncoder().encode(testData);
        const testNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
        const testEncrypted = nacl.secretbox(testBytes, testNonce, entryKey);
        const testDecrypted = nacl.secretbox.open(testEncrypted, testNonce, entryKey);
        
        if (testDecrypted) {
          console.log('✅ Recovered key works for new data - original content is corrupted');
          console.log('Decrypted test:', new TextDecoder().decode(testDecrypted));
        } else {
          console.error('❌ Recovered key doesn\'t work even for new data');
        }
        
        // Let's also try using the original content nonce with fresh data
        console.log('Testing original content nonce with fresh data...');
        const testWithOriginalNonce = nacl.secretbox(testBytes, contentNonce, entryKey);
        const testDecryptedWithOriginalNonce = nacl.secretbox.open(testWithOriginalNonce, contentNonce, entryKey);
        
        if (testDecryptedWithOriginalNonce) {
          console.log('✅ Original nonce works - content data is definitely corrupted');
        } else {
          console.error('❌ Original nonce doesn\'t work with fresh data');
        }
        
      } else {
        console.log('✅ Content decrypted successfully');
        const entryJson = new TextDecoder().decode(decryptedContentBytes);
        console.log('Decrypted content:', entryJson);
      }
      
      // Clear the entry key
      KeyManager.clearKey(entryKey);
      
    } catch (error) {
      console.error('Test failed with error:', error);
    }
  }

  /**
   * Validate session and encryption system
   * 
   * @returns {Object} Validation results
   */
  validateEncryptionSystem(): {
    hasSession: boolean;
    isUnlocked: boolean;
    keyPairValid: boolean;
    roundTripTest: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    let hasSession = false;
    let isUnlocked = false;
    let keyPairValid = false;
    let roundTripTest = false;

    try {
      // Check session
      const session = sessionManager.getCurrentSession();
      hasSession = !!session;
      
      if (!hasSession) {
        errors.push('No active session');
        return { hasSession, isUnlocked, keyPairValid, roundTripTest, errors };
      }

      // Check if unlocked
      isUnlocked = session!.isUnlocked;
      
      if (!isUnlocked) {
        errors.push('Session is locked');
        return { hasSession, isUnlocked, keyPairValid, roundTripTest, errors };
      }

      // Validate key pair
      keyPairValid = KeyManager.validateKeyPair(session!.userKeyPair);
      
      if (!keyPairValid) {
        errors.push('Invalid key pair');
      }

      // Test encryption round trip
      roundTripTest = this.testEncryptionRoundTrip();
      
      if (!roundTripTest) {
        errors.push('Encryption round-trip test failed');
      }

    } catch (error) {
      errors.push(`Validation error: ${error}`);
    }

    return { hasSession, isUnlocked, keyPairValid, roundTripTest, errors };
  }

  /**
   * Get encryption system status
   * 
   * @returns {Object} System status information
   */
  getSystemStatus(): {
    session: any;
    storage: any;
    crypto: any;
  } {
    const session = sessionManager.getCurrentSession();
    
    return {
      session: {
        exists: !!session,
        isUnlocked: session?.isUnlocked || false,
        userId: session?.userId || null,
        hasKeyPair: !!(session?.userKeyPair?.publicKey && session?.userKeyPair?.secretKey),
        publicKeyLength: session?.userKeyPair?.publicKey?.length || 0,
        secretKeyLength: session?.userKeyPair?.secretKey?.length || 0
      },
      storage: {
        hasStoredKeys: sessionManager.getSessionStatus().hasStoredKeys,
        storageKey: 'diaryx_user_keys'
      },
      crypto: {
        naclVersion: 'tweetnacl',
        boxPublicKeyBytes: nacl.box.publicKeyLength,
        boxSecretKeyBytes: nacl.box.secretKeyLength,
        boxNonceBytes: nacl.box.nonceLength,
        secretboxKeyBytes: nacl.secretbox.keyLength,
        secretboxNonceBytes: nacl.secretbox.nonceLength
      }
    };
  }
}

// Export singleton instance
export const e2eDebug = new E2EDebugService();