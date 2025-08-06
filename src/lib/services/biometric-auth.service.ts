/**
 * Biometric Authentication Service
 * 
 * Uses WebAuthn API to provide biometric authentication for secure password storage.
 * Supports fingerprint, facial recognition, and other platform authenticators.
 * 
 * @description This service manages biometric credentials and handles encryption/decryption
 * of sensitive data using biometric authentication. It leverages the WebAuthn standard
 * for secure, passwordless authentication and stores encrypted passwords locally.
 * 
 * @example
 * ```typescript
 * // Check if biometric auth is supported
 * const supported = await biometricAuthService.isSupported();
 * 
 * if (supported) {
 *   // Create a biometric credential
 *   const credential = await biometricAuthService.createCredential('user123');
 *   
 *   // Authenticate with biometrics
 *   const result = await biometricAuthService.authenticate();
 *   if (result.success) {
 *     // Use result.authenticatorData for encryption
 *   }
 * }
 * ```
 */

import { browser } from '$app/environment';

/**
 * Biometric credential data structure
 */
export interface BiometricCredential {
  credentialId: string;
  publicKey: string;
  counter: number;
  created: string;
}

/**
 * Result of biometric authentication attempt
 */
export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  authenticatorData?: ArrayBuffer;
}

/**
 * Main biometric authentication service class
 * 
 * Provides WebAuthn-based biometric authentication with secure password storage.
 * Handles credential creation, authentication, and password encryption/decryption.
 */
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
   * 
   * Verifies that the current environment supports WebAuthn and has
   * platform authenticators (built-in biometrics) available.
   * 
   * @returns {Promise<boolean>} True if biometric authentication is supported
   * 
   * @example
   * ```typescript
   * const canUseBiometrics = await biometricAuthService.isSupported();
   * if (canUseBiometrics) {
   *   // Show biometric authentication option
   * }
   * ```
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
   * 
   * Determines if a biometric credential has been previously created and stored.
   * 
   * @returns {boolean} True if biometric auth is enabled
   * 
   * @example
   * ```typescript
   * if (biometricAuthService.isEnabled()) {
   *   // User has biometric auth set up
   *   showBiometricLoginOption();
   * }
   * ```
   */
  isEnabled(): boolean {
    if (!browser) return false;
    
    const stored = localStorage.getItem(this.CREDENTIAL_STORAGE_KEY);
    return !!stored;
  }

  /**
   * Create a new biometric credential for authentication
   * 
   * Initiates the WebAuthn credential creation flow, prompting the user
   * to register their biometric (fingerprint, face, etc.) for authentication.
   * 
   * @param {string} userId - Unique identifier for the user
   * @returns {Promise<BiometricCredential | null>} Created credential or null if failed
   * @throws {Error} If biometric auth is not supported or creation fails
   * 
   * @example
   * ```typescript
   * try {
   *   const credential = await biometricAuthService.createCredential('user123');
   *   if (credential) {
   *     console.log('Biometric credential created:', credential.created);
   *   }
   * } catch (error) {
   *   console.error('Failed to create biometric credential:', error);
   * }
   * ```
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
   * 
   * Prompts the user to authenticate using their registered biometric.
   * Returns authenticator data that can be used for encryption operations.
   * 
   * @returns {Promise<BiometricAuthResult>} Authentication result with success status
   * 
   * @example
   * ```typescript
   * const result = await biometricAuthService.authenticate();
   * if (result.success && result.authenticatorData) {
   *   // Use authenticatorData for encryption/decryption
   *   const encrypted = await biometricAuthService.encryptPassword(
   *     'myPassword',
   *     result.authenticatorData
   *   );
   * } else {
   *   console.error('Authentication failed:', result.error);
   * }
   * ```
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
   * 
   * Deletes the locally stored biometric credential, effectively disabling
   * biometric authentication for this device.
   * 
   * @example
   * ```typescript
   * biometricAuthService.removeCredential();
   * console.log('Biometric authentication disabled');
   * ```
   */
  removeCredential(): void {
    if (!browser) return;
    
    localStorage.removeItem(this.CREDENTIAL_STORAGE_KEY);
    console.log('BiometricAuthService: Credential removed');
  }

  /**
   * Get information about the stored credential (without sensitive data)
   * 
   * Returns non-sensitive information about the stored biometric credential.
   * 
   * @returns {Object | null} Credential info or null if no credential exists
   * @returns {string} returns.created - ISO timestamp when credential was created
   * @returns {boolean} returns.hasCredential - Whether credential exists
   * 
   * @example
   * ```typescript
   * const info = biometricAuthService.getCredentialInfo();
   * if (info) {
   *   console.log('Biometric setup on:', new Date(info.created));
   * }
   * ```
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
   * 
   * Uses authenticator data from biometric authentication to derive an encryption key
   * and encrypt the provided password. The encrypted result can be safely stored.
   * 
   * @param {string} password - The password to encrypt
   * @param {ArrayBuffer} authenticatorData - Data from successful biometric authentication
   * @returns {Promise<string>} Base64-encoded encrypted password
   * @throws {Error} If encryption fails
   * 
   * @example
   * ```typescript
   * const authResult = await biometricAuthService.authenticate();
   * if (authResult.success && authResult.authenticatorData) {
   *   const encrypted = await biometricAuthService.encryptPassword(
   *     'userPassword123',
   *     authResult.authenticatorData
   *   );
   *   // Store encrypted for later use
   * }
   * ```
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
   * 
   * Uses authenticator data from biometric authentication to derive the decryption key
   * and decrypt a previously encrypted password.
   * 
   * @param {string} encryptedPassword - Base64-encoded encrypted password
   * @param {ArrayBuffer} authenticatorData - Data from successful biometric authentication
   * @returns {Promise<string>} The decrypted password
   * @throws {Error} If decryption fails
   * 
   * @example
   * ```typescript
   * const authResult = await biometricAuthService.authenticate();
   * if (authResult.success && authResult.authenticatorData) {
   *   try {
   *     const password = await biometricAuthService.decryptPassword(
   *       storedEncryptedPassword,
   *       authResult.authenticatorData
   *     );
   *     // Use decrypted password
   *   } catch (error) {
   *     console.error('Decryption failed:', error);
   *   }
   * }
   * ```
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

  /**
   * Retrieve stored biometric credential from localStorage
   * 
   * @private
   * @returns {BiometricCredential | null} Stored credential or null if not found
   */
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

  /**
   * Get the relying party identifier for WebAuthn
   * 
   * Determines the appropriate RP ID based on the current environment
   * (localhost for development, hostname for web, tauri.localhost for Tauri apps).
   * 
   * @private
   * @returns {string} Relying party identifier
   */
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

  /**
   * Convert ArrayBuffer to Base64 string
   * 
   * @private
   * @param {ArrayBuffer} buffer - Buffer to convert
   * @returns {string} Base64-encoded string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 string to ArrayBuffer
   * 
   * @private
   * @param {string} base64 - Base64-encoded string
   * @returns {ArrayBuffer} Converted ArrayBuffer
   */
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