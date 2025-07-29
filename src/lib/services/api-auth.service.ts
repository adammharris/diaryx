/**
 * API-based authentication service for Google OAuth + custom backend
 * Works with your Vercel API endpoints
 * Supports both web browser and Tauri environment
 */

import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import { detectTauri } from '../utils/tauri.js';
import { VITE_API_BASE_URL, VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_REDIRECT_URI } from '../config/env-validation.js';

// Import Tauri plugins - these modules may not exist in web environment
import { openUrl } from '@tauri-apps/plugin-opener';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';

interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  provider?: string;
  public_key?: string;
}

interface AuthSession {
  user: User;
  accessToken: string;
  isAuthenticated: boolean;
}

interface GoogleAuthResponse {
  access_token: string;
  id_token: string;
  scope: string;
  token_type: string;
  expires_in: number;
}

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

  private clearSession(): void {
    this.currentSession = null;
    this.sessionStore.set(null);
    
    if (browser) {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  /**
   * Sign in with Google OAuth
   */
  async signInWithGoogle(): Promise<AuthSession> {
    if (!browser) throw new Error('OAuth only works in browser');

    console.log('Starting Google OAuth flow...');
    console.log('Client ID configured:', !!import.meta.env.VITE_GOOGLE_CLIENT_ID);

    return new Promise(async (resolve, reject) => {
      try {
        const authUrl = this.buildGoogleAuthUrl();
        console.log('Opening OAuth URL:', authUrl);
        
        // Check if we're in Tauri environment with deep linking support
        if (detectTauri() && typeof onOpenUrl === 'function' && typeof openUrl === 'function') {
          // Tauri environment - use deep linking
          const unlistenDeepLink = await onOpenUrl((urls: string[]) => {
            console.log('Deep link received:', urls);
            const url = urls[0];
            if (url && url.startsWith('diaryx://auth/callback')) {
              console.log('Processing OAuth callback from deep link:', url);
              this.handleDeepLinkCallback(url)
                .then(resolve)
                .catch(reject)
                .finally(() => {
                  if (unlistenDeepLink) unlistenDeepLink();
                });
            }
          });

          // Store the unlisten function for cleanup
          (window as any).__oauth_unlisten = unlistenDeepLink;
          
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

  private buildGoogleAuthUrl(): string {
    const clientId = VITE_GOOGLE_CLIENT_ID;

    // Always use the configured redirect URI from environment variables
    // This ensures consistency between web and Tauri environments
    const redirectUri = VITE_GOOGLE_REDIRECT_URI;
    console.log('Redirect URI:', redirectUri);
    const scope = 'openid email profile';
    const responseType = 'code';
    const state = this.generateRandomState();

    // Store state for validation
    sessionStorage.setItem('oauth_state', state);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      response_type: responseType,
      state,
      access_type: 'offline',
      prompt: 'select_account'
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  private generateRandomState(): string {
    const randomPart = Math.random().toString(36).substring(2, 15) + 
                      Math.random().toString(36).substring(2, 15);
    
    // Add platform indicator to state for callback detection
    const platform = detectTauri() ? 'tauri' : 'web';
    return `${platform}_${randomPart}`;
  }

  /**
   * Handle deep link callback from OAuth
   */
  async handleDeepLinkCallback(deepLinkUrl: string): Promise<AuthSession> {
    try {
      console.log('🔗 Processing deep link callback:', deepLinkUrl);
      console.log('🔗 Deep link received successfully in Tauri app');
      
      // Parse the deep link URL to extract the authorization code and state
      const url = new URL(deepLinkUrl);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Validate state against what we stored when starting OAuth
      const storedState = sessionStorage.getItem('oauth_state');
      if (state !== storedState) {
        console.warn('State validation failed:', { received: state, stored: storedState });
        // For development, we'll be more lenient with state validation
        // In production, you might want to be stricter
      }

      // Exchange the authorization code for tokens via your backend
      // Use the web callback URL since that's where the OAuth flow completed
      const response = await fetch(`${this.API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          redirectUri: VITE_GOOGLE_REDIRECT_URI
        }),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`);
      }

      const authResult = await response.json();
      
      // Create and save the session
      const session = await this.handleGoogleAuthResult(authResult);
      this.saveSession(session);
      
      // Clean up
      sessionStorage.removeItem('oauth_state');
      
      return session;
    } catch (error) {
      console.error('Deep link callback processing failed:', error);
      throw error;
    }
  }

  /**
   * Process OAuth result from popup callback
   */
  private async processOAuthResult(result: any): Promise<AuthSession> {
    try {
      console.log('Processing OAuth result:', result);
      
      // Create and save the session
      const session = await this.handleGoogleAuthResult(result);
      this.saveSession(session);
      
      // Clean up
      sessionStorage.removeItem('oauth_state');
      
      return session;
    } catch (error) {
      console.error('OAuth result processing failed:', error);
      throw error;
    }
  }

  private async waitForAuthResult(popup: Window): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        popup.close();
        reject(new Error('Authentication timeout'));
      }, 60000); // 1 minute timeout

      // Listen for message from popup
      const messageHandler = (event: MessageEvent) => {
        console.log('Received message:', event.data, 'from origin:', event.origin);
        
        // Accept messages from the same origin
        if (event.origin !== window.location.origin) {
          console.log('Ignoring message from different origin');
          return;
        }

        if (event.data.type === 'oauth_success') {
          clearTimeout(timeout);
          popup.close();
          window.removeEventListener('message', messageHandler);
          resolve(event.data.result);
        } else if (event.data.type === 'oauth_error') {
          clearTimeout(timeout);
          popup.close();
          window.removeEventListener('message', messageHandler);
          reject(new Error(event.data.error));
        }
      };

      window.addEventListener('message', messageHandler);

      // Also poll the popup URL to detect when the callback happens
      const pollInterval = setInterval(() => {
        try {
          if (popup.closed) {
            clearTimeout(timeout);
            clearInterval(pollInterval);
            window.removeEventListener('message', messageHandler);
            reject(new Error('Authentication cancelled'));
            return;
          }

          // Check if popup has navigated to our callback URL
          if (popup.location.href.includes('/auth/callback')) {
            console.log('Detected callback URL, waiting for message...');
          }
        } catch (e) {
          // Cross-origin error is expected when popup is on Google's domain
          // This is normal and we'll wait for the postMessage instead
        }
      }, 1000);
    });
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
   */
  async signOut(): Promise<void> {
    this.clearSession();
  }

  /**
   * Get current session
   */
  getCurrentSession(): AuthSession | null {
    return this.currentSession;
  }

  /**
   * Set session (used by OAuth callback)
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
   * Reload session from localStorage (useful after external authentication)
   */
  reloadFromStorage(): void {
    console.log('Reloading session from localStorage...');
    this.initializeFromStorage();
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    return this.currentSession?.user || null;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return !!this.currentSession?.isAuthenticated;
  }

  /**
   * Get auth headers for API requests
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
   */
  get store() {
    return this.sessionStore;
  }
}

// For development/testing - simple email auth
class MockAuthService {
  private sessionStore: Writable<AuthSession | null> = writable(null);

  async signInWithGoogle(): Promise<AuthSession> {
    const mockUser: User = {
      id: 'mock-user-123',
      email: 'demo@example.com',
      name: 'Demo User',
      provider: 'google',
      public_key: 'mock-public-key'
    };

    const session: AuthSession = {
      user: mockUser,
      accessToken: 'mock-token',
      isAuthenticated: true
    };

    this.sessionStore.set(session);
    return session;
  }

  async signOut(): Promise<void> {
    this.sessionStore.set(null);
  }

  getCurrentSession(): AuthSession | null {
    return null;
  }

  getCurrentUser(): User | null {
    return null;
  }

  isAuthenticated(): boolean {
    return false;
  }

  getAuthHeaders(): Record<string, string> {
    return {};
  }

  get store() {
    return this.sessionStore;
  }
}

// For testing without backend - uncomment this to use mock:
//export const apiAuthService = new MockAuthService();
//export const apiAuthStore = apiAuthService.store;

// Always use the real auth service (comment out to use mock)
export const apiAuthService = new ApiAuthService();
export const apiAuthStore = apiAuthService.store;