import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { storageService } from './storage';

describe('StorageService - Basic Functionality', () => {
  beforeEach(() => {
    // Reset environment to build mode to avoid side effects
    storageService.environment = 'build';
  });

  describe('Build Environment (Safe Testing)', () => {
    it('should handle build environment gracefully', async () => {
      expect(storageService.environment).toBe('build');
      
      // All methods should return safe defaults in build mode
      const entries = await storageService.getAllEntries();
      expect(entries).toEqual([]);
      
      const entry = await storageService.getEntry('test');
      expect(entry).toBeNull();
      
      const created = await storageService.createEntry('Test Entry');
      expect(created).toBeNull();
      
      const saved = await storageService.saveEntry('test', 'content');
      expect(saved).toBe(false);
      
      const deleted = await storageService.deleteEntry('test');
      expect(deleted).toBe(false);
      
      const renamed = await storageService.renameEntry('old', 'new');
      expect(renamed).toBeNull();
    });
  });

  describe('Environment Detection', () => {
    it('should provide journal path information', () => {
      // Test Tauri environment path
      storageService.environment = 'tauri';
      expect(storageService.getJournalPath()).toBe('~/Documents/Diaryx/');
      
      // Test web environment path
      storageService.environment = 'web';
      expect(storageService.getJournalPath()).toBe('N/A (Web Browser)');
    });
    
    it('should allow environment switching', () => {
      storageService.environment = 'web';
      expect(storageService.environment).toBe('web');
      
      storageService.environment = 'tauri';
      expect(storageService.environment).toBe('tauri');
      
      storageService.environment = 'build';
      expect(storageService.environment).toBe('build');
    });
  });

  describe('File Watching Management', () => {
    it('should handle file watching lifecycle in build mode', async () => {
      storageService.environment = 'build';
      
      // Should not throw when starting/stopping file watching in build mode
      const mockCallback = () => {};
      
      expect(() => {
        storageService.startFileWatching(mockCallback);
      }).not.toThrow();
      
      expect(() => {
        storageService.stopFileWatching();
      }).not.toThrow();
    });

    it('should not start file watching in web environment', async () => {
      storageService.environment = 'web';
      
      const mockCallback = () => {};
      
      // Should complete without error in web environment
      await expect(
        storageService.startFileWatching(mockCallback)
      ).resolves.toBeUndefined();
    });
  });

  describe('Utility Methods', () => {
    it('should provide path information correctly', () => {
      // Test different environment path responses
      storageService.environment = 'tauri';
      expect(storageService.getJournalPath()).toBe('~/Documents/Diaryx/');
      
      storageService.environment = 'web';
      expect(storageService.getJournalPath()).toBe('N/A (Web Browser)');
    });

    it('should handle title sanitization in build mode', async () => {
      storageService.environment = 'build';
      
      // In build mode, createEntry returns null but shouldn't throw
      const result1 = await storageService.createEntry('Test/Invalid*Title');
      expect(result1).toBeNull();
      
      const result2 = await storageService.createEntry('');
      expect(result2).toBeNull();
      
      const result3 = await storageService.createEntry('A'.repeat(100));
      expect(result3).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid entry IDs gracefully', async () => {
      storageService.environment = 'build';
      
      // Should not throw with null/undefined/empty IDs
      await expect(storageService.getEntry('')).resolves.toBeNull();
      await expect(storageService.saveEntry('', 'content')).resolves.toBe(false);
      await expect(storageService.deleteEntry('')).resolves.toBe(false);
    });

    it('should handle invalid content gracefully', async () => {
      storageService.environment = 'build';
      
      // Should not throw with empty content
      await expect(storageService.saveEntry('test', '')).resolves.toBe(false);
      
      // Should not throw with very large content
      const largeContent = 'A'.repeat(100000);
      await expect(storageService.saveEntry('test', largeContent)).resolves.toBe(false);
    });
  });

  afterEach(() => {
    // Clean up
    storageService.stopFileWatching();
  });
});