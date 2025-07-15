/**
 * Main storage adapter that coordinates all storage operations
 */

import { detectTauri } from '../utils/tauri.js';
import type { JournalEntry, JournalEntryMetadata, IStorageAdapter, StorageEnvironment } from './types.js';
import { CacheStorageAdapter } from './cache.adapter.js';
import { TauriStorageAdapter } from './tauri.adapter.js';
import { WebStorageAdapter } from './web.adapter.js';
import { PreviewService } from './preview.service.js';
import { TitleService } from './title.service.js';
import { passwordStore } from '../stores/password.js';
import { metadataStore } from '../stores/metadata.js';
import { isEncrypted, decrypt } from '../utils/crypto.js';

export class MainStorageAdapter implements IStorageAdapter {
    private cacheAdapter: CacheStorageAdapter;
    private tauriAdapter: TauriStorageAdapter | null = null;
    private webAdapter: WebStorageAdapter | null = null;
    private _environment: StorageEnvironment | null = null;
    private isBuilding: boolean = false;

    constructor() {
        // Detect if we're in build mode (prerendering)
        this.isBuilding = typeof window === 'undefined' || typeof document === 'undefined';
        
        // Initialize adapters
        this.cacheAdapter = new CacheStorageAdapter();
        
        if (this.environment === 'tauri') {
            this.tauriAdapter = new TauriStorageAdapter();
        } else if (this.environment === 'web') {
            this.webAdapter = new WebStorageAdapter();
        }
    }

    private get environment(): StorageEnvironment {
        if (this._environment === null) {
            if (this.isBuilding) {
                this._environment = 'build';
            } else {
                this._environment = detectTauri() ? 'tauri' : 'web';
            }
        }
        return this._environment;
    }

    public get isRunningInTauri(): boolean {
        return this.environment === 'tauri';
    }

    public refreshEnvironmentDetection(): void {
        this._environment = null;
        
        // Re-initialize adapters if needed
        if (this.environment === 'tauri' && !this.tauriAdapter) {
            this.tauriAdapter = new TauriStorageAdapter();
        } else if (this.environment === 'web' && !this.webAdapter) {
            this.webAdapter = new WebStorageAdapter();
        }
    }

    async getAllEntries(): Promise<JournalEntryMetadata[]> {
        // During build/prerender, return empty array to avoid errors
        if (this.environment === 'build') {
            return [];
        }

        if (this.environment === 'tauri' && this.tauriAdapter) {
            try {
                // Try to get from filesystem first with timeout
                const entries = await this.tauriAdapter.getEntriesWithTimeout();
                
                // Cache the results and preserve manually updated titles
                await this.cacheAdapter.cacheEntries(entries);
                
                // Update metadata store with current entries
                metadataStore.setAllEntries(entries);
                
                return entries;
            } catch (error) {
                console.error('Failed to get entries from filesystem, trying cache:', error);
                // Fallback to cache but warn about potential stale data
                const cachedEntries = await this.cacheAdapter.getCachedEntries();
                if (cachedEntries.length > 0) {
                    console.warn('Using cached entries - data may be stale if files were deleted');
                }
                // Update metadata store with cached entries
                metadataStore.setAllEntries(cachedEntries);
                return cachedEntries;
            }
        } else {
            // Web mode - use IndexedDB and create default entries if needed
            await this.createDefaultEntriesForWeb();
            const webEntries = await this.cacheAdapter.getCachedEntries();
            // Update metadata store with web entries
            metadataStore.setAllEntries(webEntries);
            return webEntries;
        }
    }

    async getEntry(id: string): Promise<JournalEntry | null> {
        // During build/prerender, return null to avoid errors
        if (this.environment === 'build') {
            return null;
        }

        if (this.environment === 'tauri' && this.tauriAdapter) {
            try {
                // Try filesystem first with timeout to prevent infinite loading
                const entry = await this.tauriAdapter.getEntryWithTimeout(id);
                
                // Cache the result
                if (entry) {
                    await this.cacheAdapter.cacheEntry(entry);
                }
                
                return entry;
            } catch (error) {
                console.error(`Failed to get entry ${id} from filesystem, trying cache:`, error);
                // Fallback to cache
                const cachedEntry = await this.cacheAdapter.getCachedEntry(id);
                if (!cachedEntry) {
                    console.warn(`Entry ${id} not found in filesystem or cache, may have been deleted`);
                }
                return cachedEntry;
            }
        } else {
            // Web mode - only use IndexedDB
            return await this.cacheAdapter.getCachedEntry(id);
        }
    }

    async saveEntry(id: string, content: string): Promise<boolean> {
        // During build/prerender, return false to avoid errors
        if (this.environment === 'build') {
            return false;
        }

        if (this.environment === 'tauri' && this.tauriAdapter) {
            const success = await this.tauriAdapter.saveEntryToFS(id, content);
            
            if (success) {
                // Update cache
                const entry = await this.tauriAdapter.getEntryFromFS(id);
                if (entry) {
                    await this.cacheAdapter.cacheEntry(entry);
                    await this.updateMetadataFromEntry(entry);
                }
            }
            
            return success;
        } else {
            // Web mode - save to IndexedDB
            return await this.saveEntryInWeb(id, content);
        }
    }

    async createEntry(title: string): Promise<string | null> {
        // During build/prerender, return null to avoid errors
        if (this.environment === 'build') {
            return null;
        }

        if (this.environment === 'tauri' && this.tauriAdapter) {
            return await this.tauriAdapter.createEntryInFS(title);
        } else {
            // Web mode - create in IndexedDB
            return await this.createEntryInWeb(title);
        }
    }

    async deleteEntry(id: string): Promise<boolean> {
        console.log('MainAdapter.deleteEntry called with id:', id);
        console.log('Current environment:', this.environment);
        
        // During build/prerender, return false to avoid errors
        if (this.environment === 'build') {
            console.log('Build environment detected, returning false');
            return false;
        }

        if (this.environment === 'tauri' && this.tauriAdapter) {
            console.log('Using Tauri adapter for deletion');
            const success = await this.tauriAdapter.deleteEntryFromFS(id);
            console.log('Tauri adapter delete result:', success);
            
            if (success) {
                console.log('Deleting from cache');
                await this.cacheAdapter.deleteCachedEntry(id);
                console.log('Cache deletion complete');
            }
            
            return success;
        } else {
            console.log('Using web adapter for deletion');
            // Web mode - delete from IndexedDB
            return await this.deleteEntryInWeb(id);
        }
    }

    async renameEntry(oldId: string, newTitle: string): Promise<string | null> {
        console.log('MainAdapter.renameEntry called with id:', oldId, 'newTitle:', newTitle);
        
        // During build/prerender, return null to avoid errors
        if (this.environment === 'build') {
            console.log('Build environment detected, returning null');
            return null;
        }

        if (this.environment === 'tauri' && this.tauriAdapter) {
            console.log('Using Tauri adapter for rename');
            const newId = await this.tauriAdapter.renameEntryInFS(oldId, newTitle);
            
            if (newId) {
                console.log('File renamed successfully, updating cache');
                // Update cache with new ID
                const oldEntry = await this.cacheAdapter.getCachedEntry(oldId);
                if (oldEntry) {
                    const updatedEntry = {
                        ...oldEntry,
                        id: newId,
                        title: newTitle,
                        modified_at: new Date().toISOString()
                    };
                    
                    await this.cacheAdapter.cacheEntry(updatedEntry);
                    await this.cacheAdapter.deleteCachedEntry(oldId);
                    await this.updateMetadataFromEntry(updatedEntry);
                }
            }
            
            return newId;
        } else {
            console.log('Using web adapter for rename');
            // Web mode - update in IndexedDB
            if (!this.webAdapter) {
                throw new Error('Web adapter not initialized');
            }
            
            const newId = await this.webAdapter.renameEntryInWeb(oldId, newTitle);
            if (newId) {
                // Update cache with new ID
                const oldEntry = await this.cacheAdapter.getCachedEntry(oldId);
                if (oldEntry) {
                    const updatedEntry = {
                        ...oldEntry,
                        id: newId,
                        title: newTitle,
                        modified_at: new Date().toISOString()
                    };
                    
                    await this.cacheAdapter.cacheEntry(updatedEntry);
                    await this.cacheAdapter.deleteCachedEntry(oldId);
                    await this.updateMetadataFromEntry(updatedEntry);
                }
            }
            
            return newId;
        }
    }


    async entryExists(id: string): Promise<boolean> {
        if (this.environment === 'tauri' && this.tauriAdapter) {
            try {
                const entry = await this.tauriAdapter.getEntryFromFS(id);
                return entry !== null;
            } catch (error) {
                return false;
            }
        } else {
            const entry = await this.cacheAdapter.getCachedEntry(id);
            return entry !== null;
        }
    }

    async clearCacheAndRefresh(): Promise<void> {
        await this.cacheAdapter.clearCache();
        console.log('Cache cleared - next load will fetch fresh data from filesystem');
    }

    // Web-specific methods
    private async createEntryInWeb(title: string): Promise<string> {
        if (!this.webAdapter) {
            throw new Error('Web adapter not initialized');
        }

        const id = await this.webAdapter.createEntryInWeb(title);
        const entry = this.webAdapter.createNewEntry(title, id);

        await this.cacheAdapter.cacheEntry(entry);
        await this.updateMetadataFromEntry(entry);
        return id;
    }

    private async saveEntryInWeb(id: string, content: string): Promise<boolean> {
        if (!this.webAdapter) {
            throw new Error('Web adapter not initialized');
        }

        try {
            const entry = await this.cacheAdapter.getCachedEntry(id);
            if (!entry) return false;

            const updatedEntry = this.webAdapter.updateEntry(entry, content);

            await this.cacheAdapter.cacheEntry(updatedEntry);
            await this.updateMetadataFromEntry(updatedEntry);
            return true;
        } catch (error) {
            console.error('Failed to save entry in web mode:', error);
            return false;
        }
    }

    private async deleteEntryInWeb(id: string): Promise<boolean> {
        try {
            await this.cacheAdapter.deleteCachedEntry(id);
            return true;
        } catch (error) {
            console.error('Failed to delete entry in web mode:', error);
            return false;
        }
    }

    private async createDefaultEntriesForWeb(): Promise<void> {
        if (!this.webAdapter) {
            throw new Error('Web adapter not initialized');
        }

        const existingEntries = await this.cacheAdapter.getCachedEntries();
        
        // Only create default entries if none exist
        if (existingEntries.length === 0) {
            const defaultEntries = this.webAdapter.getDefaultEntries();

            for (const entry of defaultEntries) {
                await this.cacheAdapter.cacheEntry(entry);
                await this.updateMetadataFromEntry(entry);
            }
        }
    }

    private async updateMetadataFromEntry(entry: JournalEntry): Promise<void> {
        // Check if we have a cached password and existing decrypted metadata
        const hasPassword = passwordStore.hasCachedPassword(entry.id);
        const existingMetadata = await this.cacheAdapter.getMetadata(entry.id);
        
        // If we have a password and existing metadata with non-encrypted preview, preserve it
        // BUT only if the new content is also encrypted (don't preserve when content becomes encrypted)
        if (hasPassword && existingMetadata && 
            !existingMetadata.preview.includes('encrypted and requires a password') && 
            !existingMetadata.preview.includes('encrypted') &&
            isEncrypted(entry.content)) {
            
            // Only update the timestamps, preserve decrypted title and preview
            const preservedMetadata: JournalEntryMetadata = {
                ...existingMetadata,
                modified_at: entry.modified_at,
                file_path: entry.file_path
            };
            
            await this.cacheAdapter.updateMetadata(preservedMetadata);
            metadataStore.updateEntryMetadata(entry.id, preservedMetadata);
            console.log('Preserved decrypted metadata for entry:', entry.id);
            return;
        }
        
        // Generate new metadata from encrypted content
        const preview = PreviewService.createPreview(entry.content);
        const displayTitle = TitleService.createFallbackTitle(entry);
        
        const metadata: JournalEntryMetadata = {
            id: entry.id,
            title: displayTitle,
            created_at: entry.created_at,
            modified_at: entry.modified_at,
            file_path: entry.file_path,
            preview
        };

        await this.cacheAdapter.updateMetadata(metadata);
        metadataStore.updateEntryMetadata(entry.id, metadata);
    }

    // Method to update metadata for decrypted entries with proper previews
    async updateDecryptedTitle(entryId: string, decryptedContent: string): Promise<void> {
        try {
            const metadata = await this.cacheAdapter.getMetadata(entryId);
            if (!metadata) {
                console.log('No metadata found for entry:', entryId);
                return;
            }

            // Generate preview from decrypted content
            const preview = PreviewService.createPreview(decryptedContent);
            console.log('Generated new preview for unlocked entry:', entryId, preview.substring(0, 50) + '...');
            
            // Create a temporary entry object for title extraction
            const tempEntry: JournalEntry = {
                id: entryId,
                title: metadata.title, // Use existing title initially
                content: decryptedContent,
                created_at: metadata.created_at,
                modified_at: metadata.modified_at,
                file_path: metadata.file_path
            };
            const displayTitle = TitleService.createFallbackTitle(tempEntry);

            // Update metadata with decrypted preview and title
            const updatedMetadata: JournalEntryMetadata = {
                ...metadata,
                title: displayTitle,
                preview
            };

            await this.cacheAdapter.updateMetadata(updatedMetadata);
            
            // Notify metadata store of the update
            metadataStore.updateEntryMetadata(entryId, updatedMetadata);
            
            console.log('Updated metadata for unlocked entry:', entryId);
        } catch (error) {
            console.error('Failed to update decrypted metadata:', error);
        }
    }

    async cleanup(): Promise<void> {
        await this.cacheAdapter.close();
        
        // Stop file watching if active
        if (this.environment === 'tauri' && this.tauriAdapter) {
            this.tauriAdapter.stopWatching();
        }
    }

    /**
     * Start watching for file changes (Tauri only)
     */
    async startFileWatching(onChange: (changedFiles?: string[], eventType?: string) => void): Promise<void> {
        if (this.environment === 'tauri' && this.tauriAdapter) {
            await this.tauriAdapter.startWatching(onChange);
        }
    }

    /**
     * Stop watching for file changes (Tauri only)
     */
    stopFileWatching(): void {
        if (this.environment === 'tauri' && this.tauriAdapter) {
            this.tauriAdapter.stopWatching();
        }
    }
}