/**
 * API-based authentication service for Google OAuth + custom backend
 * Works with your Vercel API endpoints
 */

import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

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
  private readonly API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

  constructor() {
    if (browser) {
      this.initializeFromStorage();
    }
  }

  private initializeFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const session: AuthSession = JSON.parse(stored);
        this.currentSession = session;
        this.sessionStore.set(session);
      }
    } catch (error) {
      console.error('Failed to initialize auth from storage:', error);
      this.clearSession();
    }
  }

  private saveSession(session: AuthSession): void {
    this.currentSession = session;
    this.sessionStore.set(session);
    
    if (browser) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(session));
      
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

    try {
      // Start Google OAuth flow
      const authUrl = this.buildGoogleAuthUrl();
      console.log('OAuth URL:', authUrl);
      
      // Open popup window for OAuth
      const popup = window.open(
        authUrl,
        'google-auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for authentication.');
      }

      // Wait for OAuth response
      const authResult = await this.waitForAuthResult(popup);
      
      // Exchange code for tokens and user info
      const session = await this.handleGoogleAuthResult(authResult);
      
      this.saveSession(session);
      return session;

    } catch (error) {
      console.error('Google sign in failed:', error);
      throw error;
    }
  }

  private buildGoogleAuthUrl(): string {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error('Google Client ID not configured. Please add VITE_GOOGLE_CLIENT_ID to your .env file.');
    }

    const redirectUri = `${window.location.origin}/auth/callback`;
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
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
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

// Always use the real auth service (comment out to use mock)
export const apiAuthService = new ApiAuthService();
export const apiAuthStore = apiAuthService.store;

// For testing only - uncomment this to use mock:
// export const apiAuthService = new MockAuthService();
// export const apiAuthStore = apiAuthService.store;