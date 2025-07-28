/**
 * User Search Service
 * Handles searching for users to assign tags for sharing
 */

import { apiAuthService } from './api-auth.service.js';

export interface SearchableUser {
  id: string;
  username: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  public_key?: string;
  discoverable: boolean;
}

export interface UserSearchResult {
  users: SearchableUser[];
  total: number;
  hasMore: boolean;
}

class UserSearchService {
  private readonly API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  private searchCache = new Map<string, UserSearchResult>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Clear cache periodically
    setInterval(() => {
      this.clearExpiredCache();
    }, this.CACHE_TTL);
  }

  /**
   * Search for users by query string
   */
  async searchUsers(
    query: string, 
    limit: number = 20, 
    offset: number = 0
  ): Promise<UserSearchResult> {
    // Input validation
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return { users: [], total: 0, hasMore: false };
    }

    if (!apiAuthService.isAuthenticated()) {
      throw new Error('User must be authenticated to search for users');
    }

    const cacheKey = `${query.toLowerCase()}_${limit}_${offset}`;
    
    // Check cache first
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const params = new URLSearchParams({
        q: query.trim(),
        limit: limit.toString(),
        offset: offset.toString()
      });

      const response = await fetch(`${this.API_BASE_URL}/users/search?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      const result: UserSearchResult = {
        users: data.users || [],
        total: data.total || 0,
        hasMore: data.hasMore || false
      };

      // Cache the result
      this.searchCache.set(cacheKey, result);

      return result;
    } catch (error) {
      console.error('User search failed:', error);
      throw error;
    }
  }

  /**
   * Get a specific user by ID (for validation)
   */
  async getUserById(userId: string): Promise<SearchableUser | null> {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID provided');
    }

    if (!apiAuthService.isAuthenticated()) {
      throw new Error('User must be authenticated');
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/users/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to get user: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.data as SearchableUser;
    } catch (error) {
      console.error('Get user by ID failed:', error);
      throw error;
    }
  }

  /**
   * Get current user's profile for tag assignment validation
   */
  async getCurrentUserProfile(): Promise<SearchableUser | null> {
    const currentUser = apiAuthService.getCurrentUser();
    if (!currentUser) {
      return null;
    }

    try {
      return await this.getUserById(currentUser.id);
    } catch (error) {
      console.error('Failed to get current user profile:', error);
      return null;
    }
  }

  /**
   * Validate that a user can be tagged (is discoverable, has public key for encryption)
   */
  validateUserForTagging(user: SearchableUser): { valid: boolean; reason?: string } {
    if (!user.discoverable) {
      return { valid: false, reason: 'User has disabled discovery' };
    }

    if (!user.public_key) {
      return { valid: false, reason: 'User has not set up encryption keys' };
    }

    return { valid: true };
  }

  /**
   * Clear expired cache entries
   */
  private clearExpiredCache(): void {
    // For simplicity, clear all cache entries on timer
    // In a more sophisticated implementation, you'd track timestamps
    this.searchCache.clear();
  }

  /**
   * Clear all cached search results
   */
  clearCache(): void {
    this.searchCache.clear();
  }

  /**
   * Debounced search function for UI use
   */
  createDebouncedSearch(delay: number = 300) {
    let timeoutId: NodeJS.Timeout;
    
    return (query: string, limit?: number, offset?: number): Promise<UserSearchResult> => {
      return new Promise((resolve, reject) => {
        clearTimeout(timeoutId);
        
        timeoutId = setTimeout(async () => {
          try {
            const result = await this.searchUsers(query, limit, offset);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }, delay);
      });
    };
  }
}

// Export singleton instance
export const userSearchService = new UserSearchService();