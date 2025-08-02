/**
 * Basic tests for tag synchronization functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tagSyncService } from './tag-sync.service';

// Mock the tag service
vi.mock('./tag.service', () => ({
  tagService: {
    loadTags: vi.fn(),
    createTag: vi.fn(),
    getTagColors: vi.fn(() => [
      { name: 'Blue', value: '#3b82f6' },
      { name: 'Red', value: '#ef4444' }
    ])
  }
}));

describe('TagSyncService', () => {
  beforeEach(() => {
    // Clear any cached metadata
    tagSyncService.clearSyncMetadata();
    vi.clearAllMocks();
  });

  describe('getFrontmatterTags', () => {
    it('should extract tags from YAML frontmatter', () => {
      const content = `---
tags: [work, personal, important]
title: "Test Entry"
---

This is my entry content.`;

      const tags = tagSyncService.getFrontmatterTags(content);
      expect(tags).toEqual(['work', 'personal', 'important']);
    });

    it('should handle no frontmatter', () => {
      const content = 'This is just plain content.';
      const tags = tagSyncService.getFrontmatterTags(content);
      expect(tags).toEqual([]);
    });

    it('should handle empty tags array', () => {
      const content = `---
tags: []
title: "Test Entry"
---

Content here.`;

      const tags = tagSyncService.getFrontmatterTags(content);
      expect(tags).toEqual([]);
    });
  });

  describe('syncBackendToFrontmatter', () => {
    it('should add backend tags to frontmatter when no existing frontmatter', async () => {
      const { tagService } = await import('./tag.service');
      (tagService.loadTags as any).mockResolvedValue([
        {
          tag: { id: 'tag1', name: 'work' },
          assignedUsers: [],
          userCount: 0
        },
        {
          tag: { id: 'tag2', name: 'personal' },
          assignedUsers: [],
          userCount: 0
        }
      ]);

      const content = 'This is my entry content.';
      const backendTagIds = ['tag1', 'tag2'];

      const result = await tagSyncService.syncBackendToFrontmatter('test-entry', content, backendTagIds);

      expect(result.success).toBe(true);
      expect(result.addedTags).toEqual(['work', 'personal']);
      expect(result.updatedContent).toContain('tags: ["work", "personal"]');
      expect(result.updatedContent).toContain('This is my entry content.');
    });

    it('should merge backend tags with existing frontmatter tags', async () => {
      const { tagService } = await import('./tag.service');
      (tagService.loadTags as any).mockResolvedValue([
        {
          tag: { id: 'tag1', name: 'work' },
          assignedUsers: [],
          userCount: 0
        }
      ]);

      const content = `---
tags: [personal, important]
title: "Test Entry"
---

Content here.`;

      const backendTagIds = ['tag1'];

      const result = await tagSyncService.syncBackendToFrontmatter('test-entry', content, backendTagIds);

      expect(result.success).toBe(true);
      expect(result.addedTags).toEqual(['work']);
      expect(result.updatedContent).toContain('tags: ["personal", "important", "work"]');
    });

    it('should not add duplicate tags', async () => {
      const { tagService } = await import('./tag.service');
      (tagService.loadTags as any).mockResolvedValue([
        {
          tag: { id: 'tag1', name: 'work' },
          assignedUsers: [],
          userCount: 0
        }
      ]);

      const content = `---
tags: [work, personal]
---

Content.`;

      const backendTagIds = ['tag1'];

      const result = await tagSyncService.syncBackendToFrontmatter('test-entry', content, backendTagIds);

      expect(result.success).toBe(true);
      expect(result.addedTags).toEqual([]);
      expect(result.updatedContent).toBe(content); // No change
    });
  });

  describe('syncFrontmatterToBackend', () => {
    it('should identify matching backend tags for frontmatter tags', async () => {
      const { tagService } = await import('./tag.service');
      (tagService.loadTags as any).mockResolvedValue([
        {
          tag: { id: 'tag1', name: 'work' },
          assignedUsers: [],
          userCount: 0
        },
        {
          tag: { id: 'tag2', name: 'personal' },
          assignedUsers: [],
          userCount: 0
        }
      ]);

      const content = `---
tags: [work, personal, newTag]
---

Content.`;

      const result = await tagSyncService.syncFrontmatterToBackend('test-entry', content, []);

      expect(result.success).toBe(true);
      expect(result.syncedTags).toContain('tag1');
      expect(result.syncedTags).toContain('tag2');
      expect(result.conflicts).toEqual(['newtag']); // Lowercased but no backend tag created in mock
    });

    it('should handle missing authentication gracefully', async () => {
      // Mock unauthenticated state
      vi.doMock('./api-auth.service', () => ({
        apiAuthService: {
          isAuthenticated: () => false
        }
      }));

      const content = `---
tags: [work]
---

Content.`;

      const result = await tagSyncService.syncFrontmatterToBackend('test-entry', content, []);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not authenticated');
    });
  });

  describe('needsSync', () => {
    it('should detect when sync is needed', async () => {
      const frontmatterTags = ['work', 'personal'];
      const backendTagIds = ['tag1']; // Different

      const needsSync = await tagSyncService.needsSync('test-entry', frontmatterTags, backendTagIds);
      expect(needsSync).toBe(true);
    });

    it('should detect when no sync is needed with empty arrays', async () => {
      const frontmatterTags: string[] = [];
      const backendTagIds: string[] = [];

      const needsSync = await tagSyncService.needsSync('test-entry', frontmatterTags, backendTagIds);
      expect(needsSync).toBe(false);
    });
  });
});