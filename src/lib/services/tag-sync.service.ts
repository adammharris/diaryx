/**
 * Tag Synchronization Service
 * Bridges frontend YAML frontmatter tags with backend sharing tags
 */

import { writable, type Writable } from 'svelte/store';
import { FrontmatterService, type FrontmatterData } from '../storage/frontmatter.service.js';
import { tagService, type Tag, type TagWithUsers } from './tag.service.js';
import { apiAuthService } from './api-auth.service.js';

export interface TagSyncMetadata {
  entryId: string;
  lastFrontmatterSync: string;
  lastBackendSync: string;
  conflictResolution: 'merge' | 'frontmatter' | 'backend';
  pendingSync: boolean;
  frontmatterTags: string[];
  backendTagIds: string[];
}

export interface TagSyncResult {
  success: boolean;
  syncedTags: string[];
  createdTags: Tag[];
  conflicts: string[];
  error?: string;
}

export interface ConflictResolution {
  strategy: 'merge' | 'frontmatter' | 'backend' | 'manual';
  selectedTags?: string[];
}

class TagSyncService {
  private syncMetadataStore: Writable<Map<string, TagSyncMetadata>> = writable(new Map());
  private readonly SYNC_VERSION = '1.0.0';

  constructor() {
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    // Initialize sync metadata from localStorage if available
    this.loadSyncMetadata();
  }

  /**
   * Sync frontmatter tags to backend when publishing
   */
  async syncFrontmatterToBackend(
    entryId: string, 
    entryContent: string,
    existingBackendTagIds: string[] = []
  ): Promise<TagSyncResult> {
    if (!apiAuthService.isAuthenticated()) {
      return {
        success: false,
        syncedTags: [],
        createdTags: [],
        conflicts: [],
        error: 'User not authenticated'
      };
    }

    try {
      // Parse frontmatter tags from entry content
      const parsedContent = FrontmatterService.parseContent(entryContent);
      const frontmatterTags = FrontmatterService.extractTags(parsedContent.frontmatter);
      
      console.log('Syncing frontmatter tags to backend:', {
        entryId,
        frontmatterTags,
        existingBackendTagIds
      });

      if (frontmatterTags.length === 0) {
        // No frontmatter tags to sync
        return {
          success: true,
          syncedTags: existingBackendTagIds,
          createdTags: [],
          conflicts: []
        };
      }

      // Get all available backend tags
      const availableTags = await tagService.loadTags();
      const tagNameToIdMap = new Map<string, string>();
      const tagIdToNameMap = new Map<string, string>();
      
      availableTags.forEach(tagWithUsers => {
        const tag = tagWithUsers.tag;
        tagNameToIdMap.set(tag.name.toLowerCase(), tag.id);
        tagIdToNameMap.set(tag.id, tag.name);
      });

      // Process frontmatter tags
      const syncedTagIds: string[] = [...existingBackendTagIds];
      const createdTags: Tag[] = [];
      const conflicts: string[] = [];

      for (const frontmatterTag of frontmatterTags) {
        const normalizedTag = frontmatterTag.toLowerCase().trim();
        
        if (tagNameToIdMap.has(normalizedTag)) {
          // Tag exists in backend
          const tagId = tagNameToIdMap.get(normalizedTag)!;
          if (!syncedTagIds.includes(tagId)) {
            syncedTagIds.push(tagId);
          }
        } else {
          // Tag doesn't exist in backend - create it
          try {
            const newTag = await this.createTagFromFrontmatter(normalizedTag);
            createdTags.push(newTag);
            syncedTagIds.push(newTag.id);
            console.log(`Created new backend tag: ${newTag.name} (${newTag.id})`);
          } catch (error) {
            console.warn(`Failed to create backend tag for "${normalizedTag}":`, error);
            conflicts.push(normalizedTag);
          }
        }
      }

      // Update sync metadata
      await this.updateSyncMetadata(entryId, {
        lastFrontmatterSync: new Date().toISOString(),
        frontmatterTags,
        backendTagIds: syncedTagIds,
        conflictResolution: 'merge',
        pendingSync: false
      });

      return {
        success: true,
        syncedTags: syncedTagIds,
        createdTags,
        conflicts
      };

    } catch (error) {
      console.error('Failed to sync frontmatter tags to backend:', error);
      return {
        success: false,
        syncedTags: existingBackendTagIds,
        createdTags: [],
        conflicts: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Sync backend tags to frontmatter when importing
   */
  async syncBackendToFrontmatter(
    entryId: string,
    entryContent: string,
    backendTagIds: string[]
  ): Promise<{ success: boolean; updatedContent: string; addedTags: string[] }> {
    try {
      if (backendTagIds.length === 0) {
        return {
          success: true,
          updatedContent: entryContent,
          addedTags: []
        };
      }

      // Parse existing frontmatter
      const parsedContent = FrontmatterService.parseContent(entryContent);
      const existingTags = FrontmatterService.extractTags(parsedContent.frontmatter);

      // Get backend tag names
      const availableTags = await tagService.loadTags();
      const tagIdToNameMap = new Map<string, string>();
      
      availableTags.forEach(tagWithUsers => {
        tagIdToNameMap.set(tagWithUsers.tag.id, tagWithUsers.tag.name);
      });

      // Convert backend tag IDs to names
      const backendTagNames = backendTagIds
        .map(id => tagIdToNameMap.get(id))
        .filter(Boolean) as string[];

      // Merge with existing frontmatter tags (avoid duplicates)
      const existingTagsLower = existingTags.map(t => t.toLowerCase());
      const newTags = backendTagNames.filter(tagName => 
        !existingTagsLower.includes(tagName.toLowerCase())
      );

      if (newTags.length === 0) {
        // No new tags to add
        return {
          success: true,
          updatedContent: entryContent,
          addedTags: []
        };
      }

      // Merge all tags
      const allTags = [...existingTags, ...newTags];
      
      // Update frontmatter
      const updatedFrontmatter: FrontmatterData = {
        ...parsedContent.frontmatter,
        tags: allTags
      };

      // Reconstruct content with updated frontmatter
      const updatedContent = this.reconstructContentWithFrontmatter(
        parsedContent.content,
        updatedFrontmatter,
        parsedContent.hasFrontmatter
      );

      // Update sync metadata
      await this.updateSyncMetadata(entryId, {
        lastBackendSync: new Date().toISOString(),
        frontmatterTags: allTags,
        backendTagIds,
        conflictResolution: 'merge',
        pendingSync: false
      });

      console.log('Synced backend tags to frontmatter:', {
        entryId,
        existingTags,
        newTags,
        allTags
      });

      return {
        success: true,
        updatedContent,
        addedTags: newTags
      };

    } catch (error) {
      console.error('Failed to sync backend tags to frontmatter:', error);
      return {
        success: false,
        updatedContent: entryContent,
        addedTags: []
      };
    }
  }

  /**
   * Get frontmatter tags from entry content
   */
  getFrontmatterTags(entryContent: string): string[] {
    const parsedContent = FrontmatterService.parseContent(entryContent);
    return FrontmatterService.extractTags(parsedContent.frontmatter);
  }

  /**
   * Check if entry needs tag synchronization
   */
  async needsSync(entryId: string, frontmatterTags: string[], backendTagIds: string[]): Promise<boolean> {
    const metadata = await this.getSyncMetadata(entryId);
    
    if (!metadata) {
      return frontmatterTags.length > 0 || backendTagIds.length > 0;
    }

    // Check if tags have changed
    const frontmatterChanged = !this.arraysEqual(
      frontmatterTags.sort(), 
      metadata.frontmatterTags.sort()
    );
    
    const backendChanged = !this.arraysEqual(
      backendTagIds.sort(), 
      metadata.backendTagIds.sort()
    );

    return frontmatterChanged || backendChanged;
  }

  /**
   * Resolve tag conflicts with specified strategy
   */
  async resolveConflicts(
    entryId: string,
    entryContent: string,
    backendTagIds: string[],
    resolution: ConflictResolution
  ): Promise<TagSyncResult> {
    switch (resolution.strategy) {
      case 'merge':
        // Merge both frontmatter and backend tags
        const frontmatterResult = await this.syncFrontmatterToBackend(entryId, entryContent, backendTagIds);
        return frontmatterResult;

      case 'frontmatter':
        // Use only frontmatter tags, sync to backend
        return await this.syncFrontmatterToBackend(entryId, entryContent, []);

      case 'backend':
        // Use only backend tags, don't sync to backend
        return {
          success: true,
          syncedTags: backendTagIds,
          createdTags: [],
          conflicts: []
        };

      case 'manual':
        // Use manually selected tags
        return {
          success: true,
          syncedTags: resolution.selectedTags || [],
          createdTags: [],
          conflicts: []
        };

      default:
        throw new Error(`Unknown conflict resolution strategy: ${resolution.strategy}`);
    }
  }

  /**
   * Create a backend tag from a frontmatter tag name
   */
  private async createTagFromFrontmatter(tagName: string): Promise<Tag> {
    // Generate a color for the new tag (simple hash-based color selection)
    const colors = tagService.getTagColors();
    const colorIndex = this.hashString(tagName) % colors.length;
    const color = colors[colorIndex].value;

    return await tagService.createTag({
      name: tagName,
      color
    });
  }

  /**
   * Reconstruct markdown content with updated frontmatter
   */
  private reconstructContentWithFrontmatter(
    content: string,
    frontmatter: FrontmatterData,
    hadFrontmatter: boolean
  ): string {
    if (Object.keys(frontmatter).length === 0) {
      // No frontmatter to add
      return content;
    }

    // Convert frontmatter to YAML
    const yamlLines: string[] = [];
    
    Object.entries(frontmatter).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        yamlLines.push(`${key}: [${value.map(v => `"${v}"`).join(', ')}]`);
      } else if (typeof value === 'string') {
        yamlLines.push(`${key}: "${value}"`);
      } else {
        yamlLines.push(`${key}: ${value}`);
      }
    });

    const frontmatterBlock = [
      '---',
      ...yamlLines,
      '---',
      ''
    ].join('\n');

    return frontmatterBlock + content;
  }

  /**
   * Update sync metadata for an entry
   */
  private async updateSyncMetadata(
    entryId: string, 
    updates: Partial<TagSyncMetadata>
  ): Promise<void> {
    const currentMetadata = await this.getSyncMetadata(entryId);
    const updatedMetadata: TagSyncMetadata = {
      entryId,
      lastFrontmatterSync: currentMetadata?.lastFrontmatterSync || '',
      lastBackendSync: currentMetadata?.lastBackendSync || '',
      conflictResolution: currentMetadata?.conflictResolution || 'merge',
      pendingSync: currentMetadata?.pendingSync || false,
      frontmatterTags: currentMetadata?.frontmatterTags || [],
      backendTagIds: currentMetadata?.backendTagIds || [],
      ...updates
    };

    this.syncMetadataStore.update(map => {
      map.set(entryId, updatedMetadata);
      return map;
    });

    // Persist to localStorage
    this.saveSyncMetadata();
  }

  /**
   * Get sync metadata for an entry
   */
  private async getSyncMetadata(entryId: string): Promise<TagSyncMetadata | null> {
    return new Promise((resolve) => {
      const unsubscribe = this.syncMetadataStore.subscribe((map) => {
        unsubscribe();
        resolve(map.get(entryId) || null);
      });
    });
  }

  /**
   * Load sync metadata from localStorage
   */
  private loadSyncMetadata(): void {
    try {
      const stored = localStorage.getItem('diaryx_tag_sync_metadata');
      if (stored) {
        const data = JSON.parse(stored);
        const map = new Map<string, TagSyncMetadata>();
        
        Object.entries(data).forEach(([entryId, metadata]) => {
          map.set(entryId, metadata as TagSyncMetadata);
        });
        
        this.syncMetadataStore.set(map);
      }
    } catch (error) {
      console.warn('Failed to load tag sync metadata:', error);
    }
  }

  /**
   * Save sync metadata to localStorage
   */
  private saveSyncMetadata(): void {
    this.syncMetadataStore.subscribe((map) => {
      try {
        const data = Object.fromEntries(map);
        localStorage.setItem('diaryx_tag_sync_metadata', JSON.stringify(data));
      } catch (error) {
        console.warn('Failed to save tag sync metadata:', error);
      }
    })();
  }

  /**
   * Utility: Simple hash function for strings
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Utility: Compare two arrays for equality
   */
  private arraysEqual<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((val, i) => val === b[i]);
  }

  /**
   * Get sync metadata store for reactive updates
   */
  getSyncMetadataStore() {
    return this.syncMetadataStore;
  }

  /**
   * Clear all sync metadata (for testing/debugging)
   */
  async clearSyncMetadata(): Promise<void> {
    this.syncMetadataStore.set(new Map());
    localStorage.removeItem('diaryx_tag_sync_metadata');
  }
}

// Export singleton instance  
export const tagSyncService = new TagSyncService();