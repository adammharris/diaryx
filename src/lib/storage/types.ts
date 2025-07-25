/**
 * Core storage types and interfaces for Diaryx
 */

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
    isPublished?: boolean; // Cloud publish status - cached for performance
    isShared?: boolean; // Whether this is a shared entry from another user
    cloudId?: string; // Cloud ID for shared entries
}

export interface StorageResult<T> {
    success: boolean;
    data?: T;
    error?: Error;
}

export interface IStorageAdapter {
    getAllEntries(): Promise<JournalEntryMetadata[]>;
    getEntry(id: string): Promise<JournalEntry | null>;
    saveEntry(id: string, content: string): Promise<boolean>;
    createEntry(title: string): Promise<string | null>;
    deleteEntry(id: string): Promise<boolean>;
    renameEntry(oldId: string, newTitle: string): Promise<string | null>;
    updateDecryptedTitle(id: string, decryptedContent: string): Promise<void>;
    entryExists(id: string): Promise<boolean>;
    clearCacheAndRefresh(): Promise<void>;
}

export interface ICacheStorage {
    cacheEntries(entries: JournalEntryMetadata[]): Promise<void>;
    getCachedEntries(): Promise<JournalEntryMetadata[]>;
    cacheEntry(entry: JournalEntry): Promise<void>;
    getCachedEntry(id: string): Promise<JournalEntry | null>;
    deleteCachedEntry(id: string): Promise<void>;
    clearCache(): Promise<void>;
}

export interface IFileSystemStorage {
    getEntriesFromFS(): Promise<JournalEntryMetadata[]>;
    getEntryFromFS(id: string): Promise<JournalEntry | null>;
    saveEntryToFS(id: string, content: string): Promise<boolean>;
    createEntryInFS(title: string): Promise<string | null>;
    deleteEntryFromFS(id: string): Promise<boolean>;
    renameEntryInFS(oldId: string, newTitle: string): Promise<string | null>;
}

export interface IWebStorage {
    createEntryInWeb(title: string): Promise<string>;
    saveEntryInWeb(id: string, content: string): Promise<boolean>;
    deleteEntryInWeb(id: string): Promise<boolean>;
    renameEntryInWeb(oldId: string, newTitle: string): Promise<string | null>;
    createDefaultEntriesForWeb(): Promise<void>;
}

export interface CloudEntryMapping {
    localId: string;
    cloudId: string;
    publishedAt: string;
    lastServerTimestamp?: string; // Track server's last known timestamp for conflict detection
}

export interface DBSchema {
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
    cloudMappings: {
        key: string;
        value: CloudEntryMapping;
    };
}

export type StorageEnvironment = 'tauri' | 'web' | 'build';