/**
 * E2E Biometric Authentication Service
 * 
 * Handles biometric authentication for E2E encryption.
 * Integrates with the biometric-auth service to provide secure password storage.
 */

import { browser } from '$app/environment';
import { biometricAuthService, type BiometricAuthResult } from '../biometric-auth.service.js';
import { e2eAuth } from './auth.service.js';
import { e2eStorage } from './storage.service.js';
import { sessionManager } from './session-manager.service.js';

/**
 * E2E Biometric Service
 * 
 * Manages biometric authentication for E2E encryption.
 */
export class E2EBiometricService {

  /**
   * Check if biometric authentication is available and enabled
   * 
   * Determines if the device supports biometric authentication and if the user
   * has stored keys that could be used with biometrics.
   * 
   * @returns {Promise<boolean>} True if biometric auth is available
   */
  async isBiometricAvailable(): Promise<boolean> {
    if (!browser) return false;
    
    const isSupported = await biometricAuthService.isSupported();
    const hasStoredKeys = e2eStorage.hasStoredKeys();
    
    return isSupported && hasStoredKeys;
  }

  /**
   * Check if biometric authentication is enabled for the current user
   * 
   * Determines if the current user has previously enabled biometric authentication
   * and has the necessary encrypted data stored.
   * 
   * @returns {boolean} True if biometric auth is enabled for current user
   */
  isBiometricEnabled(): boolean {
    return e2eStorage.isBiometricEnabled();
  }

  /**
   * Enable biometric authentication for the current user
   * 
   * Sets up biometric authentication by encrypting the user's password
   * with biometric-derived keys. Requires a valid password for verification.
   * 
   * @param {string} password - User's current password for verification
   * @returns {Promise<boolean>} True if biometric auth was successfully enabled
   */
  async enableBiometric(password: string): Promise<boolean> {
    if (!browser) {
      console.error('Biometric authentication not available outside browser');
      return false;
    }

    if (!await this.isBiometricAvailable()) {
      console.error('Biometric authentication not available on this device');
      return false;
    }

    try {
      const storedKeys = e2eStorage.getStoredKeys();
      if (!storedKeys) {
        console.error('No stored keys found');
        return false;
      }
      
      // Verify the password works first
      if (!e2eAuth.login(password)) {
        console.error('Invalid password provided');
        return false;
      }

      // Create biometric credential
      const credential = await biometricAuthService.createCredential(storedKeys.userId);
      if (!credential) {
        console.error('Failed to create biometric credential');
        return false;
      }

      // Authenticate immediately to get authenticator data for encryption
      const authResult = await biometricAuthService.authenticate();
      if (!authResult.success || !authResult.authenticatorData) {
        console.error('Biometric authentication failed after creation');
        biometricAuthService.removeCredential();
        return false;
      }

      // Encrypt the password with biometric data
      const encryptedPassword = await biometricAuthService.encryptPassword(
        password, 
        authResult.authenticatorData
      );

      // Update stored keys with biometric data
      const success = e2eStorage.enableBiometric(encryptedPassword);
      
      if (!success) {
        console.error('Failed to store biometric data');
        biometricAuthService.removeCredential();
        return false;
      }
      
      console.log('Biometric authentication enabled successfully');
      return true;

    } catch (error) {
      console.error('Failed to enable biometric authentication:', error);
      // Clean up any partial setup
      biometricAuthService.removeCredential();
      return false;
    }
  }

  /**
   * Disable biometric authentication
   * 
   * Removes biometric authentication capability and cleans up stored biometric data.
   * The user will need to use password authentication after this.
   * 
   * @returns {boolean} True if biometric auth was successfully disabled
   */
  disableBiometric(): boolean {
    if (!browser) return false;

    try {
      // Remove biometric data from stored keys
      const success = e2eStorage.disableBiometric();
      
      if (success) {
        // Remove biometric credential
        biometricAuthService.removeCredential();
        console.log('Biometric authentication disabled');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to disable biometric authentication:', error);
      return false;
    }
  }

  /**
   * Attempt to login using biometric authentication
   * 
   * Authenticates the user using biometric data and unlocks the encryption session.
   * Requires biometric authentication to be previously enabled.
   * 
   * @returns {Promise<boolean>} True if biometric login successful
   */
  async loginWithBiometric(): Promise<boolean> {
    if (!browser) {
      console.error('Biometric authentication not available outside browser');
      return false;
    }

    if (!this.isBiometricEnabled()) {
      console.error('Biometric authentication not enabled');
      return false;
    }

    try {
      const storedKeys = e2eStorage.getStoredKeys();
      if (!storedKeys || !storedKeys.encryptedPasswordB64) {
        console.error('No encrypted password found');
        return false;
      }

      // Authenticate with biometrics
      const authResult: BiometricAuthResult = await biometricAuthService.authenticate();
      if (!authResult.success || !authResult.authenticatorData) {
        console.error('Biometric authentication failed:', authResult.error);
        return false;
      }

      // Decrypt password using biometric data
      const password = await biometricAuthService.decryptPassword(
        storedKeys.encryptedPasswordB64,
        authResult.authenticatorData
      );

      // Use decrypted password for normal login
      const loginSuccess = e2eAuth.login(password);
      
      // Clear password from memory immediately
      password.replace(/./g, '0'); // Overwrite string content
      
      if (loginSuccess) {
        console.log('Biometric login successful');
        return true;
      } else {
        console.error('Login failed with decrypted password');
        return false;
      }

    } catch (error) {
      console.error('Biometric login failed:', error);
      return false;
    }
  }

  /**
   * Get biometric credential information
   * 
   * Returns information about the current biometric setup including
   * whether it's enabled and credential details.
   * 
   * @returns {Object} Object containing enabled status and credential info
   */
  getBiometricInfo(): { enabled: boolean; credentialInfo: any } {
    return {
      enabled: this.isBiometricEnabled(),
      credentialInfo: biometricAuthService.getCredentialInfo()
    };
  }

  /**
   * Get biometric capabilities and status
   * 
   * @returns {Promise<Object>} Biometric system status
   */
  async getBiometricStatus(): Promise<{
    isSupported: boolean;
    isAvailable: boolean;
    isEnabled: boolean;
    hasStoredKeys: boolean;
  }> {
    const isSupported = browser ? await biometricAuthService.isSupported() : false;
    const hasStoredKeys = e2eStorage.hasStoredKeys();
    const isEnabled = this.isBiometricEnabled();
    
    return {
      isSupported,
      isAvailable: isSupported && hasStoredKeys,
      isEnabled,
      hasStoredKeys
    };
  }

  /**
   * Test biometric authentication without affecting stored data
   * 
   * @returns {Promise<boolean>} True if biometric test successful
   */
  async testBiometricAuth(): Promise<boolean> {
    if (!browser) return false;
    
    try {
      const authResult = await biometricAuthService.authenticate();
      return authResult.success;
    } catch (error) {
      console.error('Biometric test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const e2eBiometric = new E2EBiometricService();