/**
 * Portable authentication service with Supabase implementation
 */

import { writable, type Writable } from 'svelte/store';
import type { 
  AuthService, 
  AuthSession, 
  User, 
  AuthStateChangeCallback,
  AuthError 
} from './auth.types.js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase.config.js';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

class SupabaseAuthService implements AuthService {
  private currentSession: AuthSession | null = null;
  private sessionStore: Writable<AuthSession | null> = writable(null);
  private callbacks: Set<AuthStateChangeCallback> = new Set();

  constructor() {
    this.initializeAuth();
  }

  private async initializeAuth() {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Get initial session
    const { data: { session }, error } = await supabase.auth.getSession();
    if (session && !error) {
      this.handleSessionChange(session);
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      this.handleSessionChange(session);
    });
  }

  private handleSessionChange(session: Session | null) {
    const authSession = session ? this.mapToAuthSession(session) : null;
    this.currentSession = authSession;
    this.sessionStore.set(authSession);
    
    // Notify all callbacks
    this.callbacks.forEach(callback => callback(authSession));
  }

  private mapToAuthSession(session: Session): AuthSession {
    const user = session.user;
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.user_metadata?.full_name,
        avatar: user.user_metadata?.avatar_url,
        provider: user.app_metadata?.provider as any,
        createdAt: new Date(user.created_at),
        lastSignIn: new Date(user.last_sign_in_at || user.created_at),
      },
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: new Date(session.expires_at! * 1000),
    };
  }

  private handleAuthError(error: any): never {
    const authError: AuthError = {
      code: error.code || 'unknown_error',
      message: error.message || 'An authentication error occurred',
      details: error,
    };
    throw authError;
  }

  async signInWithGoogle(): Promise<AuthSession> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      this.handleAuthError(error);
    }

    // For OAuth, the session will be set via the auth state change listener
    // Return a promise that resolves when the session is available
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 30000); // 30 second timeout

      const unsubscribe = this.onAuthStateChange((session) => {
        if (session) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(session);
        }
      });
    });
  }

  async signInWithGitHub(): Promise<AuthSession> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      this.handleAuthError(error);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 30000);

      const unsubscribe = this.onAuthStateChange((session) => {
        if (session) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(session);
        }
      });
    });
  }

  async signInWithEmail(email: string, password: string): Promise<AuthSession> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      this.handleAuthError(error);
    }

    if (!data.session) {
      throw new Error('No session returned from sign in');
    }

    return this.mapToAuthSession(data.session);
  }

  async signUpWithEmail(email: string, password: string): Promise<AuthSession> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      this.handleAuthError(error);
    }

    if (!data.session) {
      throw new Error('No session returned from sign up');
    }

    return this.mapToAuthSession(data.session);
  }

  async signOut(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      this.handleAuthError(error);
    }
  }

  getCurrentSession(): AuthSession | null {
    return this.currentSession;
  }

  getCurrentUser(): User | null {
    return this.currentSession?.user || null;
  }

  async refreshSession(): Promise<AuthSession> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      this.handleAuthError(error);
    }

    if (!data.session) {
      throw new Error('No session returned from refresh');
    }

    return this.mapToAuthSession(data.session);
  }

  onAuthStateChange(callback: AuthStateChangeCallback): () => void {
    this.callbacks.add(callback);
    
    // Call immediately with current state
    callback(this.currentSession);
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  isAuthenticated(): boolean {
    return !!this.currentSession;
  }

  getAuthHeaders(): Record<string, string> {
    if (!this.currentSession?.accessToken) {
      return {};
    }
    
    return {
      'Authorization': `Bearer ${this.currentSession.accessToken}`,
    };
  }

  // Svelte store for reactive UI updates
  get store() {
    return this.sessionStore;
  }
}

// Mock auth service for when Supabase is not configured
class MockAuthService implements AuthService {
  async signInWithGoogle(): Promise<AuthSession> {
    throw new Error('Authentication not configured');
  }

  async signInWithGitHub(): Promise<AuthSession> {
    throw new Error('Authentication not configured');
  }

  async signInWithEmail(email: string, password: string): Promise<AuthSession> {
    throw new Error('Authentication not configured');
  }

  async signUpWithEmail(email: string, password: string): Promise<AuthSession> {
    throw new Error('Authentication not configured');
  }

  async signOut(): Promise<void> {
    throw new Error('Authentication not configured');
  }

  getCurrentSession(): AuthSession | null {
    return null;
  }

  getCurrentUser(): User | null {
    return null;
  }

  async refreshSession(): Promise<AuthSession> {
    throw new Error('Authentication not configured');
  }

  onAuthStateChange(callback: AuthStateChangeCallback): () => void {
    callback(null);
    return () => {};
  }

  isAuthenticated(): boolean {
    return false;
  }

  getAuthHeaders(): Record<string, string> {
    return {};
  }
}

// Export singleton instance
export const authService: AuthService = isSupabaseConfigured() 
  ? new SupabaseAuthService()
  : new MockAuthService();

// Export store for reactive UI updates
export const authStore = (authService as SupabaseAuthService).store || writable(null);