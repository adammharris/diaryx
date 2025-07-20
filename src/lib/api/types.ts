/**
 * API Types for Backend Integration
 * Defines the contract between the client and the Neon/Vercel API
 */

// User-related types
export interface ApiUser {
  id: string;
  email: string;
  name?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  public_key: string; // Base64 encoded public key
  discoverable: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserRequest {
  email: string;
  name?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  public_key: string; // Base64 encoded public key
}

export interface UpdateUserRequest {
  name?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  discoverable?: boolean;
}

// Entry-related types
export interface ApiEntry {
  id: string;
  author_id: string;
  encrypted_title: string;
  encrypted_content: string;
  encrypted_frontmatter?: string;
  encryption_metadata: Record<string, any>;
  title_hash: string;
  content_preview_hash?: string;
  is_published: boolean;
  file_path?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEntryRequest {
  encrypted_title: string;
  encrypted_content: string;
  encrypted_frontmatter?: string;
  encryption_metadata: Record<string, any>;
  title_hash: string;
  content_preview_hash?: string;
  is_published?: boolean;
  file_path?: string;
  tag_ids?: string[]; // Tags to associate with the entry
}

export interface UpdateEntryRequest {
  encrypted_title?: string;
  encrypted_content?: string;
  encrypted_frontmatter?: string;
  encryption_metadata?: Record<string, any>;
  title_hash?: string;
  content_preview_hash?: string;
  is_published?: boolean;
  file_path?: string;
}

// Tag-related types
export interface ApiTag {
  id: string;
  name: string;
  slug: string;
  color?: string;
  author_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTagRequest {
  name: string;
  slug: string;
  color?: string;
}

export interface UpdateTagRequest {
  name?: string;
  slug?: string;
  color?: string;
}

// Entry access key types (for sharing)
export interface ApiEntryAccessKey {
  id: string;
  entry_id: string;
  user_id: string;
  encrypted_entry_key: string; // Base64 encoded
  created_at: string;
}

export interface CreateEntryAccessKeyRequest {
  entry_id: string;
  user_id: string;
  encrypted_entry_key: string; // Base64 encoded
}

// User tag types (RBAC permissions)
export interface ApiUserTag {
  id: string;
  tagger_id: string;
  target_id: string;
  tag_id: string;
  created_at: string;
}

export interface CreateUserTagRequest {
  target_id: string;
  tag_id: string;
}

// Entry tag junction types
export interface ApiEntryTag {
  id: string;
  entry_id: string;
  tag_id: string;
  created_at: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiListResponse<T> {
  success: boolean;
  data?: T[];
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
}

// Sharing flow types
export interface ShareEntryRequest {
  entry_id: string;
  recipient_user_id: string;
  encrypted_entry_key: string; // Re-wrapped for recipient
  key_nonce: string; // Base64 encoded nonce
}

export interface ShareEntryResponse {
  success: boolean;
  access_key_id?: string;
  message?: string;
  error?: string;
}

// Entry with access information
export interface ApiEntryWithAccess extends ApiEntry {
  access_key?: ApiEntryAccessKey;
  author?: Pick<ApiUser, 'id' | 'name' | 'username' | 'public_key'>;
  tags?: ApiTag[];
}

// Search and filter types
export interface EntrySearchParams {
  author_id?: string;
  tag_ids?: string[];
  is_published?: boolean;
  created_after?: string;
  created_before?: string;
  limit?: number;
  offset?: number;
}

export interface UserSearchParams {
  discoverable?: boolean;
  username?: string;
  email?: string;
  limit?: number;
  offset?: number;
}

// Encryption flow helpers
export interface EncryptedEntryPayload {
  // Fields for the entries table
  encrypted_title: string;
  encrypted_content: string;
  encrypted_frontmatter?: string;
  encryption_metadata: Record<string, any>;
  title_hash: string;
  content_preview_hash?: string;
  is_published: boolean;
  file_path?: string;
  
  // Field for the entry_access_keys table (owner's key)
  owner_encrypted_entry_key: string;
  owner_key_nonce: string;
  
  // Optional tag associations
  tag_ids?: string[];
}

// API endpoint paths (for reference)
export const API_ENDPOINTS = {
  // Users
  CREATE_USER: '/api/users',
  GET_USER: '/api/users/:id',
  UPDATE_USER: '/api/users/:id',
  SEARCH_USERS: '/api/users',
  
  // Entries
  CREATE_ENTRY: '/api/entries',
  GET_ENTRY: '/api/entries/:id',
  UPDATE_ENTRY: '/api/entries/:id',
  DELETE_ENTRY: '/api/entries/:id',
  LIST_ENTRIES: '/api/entries',
  GET_ENTRY_ACCESS_KEY: '/api/entries/:id/access-key',
  
  // Sharing
  SHARE_ENTRY: '/api/entries/:id/share',
  REVOKE_ENTRY_ACCESS: '/api/entries/:id/revoke',
  
  // Tags
  CREATE_TAG: '/api/tags',
  GET_TAG: '/api/tags/:id',
  UPDATE_TAG: '/api/tags/:id',
  DELETE_TAG: '/api/tags/:id',
  LIST_TAGS: '/api/tags',
  
  // User tags (RBAC)
  CREATE_USER_TAG: '/api/user-tags',
  DELETE_USER_TAG: '/api/user-tags/:id',
  LIST_USER_TAGS: '/api/user-tags',
} as const;

// Error types
export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public code: string = 'UNKNOWN_ERROR',
    public details?: any
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

// Request/Response helpers
export interface RequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}

export interface ApiClient {
  get<T>(url: string, config?: Omit<RequestConfig, 'method'>): Promise<ApiResponse<T>>;
  post<T>(url: string, data?: any, config?: Omit<RequestConfig, 'method' | 'body'>): Promise<ApiResponse<T>>;
  put<T>(url: string, data?: any, config?: Omit<RequestConfig, 'method' | 'body'>): Promise<ApiResponse<T>>;
  delete<T>(url: string, config?: Omit<RequestConfig, 'method'>): Promise<ApiResponse<T>>;
}