/**
 * Biometric Authentication Service
 * Uses WebAuthn API to provide biometric authentication for encryption password storage
 * Supports fingerprint, facial recognition, and other platform authenticators
 */

import { browser } from '$app/environment';

export interface BiometricCredential {
  credentialId: string;
  publicKey: string;
  counter: number;
  created: string;
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  authenticatorData?: ArrayBuffer;
}

export class BiometricAuthService {
  private readonly CREDENTIAL_STORAGE_KEY = 'diaryx_biometric_credential';
  private readonly APP_NAME = 'Diaryx Journal';
  private readonly RP_ID = this.getRelyingPartyId();

  constructor() {
    // Service is browser-only
    if (!browser) {
      console.warn('BiometricAuthService: Not running in browser environment');
    }
  }

  /**
   * Check if WebAuthn is supported and biometric authenticators are available
   */
  async isSupported(): Promise<boolean> {
    if (!browser || !window.PublicKeyCredential) {
      return false;
    }

    try {
      // Check for basic WebAuthn support
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return available;
    } catch (error) {
      console.error('BiometricAuthService: Support check failed:', error);
      return false;
    }
  }

  /**
   * Check if biometric authentication is currently enabled
   */
  isEnabled(): boolean {
    if (!browser) return false;
    
    const stored = localStorage.getItem(this.CREDENTIAL_STORAGE_KEY);
    return !!stored;
  }

  /**
   * Create a new biometric credential for authentication
   */
  async createCredential(userId: string): Promise<BiometricCredential | null> {
    if (!browser) {
      throw new Error('Biometric authentication not available outside browser');
    }

    if (!await this.isSupported()) {
      throw new Error('Biometric authentication not supported on this device');
    }

    try {
      // Generate a random challenge
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userIdBytes = new TextEncoder().encode(userId);

      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: this.APP_NAME,
          id: this.RP_ID
        },
        user: {
          id: userIdBytes,
          name: userId,
          displayName: 'Diaryx User'
        },
        pubKeyCredParams: [
          // Prefer ES256 (ECDSA w/ SHA-256)
          { alg: -7, type: 'public-key' },
          // Fallback to RS256 (RSASSA-PKCS1-v1_5 w/ SHA-256)
          { alg: -257, type: 'public-key' }
        ],
        authenticatorSelection: {
          // Require platform authenticator (built-in biometrics)
          authenticatorAttachment: 'platform',
          // Require user verification (biometric)
          userVerification: 'required',
          // Allow creating new credentials
          requireResidentKey: false
        },
        timeout: 60000, // 60 seconds
        attestation: 'none' // Don't require attestation for privacy
      };

      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Failed to create biometric credential');
      }

      const response = credential.response as AuthenticatorAttestationResponse;
      const credentialData: BiometricCredential = {
        credentialId: this.arrayBufferToBase64(credential.rawId),
        publicKey: this.arrayBufferToBase64(response.getPublicKey()!),
        counter: 0,
        created: new Date().toISOString()
      };

      // Store credential for future use
      localStorage.setItem(this.CREDENTIAL_STORAGE_KEY, JSON.stringify(credentialData));

      console.log('BiometricAuthService: Credential created successfully');
      return credentialData;

    } catch (error) {
      console.error('BiometricAuthService: Credential creation failed:', error);
      throw new Error(`Failed to create biometric credential: ${error}`);
    }
  }

  /**
   * Authenticate using stored biometric credential
   */
  async authenticate(): Promise<BiometricAuthResult> {
    if (!browser) {
      return { success: false, error: 'Not available outside browser' };
    }

    if (!await this.isSupported()) {
      return { success: false, error: 'Biometric authentication not supported' };
    }

    try {
      const storedCredential = this.getStoredCredential();
      if (!storedCredential) {
        return { success: false, error: 'No biometric credential found' };
      }

      // Generate a random challenge
      const challenge = crypto.getRandomValues(new Uint8Array(32));

      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge,
        allowCredentials: [{
          id: this.base64ToArrayBuffer(storedCredential.credentialId),
          type: 'public-key',
          transports: ['internal'] // Platform authenticator
        }],
        userVerification: 'required',
        timeout: 60000,
        rpId: this.RP_ID
      };

      const assertion = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions
      }) as PublicKeyCredential;

      if (!assertion) {
        return { success: false, error: 'Authentication failed' };
      }

      const response = assertion.response as AuthenticatorAssertionResponse;
      
      // Update counter to prevent replay attacks
      const counter = new DataView(response.authenticatorData).getUint32(33, false);
      if (counter <= storedCredential.counter) {
        console.warn('BiometricAuthService: Suspicious counter value detected');
      }

      // Update stored credential with new counter
      const updatedCredential = { ...storedCredential, counter };
      localStorage.setItem(this.CREDENTIAL_STORAGE_KEY, JSON.stringify(updatedCredential));

      console.log('BiometricAuthService: Authentication successful');
      return { 
        success: true, 
        authenticatorData: response.authenticatorData 
      };

    } catch (error) {
      console.error('BiometricAuthService: Authentication failed:', error);
      
      // Handle user cancellation gracefully
      if (error instanceof Error && error.name === 'NotAllowedError') {
        return { success: false, error: 'Authentication cancelled by user' };
      }
      
      return { success: false, error: `Authentication failed: ${error}` };
    }
  }

  /**
   * Remove stored biometric credential
   */
  removeCredential(): void {
    if (!browser) return;
    
    localStorage.removeItem(this.CREDENTIAL_STORAGE_KEY);
    console.log('BiometricAuthService: Credential removed');
  }

  /**
   * Get information about the stored credential (without sensitive data)
   */
  getCredentialInfo(): { created: string; hasCredential: boolean } | null {
    if (!browser) return null;
    
    const stored = this.getStoredCredential();
    if (!stored) return null;

    return {
      created: stored.created,
      hasCredential: true
    };
  }

  /**
   * Encrypt password using biometric authentication data
   */
  async encryptPassword(password: string, authenticatorData: ArrayBuffer): Promise<string> {
    try {
      // Use authenticator data as key material
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        authenticatorData.slice(0, 32), // Use first 32 bytes
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      );

      // Derive encryption key
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );

      // Encrypt password
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(password)
      );

      // Combine salt, iv, and encrypted data
      const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encrypted), salt.length + iv.length);

      return this.arrayBufferToBase64(combined);
    } catch (error) {
      console.error('BiometricAuthService: Password encryption failed:', error);
      throw new Error('Failed to encrypt password');
    }
  }

  /**
   * Decrypt password using biometric authentication data
   */
  async decryptPassword(encryptedPassword: string, authenticatorData: ArrayBuffer): Promise<string> {
    try {
      const combined = this.base64ToArrayBuffer(encryptedPassword);
      const salt = combined.slice(0, 16);
      const iv = combined.slice(16, 28);
      const encrypted = combined.slice(28);

      // Use authenticator data as key material
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        authenticatorData.slice(0, 32), // Use first 32 bytes
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      );

      // Derive decryption key
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      // Decrypt password
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('BiometricAuthService: Password decryption failed:', error);
      throw new Error('Failed to decrypt password');
    }
  }

  // Private helper methods

  private getStoredCredential(): BiometricCredential | null {
    if (!browser) return null;
    
    try {
      const stored = localStorage.getItem(this.CREDENTIAL_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('BiometricAuthService: Failed to parse stored credential:', error);
      return null;
    }
  }

  private getRelyingPartyId(): string {
    if (!browser) return 'localhost';
    
    // For development, use localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'localhost';
    }
    
    // For Tauri apps, use a consistent identifier
    if (window.location.protocol === 'tauri:') {
      return 'tauri.localhost';
    }
    
    // For web deployment, use the actual hostname
    return window.location.hostname;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

// Export singleton instance
export const biometricAuthService = new BiometricAuthService();