/**
 * Supabase configuration and client setup
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';

// Environment variables - you'll need to set these
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase environment variables not configured. Auth features will be disabled.');
}

export interface Database {
  public: {
    Tables: {
      entries: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content: string;
          encrypted: boolean;
          preview: string;
          tags: string[];
          frontmatter: Record<string, any> | null;
          created_at: string;
          updated_at: string;
          file_path: string | null;
          shared_with: string[];
          is_public: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          content: string;
          encrypted?: boolean;
          preview?: string;
          tags?: string[];
          frontmatter?: Record<string, any> | null;
          created_at?: string;
          updated_at?: string;
          file_path?: string | null;
          shared_with?: string[];
          is_public?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          content?: string;
          encrypted?: boolean;
          preview?: string;
          tags?: string[];
          frontmatter?: Record<string, any> | null;
          created_at?: string;
          updated_at?: string;
          file_path?: string | null;
          shared_with?: string[];
          is_public?: boolean;
        };
      };
      user_profiles: {
        Row: {
          id: string;
          email: string | null;
          name: string | null;
          avatar_url: string | null;
          provider: string | null;
          sync_enabled: boolean;
          last_sync_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          name?: string | null;
          avatar_url?: string | null;
          provider?: string | null;
          sync_enabled?: boolean;
          last_sync_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          name?: string | null;
          avatar_url?: string | null;
          provider?: string | null;
          sync_enabled?: boolean;
          last_sync_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}

let supabaseClient: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (!browser || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  
  if (!supabaseClient) {
    supabaseClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  
  return supabaseClient;
}

export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}