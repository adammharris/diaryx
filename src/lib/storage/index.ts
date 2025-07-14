/**
 * Main storage module exports
 */

// Types
export type {
    JournalEntry,
    JournalEntryMetadata,
    StorageResult,
    IStorageAdapter,
    StorageEnvironment
} from './types.js';

// Services
export { PreviewService } from './preview.service';
export { TitleService } from './title.service';

// Adapters
export { MainStorageAdapter } from './main.adapter';
export { CacheStorageAdapter } from './cache.adapter';
export { TauriStorageAdapter } from './tauri.adapter';
export { WebStorageAdapter } from './web.adapter';

// Factory
import { MainStorageAdapter } from './main.adapter';

/**
 * Storage factory for creating storage instances
 */
export class StorageFactory {
    private static instance: MainStorageAdapter | null = null;

    /**
     * Creates or returns the singleton storage instance
     */
    static getInstance(): MainStorageAdapter {
        if (!this.instance) {
            this.instance = new MainStorageAdapter();
        }
        return this.instance;
    }

    /**
     * Creates a new storage instance (for testing or special cases)
     */
    static createNew(): MainStorageAdapter {
        return new MainStorageAdapter();
    }

    /**
     * Resets the singleton instance
     */
    static reset(): void {
        if (this.instance) {
            this.instance.cleanup();
            this.instance = null;
        }
    }
}

// Default export - singleton instance
export const storage = StorageFactory.getInstance();