import { invoke } from '@tauri-apps/api/core';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface JournalEntry {
    id: string;
    title: string;
    content: string;
    created_at: string;
    modified_at: string;
    file_path: string;
}

export interface JournalEntryMetadata {
    id: string;
    title: string;
    created_at: string;
    modified_at: string;
    file_path: string;
    preview: string;
}

interface JournalDB extends DBSchema {
    entries: {
        key: string;
        value: JournalEntry;
        indexes: { 'by-date': string };
    };
    metadata: {
        key: string;
        value: JournalEntryMetadata;
        indexes: { 'by-date': string };
    };
}

class StorageAdapter {
    private db: IDBPDatabase<JournalDB> | null = null;
    private isTauri: boolean = false;

    constructor() {
        // Detect if we're running in Tauri
        this.isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
    }

    async initDB() {
        if (!this.db) {
            this.db = await openDB<JournalDB>('diaryx-journal', 1, {
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

    // Tauri filesystem operations (only work in Tauri)
    async getEntriesFromFS(): Promise<JournalEntryMetadata[]> {
        if (!this.isTauri) return [];
        
        try {
            return await invoke<JournalEntryMetadata[]>('get_journal_entries');
        } catch (error) {
            console.error('Failed to get entries from filesystem:', error);
            return [];
        }
    }

    async getEntryFromFS(id: string): Promise<JournalEntry | null> {
        if (!this.isTauri) return null;
        
        try {
            return await invoke<JournalEntry>('get_journal_entry', { id });
        } catch (error) {
            console.error('Failed to get entry from filesystem:', error);
            return null;
        }
    }

    async saveEntryToFS(id: string, content: string): Promise<boolean> {
        if (!this.isTauri) return false;
        
        try {
            await invoke('save_journal_entry', { id, content });
            return true;
        } catch (error) {
            console.error('Failed to save entry to filesystem:', error);
            return false;
        }
    }

    async createEntryInFS(title: string): Promise<string | null> {
        if (!this.isTauri) return null;
        
        try {
            return await invoke<string>('create_journal_entry', { title });
        } catch (error) {
            console.error('Failed to create entry in filesystem:', error);
            return null;
        }
    }

    async deleteEntryFromFS(id: string): Promise<boolean> {
        if (!this.isTauri) return false;
        
        try {
            await invoke('delete_journal_entry', { id });
            return true;
        } catch (error) {
            console.error('Failed to delete entry from filesystem:', error);
            return false;
        }
    }

    // IndexedDB operations for offline caching
    async cacheEntries(entries: JournalEntryMetadata[]): Promise<void> {
        const db = await this.initDB();
        const tx = db.transaction('metadata', 'readwrite');
        
        // Clear existing metadata
        await tx.store.clear();
        
        // Add new metadata
        for (const entry of entries) {
            await tx.store.add(entry);
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

    // Web-only operations (when not in Tauri)
    async createEntryInWeb(title: string): Promise<string> {
        const now = new Date();
        const id = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        
        const entry: JournalEntry = {
            id,
            title,
            content: `# ${title}\n\n`,
            created_at: now.toISOString(),
            modified_at: now.toISOString(),
            file_path: `web-entry-${id}.md`
        };

        await this.cacheEntry(entry);
        await this.updateMetadataFromEntry(entry);
        return id;
    }

    async saveEntryInWeb(id: string, content: string): Promise<boolean> {
        try {
            const entry = await this.getCachedEntry(id);
            if (!entry) return false;

            const updatedEntry: JournalEntry = {
                ...entry,
                content,
                modified_at: new Date().toISOString(),
                // Update title from first line if it's a heading
                title: this.extractTitleFromContent(content) || entry.title
            };

            await this.cacheEntry(updatedEntry);
            await this.updateMetadataFromEntry(updatedEntry);
            return true;
        } catch (error) {
            console.error('Failed to save entry in web mode:', error);
            return false;
        }
    }

    async deleteEntryInWeb(id: string): Promise<boolean> {
        try {
            await this.deleteCachedEntry(id);
            return true;
        } catch (error) {
            console.error('Failed to delete entry in web mode:', error);
            return false;
        }
    }

    async createDefaultEntriesForWeb(): Promise<void> {
        const existingEntries = await this.getCachedEntries();
        
        // Only create default entries if none exist
        if (existingEntries.length === 0) {
            const welcomeEntry: JournalEntry = {
                id: '2025-01-01_welcome',
                title: 'Welcome to Diaryx!',
                content: `# Welcome to Diaryx!

Welcome to your personal journal! This is a demo entry to show you how the app works.

## Features in Web Mode:

- ✅ **Create and edit entries** - Click the + button or type a title above
- ✅ **Markdown support** - Use # for headings, **bold**, *italic*, and more
- ✅ **Search functionality** - Find your entries quickly
- ✅ **Beautiful themes** - Click the ⚙️ settings button to try different colors
- ✅ **Local storage** - Your entries are saved in your browser's IndexedDB
- ✅ **Preview mode** - Toggle between edit and preview when writing

## Try it out:

1. Create a new entry by typing a title above
2. Click on this entry to edit it
3. Try the different color themes in settings
4. Search for entries using the search box

Your entries will persist between browser sessions, so feel free to use this as your actual journal!

Happy writing! 📝`,
                created_at: '2025-01-01T10:00:00.000Z',
                modified_at: '2025-01-01T10:00:00.000Z',
                file_path: 'web-entry-welcome.md'
            };

            const demoEntry: JournalEntry = {
                id: '2025-01-02_demo-features',
                title: 'Demo: Markdown Features',
                content: `# Demo: Markdown Features

This entry demonstrates various markdown features you can use in your journal.

## Headers

You can use different levels of headers:

### Level 3 Header
#### Level 4 Header

## Text Formatting

**Bold text** and *italic text* make your entries more expressive.

You can also use ~~strikethrough~~ and \`inline code\`.

## Lists

### Unordered Lists:
- Morning coffee ☕
- Writing in journal
- Planning the day
- Exercise routine

### Ordered Lists:
1. Wake up early
2. Meditation
3. Journal writing
4. Breakfast

## Quotes

> "The journal is a vehicle for my sense of selfhood. It represents me as emotionally and spiritually independent."
> 
> — Anaïs Nin

## Code Blocks

\`\`\`javascript
function writeJournal(thoughts) {
    return \`Today I think: \${thoughts}\`;
}
\`\`\`

## Links and More

You can also add links: [Markdown Guide](https://www.markdownguide.org/)

Try editing this entry to experiment with markdown!`,
                created_at: '2025-01-02T14:30:00.000Z',
                modified_at: '2025-01-02T14:30:00.000Z',
                file_path: 'web-entry-demo.md'
            };

            // Add the entries
            await this.cacheEntry(welcomeEntry);
            await this.updateMetadataFromEntry(welcomeEntry);
            await this.cacheEntry(demoEntry);
            await this.updateMetadataFromEntry(demoEntry);
        }
    }

    // Helper methods
    private extractTitleFromContent(content: string): string | null {
        const firstLine = content.split('\n')[0];
        if (firstLine.startsWith('#')) {
            return firstLine.replace(/^#+\s*/, '').trim();
        }
        return null;
    }

    private async updateMetadataFromEntry(entry: JournalEntry): Promise<void> {
        const preview = this.createPreview(entry.content);
        const metadata: JournalEntryMetadata = {
            id: entry.id,
            title: entry.title,
            created_at: entry.created_at,
            modified_at: entry.modified_at,
            file_path: entry.file_path,
            preview
        };

        const db = await this.initDB();
        const tx = db.transaction('metadata', 'readwrite');
        await tx.store.put(metadata);
        await tx.done;
    }

    private createPreview(content: string): string {
        // Remove title line and create preview
        const contentWithoutTitle = content.split('\n').slice(1).join('\n').trim();
        const preview = contentWithoutTitle.replace(/[#*_`]/g, '').substring(0, 150);
        return preview + (contentWithoutTitle.length > 150 ? '...' : '');
    }

    // Combined operations (filesystem + cache in Tauri, web-only in browser)
    async getAllEntries(): Promise<JournalEntryMetadata[]> {
        if (this.isTauri) {
            try {
                // Try to get from filesystem first
                const entries = await this.getEntriesFromFS();
                
                // Cache the results
                if (entries.length > 0) {
                    await this.cacheEntries(entries);
                }
                
                return entries;
            } catch (error) {
                console.error('Failed to get entries from filesystem, trying cache:', error);
                // Fallback to cache
                return await this.getCachedEntries();
            }
        } else {
            // Web mode - use IndexedDB and create default entries if needed
            await this.createDefaultEntriesForWeb();
            return await this.getCachedEntries();
        }
    }

    async getEntry(id: string): Promise<JournalEntry | null> {
        if (this.isTauri) {
            try {
                // Try filesystem first
                const entry = await this.getEntryFromFS(id);
                
                // Cache the result
                if (entry) {
                    await this.cacheEntry(entry);
                }
                
                return entry;
            } catch (error) {
                console.error('Failed to get entry from filesystem, trying cache:', error);
                // Fallback to cache
                return await this.getCachedEntry(id);
            }
        } else {
            // Web mode - only use IndexedDB
            return await this.getCachedEntry(id);
        }
    }

    async saveEntry(id: string, content: string): Promise<boolean> {
        if (this.isTauri) {
            const success = await this.saveEntryToFS(id, content);
            
            if (success) {
                // Update cache
                const entry = await this.getEntryFromFS(id);
                if (entry) {
                    await this.cacheEntry(entry);
                }
            }
            
            return success;
        } else {
            // Web mode - save to IndexedDB
            return await this.saveEntryInWeb(id, content);
        }
    }

    async createEntry(title: string): Promise<string | null> {
        if (this.isTauri) {
            return await this.createEntryInFS(title);
        } else {
            // Web mode - create in IndexedDB
            return await this.createEntryInWeb(title);
        }
    }

    async deleteEntry(id: string): Promise<boolean> {
        if (this.isTauri) {
            const success = await this.deleteEntryFromFS(id);
            
            if (success) {
                await this.deleteCachedEntry(id);
            }
            
            return success;
        } else {
            // Web mode - delete from IndexedDB
            return await this.deleteEntryInWeb(id);
        }
    }
}

export const storage = new StorageAdapter();
