/**
 * Tag Management Service
 * Handles CRUD operations for tags and user-tag assignments
 */

import { writable, type Writable } from 'svelte/store';
import { fetch } from '../utils/fetch.js';
import { apiAuthService } from './api-auth.service.js';
import type { SearchableUser } from './user-search.service.js';
import { entrySharingService } from './entry-sharing.service.js';

export interface Tag {
  id: string;
  name: string;
  slug: string;
  color: string;
  author_id: string;
  created_at: string;
  updated_at: string;
}

export interface UserTag {
  id: string;
  tagger_id: string;
  target_id: string;
  tag_id: string;
  created_at: string;
  // Populated via joins
  tag?: Tag;
  target_user?: SearchableUser;
}

export interface TagWithUsers {
  tag: Tag;
  assignedUsers: SearchableUser[];
  userCount: number;
}

export interface CreateTagData {
  name: string;
  color: string;
}

export interface UpdateTagData {
  name?: string;
  color?: string;
}

class TagService {
  private readonly API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  private tagsStore: Writable<TagWithUsers[]> = writable([]);
  private userTagsStore: Writable<UserTag[]> = writable([]);

  constructor() {
    // Load initial data when user is authenticated
    this.initializeStores();
  }

  private async initializeStores(): Promise<void> {
    if (apiAuthService.isAuthenticated()) {
      try {
        await Promise.all([
          this.loadTags(),
          this.loadUserTags()
        ]);
      } catch (error) {
        console.error('Failed to initialize tag stores:', error);
      }
    }
  }

  /**
   * Create a new tag
   */
  async createTag(tagData: CreateTagData): Promise<Tag> {
    if (!apiAuthService.isAuthenticated()) {
      throw new Error('User must be authenticated to create tags');
    }

    // Input validation
    if (!tagData.name || typeof tagData.name !== 'string' || tagData.name.trim().length === 0) {
      throw new Error('Tag name is required');
    }

    if (!tagData.color || typeof tagData.color !== 'string') {
      throw new Error('Tag color is required');
    }

    try {
      const slug = this.generateSlug(tagData.name);
      
      const response = await fetch(`${this.API_BASE_URL}/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...apiAuthService.getAuthHeaders()
        },
        body: JSON.stringify({
          name: tagData.name.trim(),
          slug,
          color: tagData.color
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to create tag: ${response.status}`);
      }

      const result = await response.json();
      const newTag = result.data as Tag;

      // Update local store
      await this.loadTags();

      return newTag;
    } catch (error) {
      console.error('Tag creation failed:', error);
      throw error;
    }
  }

  /**
   * Update an existing tag
   */
  async updateTag(tagId: string, tagData: UpdateTagData): Promise<Tag> {
    if (!apiAuthService.isAuthenticated()) {
      throw new Error('User must be authenticated to update tags');
    }

    if (!tagId || typeof tagId !== 'string') {
      throw new Error('Valid tag ID is required');
    }

    try {
      const updateData: any = {};
      
      if (tagData.name !== undefined) {
        if (typeof tagData.name !== 'string' || tagData.name.trim().length === 0) {
          throw new Error('Tag name must be a non-empty string');
        }
        updateData.name = tagData.name.trim();
        updateData.slug = this.generateSlug(tagData.name);
      }

      if (tagData.color !== undefined) {
        if (typeof tagData.color !== 'string') {
          throw new Error('Tag color must be a string');
        }
        updateData.color = tagData.color;
      }

      const response = await fetch(`${this.API_BASE_URL}/tags/${tagId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...apiAuthService.getAuthHeaders()
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to update tag: ${response.status}`);
      }

      const result = await response.json();
      const updatedTag = result.data as Tag;

      // Update local store
      await this.loadTags();

      return updatedTag;
    } catch (error) {
      console.error('Tag update failed:', error);
      throw error;
    }
  }

  /**
   * Delete a tag
   */
  async deleteTag(tagId: string): Promise<void> {
    if (!apiAuthService.isAuthenticated()) {
      throw new Error('User must be authenticated to delete tags');
    }

    if (!tagId || typeof tagId !== 'string') {
      throw new Error('Valid tag ID is required');
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/tags/${tagId}`, {
        method: 'DELETE',
        headers: {
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to delete tag: ${response.status}`);
      }

      // Update local stores
      await Promise.all([
        this.loadTags(),
        this.loadUserTags()
      ]);
    } catch (error) {
      console.error('Tag deletion failed:', error);
      throw error;
    }
  }

  /**
   * Load all tags created by the current user
   */
  async loadTags(): Promise<TagWithUsers[]> {
    if (!apiAuthService.isAuthenticated()) {
      return [];
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/tags`, {
        method: 'GET',
        headers: {
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load tags: ${response.status}`);
      }

      const result = await response.json();
      const tags = result.data as Tag[];

      // Load user assignments for each tag
      const tagsWithUsers: TagWithUsers[] = await Promise.all(
        tags.map(async (tag) => {
          const assignedUsers = await this.getTagAssignments(tag.id);
          return {
            tag,
            assignedUsers,
            userCount: assignedUsers.length
          };
        })
      );

      this.tagsStore.set(tagsWithUsers);
      return tagsWithUsers;
    } catch (error) {
      console.error('Failed to load tags:', error);
      this.tagsStore.set([]);
      return [];
    }
  }

  /**
   * Assign a tag to a user
   */
  async assignTagToUser(tagId: string, userId: string): Promise<UserTag> {
    if (!apiAuthService.isAuthenticated()) {
      throw new Error('User must be authenticated to assign tags');
    }

    if (!tagId || !userId || typeof tagId !== 'string' || typeof userId !== 'string') {
      throw new Error('Valid tag ID and user ID are required');
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/user-tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...apiAuthService.getAuthHeaders()
        },
        body: JSON.stringify({
          tag_id: tagId,
          target_id: userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to assign tag: ${response.status}`);
      }

      const result = await response.json();
      const userTag = result.data as UserTag;

      // Update local stores
      await Promise.all([
        this.loadTags(),
        this.loadUserTags()
      ]);

      return userTag;
    } catch (error) {
      console.error('Tag assignment failed:', error);
      throw error;
    }
  }

  /**
   * Remove a tag assignment from a user
   */
  async removeTagFromUser(tagId: string, userId: string): Promise<void> {
    if (!apiAuthService.isAuthenticated()) {
      throw new Error('User must be authenticated to remove tag assignments');
    }

    if (!tagId || !userId) {
      throw new Error('Valid tag ID and user ID are required');
    }

    try {
      // Find the user tag assignment
      const userTags = await this.getUserTagAssignments();
      const userTag = userTags.find(ut => ut.tag_id === tagId && ut.target_id === userId);
      
      if (!userTag) {
        throw new Error('Tag assignment not found');
      }

      const response = await fetch(`${this.API_BASE_URL}/user-tags/${userTag.id}`, {
        method: 'DELETE',
        headers: {
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to remove tag assignment: ${response.status}`);
      }

      // CRITICAL: Revoke access to all entries shared with this tag
      try {
        console.log(`Revoking entry access for user ${userId} removed from tag ${tagId}`);
        
        // Get all entries shared with this tag
        const sharedEntryIds = await entrySharingService.getEntriesSharedWithTag(tagId);
        
        if (sharedEntryIds.length > 0) {
          console.log(`Found ${sharedEntryIds.length} entries shared with tag ${tagId}, revoking access...`);
          
          // Revoke access for this user to all entries shared with this tag
          await Promise.all(
            sharedEntryIds.map(entryId => 
              entrySharingService.revokeEntryAccessForUsers(entryId, [userId])
            )
          );
          
          console.log(`Successfully revoked access to ${sharedEntryIds.length} entries for user ${userId}`);
        } else {
          console.log(`No entries shared with tag ${tagId}, no access to revoke`);
        }
      } catch (accessError) {
        console.error('Failed to revoke entry access, but tag removal succeeded:', accessError);
        // Don't throw - tag removal succeeded, access revocation is secondary
        // This prevents the UI from showing an error when the primary operation succeeded
      }

      // Update local stores
      await Promise.all([
        this.loadTags(),
        this.loadUserTags()
      ]);
    } catch (error) {
      console.error('Tag removal failed:', error);
      throw error;
    }
  }

  /**
   * Get all users assigned to a specific tag
   */
  async getTagAssignments(tagId: string): Promise<SearchableUser[]> {
    if (!apiAuthService.isAuthenticated()) {
      return [];
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/user-tags?tag_id=${tagId}`, {
        method: 'GET',
        headers: {
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get tag assignments: ${response.status}`);
      }

      const result = await response.json();
      const userTags = result.data as UserTag[];

      console.log('Raw API response for getTagAssignments:', result);
      console.log('UserTags:', userTags);

      // Extract target users (this assumes the API populates target_user)
      const users = userTags.map(ut => ut.target_user).filter(Boolean) as SearchableUser[];
      console.log('Extracted users with public keys:', users.map(u => ({ id: u.id, username: u.username, hasPublicKey: !!u.public_key })));
      
      return users;
    } catch (error) {
      console.error('Failed to get tag assignments:', error);
      return [];
    }
  }

  /**
   * Load all user-tag assignments made by the current user
   */
  async loadUserTags(): Promise<UserTag[]> {
    if (!apiAuthService.isAuthenticated()) {
      return [];
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/user-tags`, {
        method: 'GET',
        headers: {
          ...apiAuthService.getAuthHeaders()
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load user tags: ${response.status}`);
      }

      const result = await response.json();
      const userTags = result.data as UserTag[];

      this.userTagsStore.set(userTags);
      return userTags;
    } catch (error) {
      console.error('Failed to load user tags:', error);
      this.userTagsStore.set([]);
      return [];
    }
  }

  /**
   * Get user tag assignments (cached from store)
   */
  async getUserTagAssignments(): Promise<UserTag[]> {
    return new Promise((resolve) => {
      let unsubscribe: (() => void) | null = null;
      unsubscribe = this.userTagsStore.subscribe((userTags) => {
        if (unsubscribe) {
          unsubscribe();
        }
        resolve(userTags);
      });
    });
  }

  /**
   * Generate a URL-friendly slug from tag name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Get reactive store for tags
   */
  get tagsStore() {
    return this.tagsStore;
  }

  /**
   * Get reactive store for user-tag assignments
   */
  get userTagsStore() {
    return this.userTagsStore;
  }

  /**
   * Refresh all data
   */
  async refresh(): Promise<void> {
    if (apiAuthService.isAuthenticated()) {
      await Promise.all([
        this.loadTags(),
        this.loadUserTags()
      ]);
    }
  }

  /**
   * Get available tag colors
   */
  getTagColors(): { name: string; value: string }[] {
    return [
      { name: 'Red', value: '#ef4444' },
      { name: 'Orange', value: '#f97316' },
      { name: 'Yellow', value: '#eab308' },
      { name: 'Green', value: '#22c55e' },
      { name: 'Blue', value: '#3b82f6' },
      { name: 'Indigo', value: '#6366f1' },
      { name: 'Purple', value: '#a855f7' },
      { name: 'Pink', value: '#ec4899' },
      { name: 'Gray', value: '#6b7280' },
      { name: 'Teal', value: '#14b8a6' }
    ];
  }
}

// Export singleton instance
export const tagService = new TagService();