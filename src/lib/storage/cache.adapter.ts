/**
 * IndexedDB cache storage adapter
 */

import { openDB, type IDBPDatabase } from 'idb';
import { isEncrypted } from '../utils/crypto.js';
import type { JournalEntry, JournalEntryMetadata, ICacheStorage, DBSchema } from './types.js';

export class CacheStorageAdapter implements ICacheStorage {
    private db: IDBPDatabase<DBSchema> | null = null;
    private readonly dbName = 'diaryx-journal';
    private readonly dbVersion = 1;

    async initDB(): Promise<IDBPDatabase<DBSchema>> {
        if (!this.db) {
            this.db = await openDB<DBSchema>(this.dbName, this.dbVersion, {
                upgrade(db) {
                    // Create entries store
                    const entriesStore = db.createObjectStore('entries', { keyPath: 'id' });
                    entriesStore.createIndex('by-date', 'modified_at');

                    // Create metadata store for quick listing
                    const metadataStore = db.createObjectStore('metadata', { keyPath: 'id' });
                    metadataStore.createIndex('by-date', 'modified_at');
                }
            });
        }
        return this.db;
    }

    async cacheEntries(entries: JournalEntryMetadata[]): Promise<void> {
        const db = await this.initDB();
        
        // Get existing cached entries to preserve manually updated titles (separate transaction)
        const existingEntries = await db.getAll('metadata');
        const existingMap = new Map(existingEntries.map(e => [e.id, e]));
        
        // Now create write transaction
        const tx = db.transaction('metadata', 'readwrite');
        
        // Clear existing metadata
        await tx.store.clear();
        
        // Add new metadata, preserving decrypted titles and previews
        for (const entry of entries) {
            const existing = existingMap.get(entry.id);
            let finalEntry = entry;
            
            // If we have a cached entry and the new entry appears encrypted
            if (existing && isEncrypted(entry.preview || '')) {
                let preserveTitle = false;
                let preservePreview = false;
                
                // Preserve the cached title if it looks like a proper decrypted title
                if (existing.title !== entry.title && 
                    !existing.title.match(/^[A-Za-z0-9+/=]{20,}/) && 
                    !existing.title.startsWith('🔒')) {
                    preserveTitle = true;
                }
                
                // Preserve the cached preview if it looks like decrypted content
                // (i.e., it's not the standard encrypted preview text)
                if (existing.preview !== entry.preview && 
                    !existing.preview.includes('🔒') &&
                    !existing.preview.includes('encrypted') &&
                    existing.preview.length > 10) {
                    preservePreview = true;
                }
                
                if (preserveTitle || preservePreview) {
                    finalEntry = { 
                        ...entry, 
                        ...(preserveTitle && { title: existing.title }),
                        ...(preservePreview && { preview: existing.preview })
                    };
                }
            }
            
            await tx.store.add(finalEntry);
        }
        
        await tx.done;
    }

    async getCachedEntries(): Promise<JournalEntryMetadata[]> {
        const db = await this.initDB();
        const index = db.transaction('metadata').store.index('by-date');
        return (await index.getAll()).reverse(); // Newest first
    }

    async cacheEntry(entry: JournalEntry): Promise<void> {
        const db = await this.initDB();
        const tx = db.transaction('entries', 'readwrite');
        await tx.store.put(entry);
        await tx.done;
    }

    async getCachedEntry(id: string): Promise<JournalEntry | null> {
        const db = await this.initDB();
        return (await db.get('entries', id)) || null;
    }

    async deleteCachedEntry(id: string): Promise<void> {
        const db = await this.initDB();
        const tx = db.transaction(['entries', 'metadata'], 'readwrite');
        await tx.objectStore('entries').delete(id);
        await tx.objectStore('metadata').delete(id);
        await tx.done;
    }

    async clearCache(): Promise<void> {
        const db = await this.initDB();
        const tx = db.transaction(['entries', 'metadata'], 'readwrite');
        await tx.objectStore('entries').clear();
        await tx.objectStore('metadata').clear();
        await tx.done;
    }

    async updateMetadata(metadata: JournalEntryMetadata): Promise<void> {
        const db = await this.initDB();
        const tx = db.transaction('metadata', 'readwrite');
        await tx.store.put(metadata);
        await tx.done;
    }

    async getMetadata(id: string): Promise<JournalEntryMetadata | null> {
        const db = await this.initDB();
        return (await db.get('metadata', id)) || null;
    }

    async close(): Promise<void> {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}