/**
 * Authentication service interfaces for portable auth implementation
 */

export interface User {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
  provider?: 'google' | 'github' | 'email';
  createdAt: Date;
  lastSignIn: Date;
}

export interface AuthSession {
  user: User;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface AuthError {
  code: string;
  message: string;
  details?: any;
}

export type AuthStateChangeCallback = (session: AuthSession | null) => void;

export interface AuthService {
  // Core auth methods
  signInWithGoogle(): Promise<AuthSession>;
  signInWithGitHub(): Promise<AuthSession>;
  signInWithEmail(email: string, password: string): Promise<AuthSession>;
  signUpWithEmail(email: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  
  // Session management
  getCurrentSession(): AuthSession | null;
  getCurrentUser(): User | null;
  refreshSession(): Promise<AuthSession>;
  
  // State monitoring
  onAuthStateChange(callback: AuthStateChangeCallback): () => void;
  
  // Utility methods
  isAuthenticated(): boolean;
  getAuthHeaders(): Record<string, string>;
}

export interface CloudSyncConfig {
  userId: string;
  syncEnabled: boolean;
  lastSyncAt?: Date;
  conflictResolution: 'local' | 'remote' | 'merge';
}

export interface EntryOwnership {
  entryId: string;
  ownerId: string;
  sharedWith: string[];
  permissions: {
    [userId: string]: 'read' | 'write';
  };
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}