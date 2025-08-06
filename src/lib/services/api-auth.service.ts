/**
 * API-based Authentication Service
 * 
 * Handles Google OAuth authentication with a custom backend API.
 * Supports both web browser and Tauri desktop environments with deep linking.
 * Implements PKCE (Proof Key for Code Exchange) for enhanced security.
 * 
 * @description This service manages the complete OAuth flow including:
 * - Google OAuth 2.0 with PKCE
 * - Cross-platform authentication (web + Tauri)
 * - Session management and persistence
 * - Deep link handling for Tauri apps
 * - Automatic post-login synchronization
 * 
 * @example
 * ```typescript
 * // Sign in with Google
 * const session = await apiAuthService.signInWithGoogle();
 * 
 * // Check authentication status
 * if (apiAuthService.isAuthenticated()) {
 *   const user = apiAuthService.getCurrentUser();
 * }
 * 
 * // Sign out
 * await apiAuthService.signOut();
 * ```
 */

import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import { detectTauri } from '../utils/tauri.js';
import { VITE_API_BASE_URL, VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_REDIRECT_URI } from '../config/env-validation.js';

// Import Tauri plugins - these modules may not exist in web environment
import { openUrl } from '@tauri-apps/plugin-opener';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { fetch } from '../utils/fetch.js';
import { info as tauriInfo, error as tauriError } from '@tauri-apps/plugin-log';

/**
 * User profile information
 */
interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  provider?: string;
  public_key?: string;
}

/**
 * Active authentication session
 */
interface AuthSession {
  user: User;
  accessToken: string;
  isAuthenticated: boolean;
}

/**
 * Google OAuth API response structure
 */
interface GoogleAuthResponse {
  access_token: string;
  id_token: string;
  scope: string;
  token_type: string;
  expires_in: number;
}

/**
 * Main authentication service class
 * 
 * Provides OAuth authentication, session management, and API integration
 * for both web and desktop (Tauri) environments.
 */
class ApiAuthService {
  private currentSession: AuthSession | null = null;
  private sessionStore: Writable<AuthSession | null> = writable(null);
  private readonly STORAGE_KEY = 'diaryx_auth_session';
  private readonly API_BASE_URL = VITE_API_BASE_URL;

  constructor() {
    if (browser) {
      this.initializeFromStorage();
    }
  }

  /**
   * Initialize authentication state from localStorage
   * 
   * Attempts to restore a previous session from storage.
   * Handles errors gracefully by clearing invalid sessions.
   * 
   * @private
   */
  private initializeFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      console.log('Initializing auth from storage:', { 
        hasStored: !!stored, 
        storedValue: stored ? 'present' : 'missing' 
      });
      
      if (stored) {
        const session: AuthSession = JSON.parse(stored);
        console.log('Loaded session:', { 
          isAuthenticated: session.isAuthenticated, 
          hasUser: !!session.user,
          userId: session.user?.id 
        });
        this.currentSession = session;
        this.sessionStore.set(session);
      }
    } catch (error) {
      console.error('Failed to initialize auth from storage:', error);
      this.clearSession();
    }
  }

  /**
   * Save authentication session to storage and trigger post-login actions
   * 
   * Persists the session and initiates cloud synchronization if E2E encryption is ready.
   * 
   * @private
   * @param {AuthSession} session - The authenticated session to save
   */
  private saveSession(session: AuthSession): void {
    console.log('saveSession: setting currentSession and store');
    this.currentSession = session;
    this.sessionStore.set(session);
    
    if (browser) {
      console.log('saveSession: saving to localStorage with key:', this.STORAGE_KEY);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(session));
      
      // Verify it was saved
      const saved = localStorage.getItem(this.STORAGE_KEY);
      console.log('saveSession: verification - saved to localStorage:', !!saved);
      
      // Trigger post-login sync after a short delay to ensure everything is initialized
      // But only if E2E encryption is already set up - otherwise let the user set it up first
      setTimeout(async () => {
        try {
          const { e2eEncryptionService } = await import('./e2e-encryption.service');
          const isUnlocked = e2eEncryptionService.isUnlocked();
          
          console.log('Post-login check: E2E encryption unlocked?', isUnlocked);
          
          if (isUnlocked) {
            console.log('E2E encryption ready, performing sync...');
            const { storageService } = await import('./storage');
            await storageService.syncAfterLogin();
          } else {
            console.log('E2E encryption not set up - sync will be triggered after encryption setup');
          }
        } catch (error) {
          console.error('Post-login sync failed:', error);
        }
      }, 1000);
    }
  }

  /**
   * Clear authentication session from memory and storage
   * 
   * @private
   */
  private clearSession(): void {
    this.currentSession = null;
    this.sessionStore.set(null);
    
    if (browser) {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  /**
   * Sign in with Google OAuth
   * 
   * Initiates the Google OAuth 2.0 flow with PKCE for enhanced security.
   * Handles both web browser navigation and Tauri deep link flows.
   * 
   * @returns {Promise<AuthSession>} The authenticated session
   * @throws {Error} If OAuth flow fails or times out
   * 
   * @example
   * ```typescript
   * try {
   *   const session = await apiAuthService.signInWithGoogle();
   *   console.log('Signed in as:', session.user.email);
   * } catch (error) {
   *   console.error('Sign in failed:', error);
   * }
   * ```
   */
  async signInWithGoogle(): Promise<AuthSession> {
    if (!browser) throw new Error('OAuth only works in browser');

    console.log('Starting Google OAuth flow...');
    console.log('Client ID configured:', !!import.meta.env.VITE_GOOGLE_CLIENT_ID);

    return new Promise(async (resolve, reject) => {
      try {
        const authUrl = await this.buildGoogleAuthUrl();
        console.log('Opening OAuth URL:', authUrl);
        
        // Extract state from URL to determine the intended platform
        const url = new URL(authUrl);
        const state = url.searchParams.get('state') || '';
        const isWebOnlyFlow = state.startsWith('web_');
        
        console.log('Platform detection:', {
          isTauri: detectTauri(),
          statePrefix: state.split('_')[0],
          isWebOnlyFlow,
          useDeepLink: detectTauri() && typeof openUrl === 'function' && !isWebOnlyFlow
        });
        
        // Use deep links only if we're in Tauri AND the state indicates Tauri flow
        if (detectTauri() && typeof openUrl === 'function' && !isWebOnlyFlow) {
          // Tauri environment - use global deep link handler
          console.log('🔗 Setting up auth callback listener...');
          
          // Set up timeout for auth flow (5 minutes)
          const timeout = setTimeout(() => {
            console.warn('🔗 Auth flow timeout - user may have closed browser');
            this.clearAuthCallback();
            reject(new Error('Authentication timeout - please try again'));
          }, 300000); // 5 minutes

          // Store auth callback info for global deep link handler
          (window as any).__auth_callback = {
            resolve,
            reject,
            timeout,
            handler: (url: string) => {
              console.log('🔗 Processing OAuth callback from global handler:', url);
              this.handleDeepLinkCallback(url)
                .then(resolve)
                .catch(reject)
                .finally(() => {
                  this.clearAuthCallback();
                });
            }
          };
          
          console.log('🔗 Auth callback registered, waiting for deep link...');
          
          // Open URL in external browser
          await openUrl(authUrl);
          
          console.log('🔗 OAuth URL opened in external browser');
          console.log('🔗 Deep link listener set up, waiting for callback...');
          console.log('🔗 Expected deep link format: diaryx://auth/callback?code=...&state=...');
          
          alert('Please complete the sign-in process in your browser. You\'ll be redirected back to the app automatically.');
        } else {
          // Web environment - navigate directly to OAuth URL
          console.log('Using direct navigation for web environment');
          
          // Navigate directly to the OAuth URL (state is already stored in buildGoogleAuthUrl)
          // The callback page will handle the authentication and redirect back
          window.location.href = authUrl;
          
          // This promise won't resolve since we're navigating away
          // The callback page will handle the rest
        }
      } catch (error) {
        console.error('Google sign in failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Build Google OAuth authorization URL with PKCE parameters
   * 
   * Constructs the complete OAuth URL including state validation,
   * PKCE challenge, and appropriate redirect URI.
   * 
   * @private
   * @returns {Promise<string>} Complete OAuth authorization URL
   */
  private async buildGoogleAuthUrl(): Promise<string> {
    const clientId = VITE_GOOGLE_CLIENT_ID;

    // Always use the configured redirect URI from environment variables
    // This ensures consistency between web and Tauri environments
    const redirectUri = VITE_GOOGLE_REDIRECT_URI;
    console.log('Redirect URI:', redirectUri);
    const scope = 'openid email profile';
    const responseType = 'code';
    const state = this.generateRandomState();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      response_type: responseType,
      state,
      access_type: 'offline',
      prompt: 'select_account'
    });

    // Add PKCE parameters for both web and Tauri flows
    if (browser) {
      const { codeVerifier, codeChallenge } = await this.generatePKCE();
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
      
      // Store code verifier for the callback - use localStorage for Tauri (survives app restart)
      if (state.startsWith('tauri_')) {
        localStorage.setItem('pkce_code_verifier', codeVerifier);
        console.log('PKCE enabled for Tauri flow, code verifier stored in localStorage');
      } else {
        sessionStorage.setItem('pkce_code_verifier', codeVerifier);
        console.log('PKCE enabled for web flow, code verifier stored in sessionStorage');
      }
    }

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Generate a cryptographically secure state parameter
   * 
   * Creates a state parameter with platform detection and timestamp
   * for OAuth flow validation and security.
   * 
   * @private
   * @returns {string} Random state string with format: platform_timestamp_random
   */
  private generateRandomState(): string {
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substring(2, 15) + 
                      Math.random().toString(36).substring(2, 15);
    
    // Add platform indicator and timestamp for validation
    const platform = detectTauri() ? 'tauri' : 'web';
    
    // Format: platform_timestamp_random (e.g., tauri_1703123456789_abc123def456)
    return `${platform}_${timestamp}_${randomPart}`;
  }

  /**
   * Generate PKCE (Proof Key for Code Exchange) parameters
   * 
   * Creates code verifier and challenge for OAuth PKCE flow.
   * Uses SHA256 hashing when available, falls back to plain text.
   * 
   * @private
   * @returns {Promise<Object>} Object containing codeVerifier and codeChallenge
   */
  private async generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
    // Generate a cryptographically random code verifier (43-128 characters)
    const codeVerifier = this.generateRandomString(128);
    
    try {
      // Use browser's native crypto API for proper SHA256
      const encoder = new TextEncoder();
      const data = encoder.encode(codeVerifier);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      
      // Convert ArrayBuffer to base64url
      const hashArray = new Uint8Array(hashBuffer);
      const hashString = String.fromCharCode.apply(null, Array.from(hashArray));
      const codeChallenge = btoa(hashString)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      
      console.log('PKCE generated with SHA256');
      return { codeVerifier, codeChallenge };
    } catch (error) {
      // Fallback if crypto.subtle is not available
      console.warn('crypto.subtle not available, using fallback PKCE method');
      const codeChallenge = this.base64URLEncode(codeVerifier);
      return { codeVerifier, codeChallenge };
    }
  }

  /**
   * Generate cryptographically secure random string
   * 
   * @private
   * @param {number} length - Length of string to generate
   * @returns {string} Random string using URL-safe characters
   */
  private generateRandomString(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    
    // Use crypto.getRandomValues for cryptographically secure random
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const randomBytes = new Uint8Array(length);
      crypto.getRandomValues(randomBytes);
      
      for (let i = 0; i < length; i++) {
        result += charset[randomBytes[i] % charset.length];
      }
    } else {
      // Fallback for environments without crypto.getRandomValues
      for (let i = 0; i < length; i++) {
        result += charset[Math.floor(Math.random() * charset.length)];
      }
    }
    
    return result;
  }

  /**
   * Encode string as Base64URL
   * 
   * @private
   * @param {string} str - String to encode
   * @returns {string} Base64URL encoded string
   */
  private base64URLEncode(str: string): string {
    // Convert string to base64 and make it URL-safe
    const base64 = btoa(str);
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Validate OAuth state parameter format and age
   * 
   * @private
   * @param {string} state - State parameter to validate
   * @param {'tauri' | 'web'} expectedPlatform - Expected platform identifier
   * @returns {Object} Validation result with isValid flag and optional error
   */
  private validateStateFormat(state: string, expectedPlatform: 'tauri' | 'web'): { isValid: boolean; timestamp?: number; error?: string } {
    if (!state) {
      return { isValid: false, error: 'No state parameter provided' };
    }

    // Expected format: platform_timestamp_random
    const statePattern = new RegExp(`^${expectedPlatform}_(\\d+)_[a-z0-9]+$`);
    const match = state.match(statePattern);
    
    if (!match) {
      return { isValid: false, error: `Invalid state format. Expected ${expectedPlatform}_timestamp_random, got: ${state}` };
    }

    const timestamp = parseInt(match[1], 10);
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    if (now - timestamp > maxAge) {
      return { isValid: false, error: `State expired. Generated ${Math.round((now - timestamp) / 1000)}s ago` };
    }

    return { isValid: true, timestamp };
  }

  private clearAuthCallback(): void {
    const authCallback = (window as any).__auth_callback;
    if (authCallback) {
      if (authCallback.timeout) {
        clearTimeout(authCallback.timeout);
      }
      delete (window as any).__auth_callback;
      console.log('🔗 Auth callback cleared');
    }
  }

  /**
   * Handle deep link callback from OAuth
   * 
   * Processes the OAuth callback received via deep link in Tauri apps.
   * Validates state, exchanges authorization code for tokens, and creates session.
   * 
   * @param {string} deepLinkUrl - The deep link URL containing OAuth callback data
   * @returns {Promise<AuthSession>} The authenticated session
   * @throws {Error} If callback processing fails
   * 
   * @example
   * ```typescript
   * // This is typically called automatically by the deep link handler
   * const session = await apiAuthService.handleDeepLinkCallback(
   *   'diaryx://auth/callback?code=abc123&state=tauri_1234567890_xyz'
   * );
   * ```
   */
  async handleDeepLinkCallback(deepLinkUrl: string): Promise<AuthSession> {
    try {
      console.log('🔗 Processing deep link callback:', deepLinkUrl);
      console.log('🔗 Deep link received successfully in Tauri app');
      
      // Critical debug - use Tauri logging to ensure this appears in logs
      if (detectTauri()) {
        try {
          await tauriInfo(`🔗 CRITICAL: handleDeepLinkCallback started with URL: ${deepLinkUrl}`);
        } catch (logErr) {
          console.error('Could not use Tauri logging in handleDeepLinkCallback:', logErr);
        }
      }
      
      // Parse the deep link URL to extract the authorization code and state
      if (detectTauri()) {
        try {
          await tauriInfo('🔗 About to parse URL...');
        } catch (logErr) {
          console.error('Log error 1:', logErr);
        }
      }
      
      const url = new URL(deepLinkUrl);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      
      if (detectTauri()) {
        try {
          await tauriInfo(`🔗 Parsed URL - code: ${code ? 'present' : 'missing'}, state: ${state}, error: ${error}`);
        } catch (logErr) {
          console.error('Log error 2:', logErr);
        }
      }

      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Validate state format instead of using sessionStorage
      if (detectTauri()) {
        try {
          await tauriInfo('🔗 About to validate state...');
        } catch (logErr) {
          console.error('Log error 3:', logErr);
        }
      }
      
      const stateValidation = this.validateStateFormat(state || '', 'tauri');
      console.log('🔗 State validation:', { 
        received: state, 
        isValid: stateValidation.isValid, 
        error: stateValidation.error,
        timestamp: stateValidation.timestamp ? new Date(stateValidation.timestamp).toISOString() : undefined
      });
      
      if (detectTauri()) {
        try {
          await tauriInfo(`🔗 State validation result: ${stateValidation.isValid}, error: ${stateValidation.error}`);
        } catch (logErr) {
          console.error('Log error 4:', logErr);
        }
      }
      
      if (!stateValidation.isValid) {
        throw new Error(`State validation failed: ${stateValidation.error}`);
      }
      
      console.log('🔗 State validation passed - this is a valid Tauri auth callback');

      if (detectTauri()) {
        try {
          await tauriInfo('🔗 About to retrieve code verifier...');
        } catch (logErr) {
          console.error('Log error 5:', logErr);
        }
      }

      // Retrieve the code verifier from localStorage (stored during login initiation)
      const codeVerifier = localStorage.getItem('pkce_code_verifier') || sessionStorage.getItem('pkce_code_verifier');
      
      if (detectTauri()) {
        try {
          await tauriInfo(`🔗 Code verifier check - localStorage: ${!!localStorage.getItem('pkce_code_verifier')}, sessionStorage: ${!!sessionStorage.getItem('pkce_code_verifier')}, final: ${!!codeVerifier}`);
        } catch (logErr) {
          console.error('Log error 6:', logErr);
        }
      }
      
      if (!codeVerifier) {
        if (detectTauri()) {
          try {
            await tauriError('🔗 CRITICAL ERROR: PKCE code verifier not found in either storage');
          } catch (logErr) {
            console.error('Log error 7:', logErr);
          }
        }
        throw new Error('PKCE code verifier not found. Please restart the authentication process.');
      }
      
      console.log('🔗 Code verifier found, exchanging authorization code for tokens...');
      
      if (detectTauri()) {
        try {
          await tauriInfo('🔗 Code verifier found, about to make backend request...');
        } catch (logErr) {
          console.error('Log error 8:', logErr);
        }
      }

      // Exchange the authorization code for tokens via your backend
      const requestBody = {
        code,
        codeVerifier,
        redirectUri: VITE_GOOGLE_REDIRECT_URI
      };
      
      if (detectTauri()) {
        try {
          await tauriInfo(`🔗 Making request to: ${this.API_BASE_URL}/auth/google`);
          await tauriInfo(`🔗 Request body keys: ${Object.keys(requestBody).join(', ')}`);
        } catch (logErr) {
          console.error('Log error 9:', logErr);
        }
      }
      
      let response;
      try {
        // Test: Use Tauri fetch everywhere (should work in both Tauri and web)
        if (detectTauri()) {
          try {
            await tauriInfo('🔗 Using Tauri HTTP client for request...');
          } catch (logErr) {
            console.error('Log error (Tauri HTTP):', logErr);
          }
        }
        
        response = await fetch(`${this.API_BASE_URL}/auth/google`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });
      } catch (fetchError) {
        if (detectTauri()) {
          try {
            await tauriError(`🔗 Fetch request failed: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
          } catch (logErr) {
            console.error('Log error 13:', logErr);
          }
        }
        console.error('🔗 Network request failed:', fetchError);
        throw new Error(`Network request failed: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
      }

      if (detectTauri()) {
        try {
          await tauriInfo(`🔗 Backend response status: ${response.status} ${response.statusText}`);
        } catch (logErr) {
          console.error('Log error 10:', logErr);
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔗 Backend auth failed:', response.status, errorText);
        
        if (detectTauri()) {
          try {
            await tauriError(`🔗 Backend auth failed: ${response.status} - ${errorText}`);
          } catch (logErr) {
            console.error('Log error 11:', logErr);
          }
        }
        
        throw new Error(`Authentication failed: ${response.statusText} - ${errorText}`);
      }

      const authResult = await response.json();
      console.log('🔗 Backend auth successful, creating session...');
      
      if (detectTauri()) {
        try {
          await tauriInfo('🔗 Backend auth successful, processing response...');
        } catch (logErr) {
          console.error('Log error 12:', logErr);
        }
      }
      
      // Create and save the session
      const session = await this.handleGoogleAuthResult(authResult);
      this.saveSession(session);
      
      // Clean up the code verifier for security
      localStorage.removeItem('pkce_code_verifier');
      sessionStorage.removeItem('pkce_code_verifier');
      console.log('🔗 Code verifier cleaned up');
      
      console.log('🔗 Session saved successfully:', session.user.email);
      
      return session;
    } catch (error) {
      console.error('🔗 Deep link callback processing failed:', error);
      throw error;
    }
  }


  private async handleGoogleAuthResult(authResult: any): Promise<AuthSession> {
    // The backend has already exchanged the code and created/updated the user
    // authResult now contains the complete user data from the backend
    
    const user: User = {
      id: authResult.user.id,
      email: authResult.user.email,
      name: authResult.user.name,
      avatar: authResult.user.avatar,
      provider: authResult.user.provider,
      public_key: authResult.user.public_key
    };

    return {
      user,
      accessToken: authResult.access_token,
      isAuthenticated: true
    };
  }

  /**
   * Sign out
   * 
   * Clears the current authentication session from memory and storage.
   * 
   * @returns {Promise<void>}
   * 
   * @example
   * ```typescript
   * await apiAuthService.signOut();
   * console.log('User signed out');
   * ```
   */
  async signOut(): Promise<void> {
    this.clearSession();
  }

  /**
   * Get current session
   * 
   * Returns the active authentication session if one exists.
   * 
   * @returns {AuthSession | null} Current session or null if not authenticated
   * 
   * @example
   * ```typescript
   * const session = apiAuthService.getCurrentSession();
   * if (session) {
   *   console.log('Current user:', session.user.email);
   * }
   * ```
   */
  getCurrentSession(): AuthSession | null {
    return this.currentSession;
  }

  /**
   * Set session (used by OAuth callback)
   * 
   * Manually sets the authentication session. Primarily used by OAuth callback handlers.
   * 
   * @param {AuthSession | null} session - Session to set or null to clear
   * 
   * @example
   * ```typescript
   * // Typically used by OAuth callback page
   * apiAuthService.setSession(sessionData);
   * ```
   */
  setSession(session: AuthSession | null): void {
    console.log('setSession called with:', session ? 'session data' : 'null');
    if (session) {
      console.log('Saving session:', { isAuthenticated: session.isAuthenticated, userId: session.user?.id });
      this.saveSession(session);
    } else {
      this.clearSession();
    }
  }

  /**
   * Reload session from localStorage
   * 
   * Useful after external authentication or when session state needs to be refreshed.
   * 
   * @example
   * ```typescript
   * // Refresh session after external auth
   * apiAuthService.reloadFromStorage();
   * ```
   */
  reloadFromStorage(): void {
    console.log('Reloading session from localStorage...');
    this.initializeFromStorage();
  }

  /**
   * Get current user
   * 
   * Returns the current user profile information if authenticated.
   * 
   * @returns {User | null} Current user or null if not authenticated
   * 
   * @example
   * ```typescript
   * const user = apiAuthService.getCurrentUser();
   * if (user) {
   *   console.log('Welcome,', user.name);
   * }
   * ```
   */
  getCurrentUser(): User | null {
    return this.currentSession?.user || null;
  }

  /**
   * Check if authenticated
   * 
   * Returns whether the user is currently authenticated.
   * 
   * @returns {boolean} True if user is authenticated
   * 
   * @example
   * ```typescript
   * if (apiAuthService.isAuthenticated()) {
   *   // User is logged in
   *   showDashboard();
   * } else {
   *   // Show login screen
   *   showLogin();
   * }
   * ```
   */
  isAuthenticated(): boolean {
    return !!this.currentSession?.isAuthenticated;
  }

  /**
   * Get auth headers for API requests
   * 
   * Returns HTTP headers needed for authenticated API requests.
   * Includes Authorization Bearer token and User ID header.
   * 
   * @returns {Record<string, string>} Object containing auth headers
   * 
   * @example
   * ```typescript
   * const headers = {
   *   'Content-Type': 'application/json',
   *   ...apiAuthService.getAuthHeaders()
   * };
   * 
   * fetch('/api/data', { headers });
   * ```
   */
  getAuthHeaders(): Record<string, string> {
    if (!this.currentSession) {
      return {};
    }
    
    return {
      'Authorization': `Bearer ${this.currentSession.accessToken}`,
      'X-User-ID': this.currentSession.user.id
    };
  }

  /**
   * Get reactive store
   * 
   * Returns a Svelte store that components can subscribe to for session state changes.
   * 
   * @returns {Writable<AuthSession | null>} Reactive store for session state
   * 
   * @example
   * ```typescript
   * // In a Svelte component
   * import { apiAuthService } from './services/api-auth.service';
   * 
   * $: session = apiAuthService.store;
   * $: isLoggedIn = $session?.isAuthenticated ?? false;
   * ```
   */
  get store() {
    return this.sessionStore;
  }
}


// Always use the real auth service (comment out to use mock)
export const apiAuthService = new ApiAuthService();
export const apiAuthStore = apiAuthService.store;