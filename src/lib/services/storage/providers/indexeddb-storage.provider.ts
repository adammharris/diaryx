/**
 * IndexedDB Storage Provider
 * 
 * Handles journal entry storage operations for web environment using 
 * IndexedDB for persistence and caching.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { StorageProvider } from './storage-provider.interface.js';
import type { JournalEntry, JournalEntryMetadata, DBSchema } from '../../../storage/types.js';
import { PreviewService } from '../../../storage/preview.service.js';
import { metadataStore } from '../../../stores/metadata';
import { 
	STORAGE_CONFIG,
	titleToSafeFilename,
	createDefaultWebEntries
} from '../utils/index.js';

/**
 * Storage provider implementation for IndexedDB operations
 */
export class IndexedDBStorageProvider implements StorageProvider {
	private db: IDBPDatabase<DBSchema> | null = null;

	/**
	 * Initialize the IndexedDB storage provider
	 * 
	 * Creates or upgrades the IndexedDB schema and sets up default entries
	 * for new web installations.
	 */
	async initialize(): Promise<void> {
		await this.initDB();
		await this.createDefaultEntriesIfEmpty();
	}

	/**
	 * Get a journal entry by ID from IndexedDB
	 * 
	 * @param id - Entry identifier
	 * @returns Promise resolving to entry or null if not found
	 */
	async getEntry(id: string): Promise<JournalEntry | null> {
		const db = await this.initDB();
		return (await db.get('entries', id)) || null;
	}

	/**
	 * Save a journal entry to IndexedDB
	 * 
	 * @param id - Entry identifier
	 * @param content - Entry content to save
	 * @returns Promise resolving to true if save was successful
	 */
	async saveEntry(id: string, content: string): Promise<boolean> {
		const entry = await this.getEntry(id);
		if (!entry) return false;
		
		const updatedEntry = { 
			...entry, 
			content, 
			modified_at: new Date().toISOString() 
		};
		
		await this.cacheEntry(updatedEntry);
		await this.updateMetadataFromEntry(updatedEntry);
		return true;
	}

	/**
	 * Create a new journal entry in IndexedDB
	 * 
	 * @param title - Entry title
	 * @returns Promise resolving to new entry ID or null if creation failed
	 */
	async createEntry(title: string): Promise<string | null> {
		const id = titleToSafeFilename(title);
		const now = new Date().toISOString();
		const entry: JournalEntry = {
			id,
			title,
			content: '',
			created_at: now,
			modified_at: now,
			file_path: `web-entry-${id}.md`
		};
		
		await this.cacheEntry(entry);
		await this.updateMetadataFromEntry(entry);
		return id;
	}

	/**
	 * Delete a journal entry from IndexedDB
	 * 
	 * @param id - Entry identifier
	 * @returns Promise resolving to true if deletion was successful
	 */
	async deleteEntry(id: string): Promise<boolean> {
		const db = await this.initDB();
		const tx = db.transaction(['entries', 'metadata', 'cloudMappings'], 'readwrite');
		
		// Delete from all relevant stores
		await tx.objectStore('entries').delete(id);
		await tx.objectStore('metadata').delete(id);
		await tx.objectStore('cloudMappings').delete(id);
		await tx.done;
		
		// Update the metadata store to remove the entry from UI
		metadataStore.removeEntryMetadata(id);
		
		console.log('Cleaned up all cached data for entry:', id);
		return true;
	}

	/**
	 * Get all entry metadata from IndexedDB
	 * 
	 * @returns Promise resolving to array of entry metadata sorted by date
	 */
	async getAllEntryMetadata(): Promise<JournalEntryMetadata[]> {
		const db = await this.initDB();
		const index = db.transaction('metadata').store.index('by-date');
		return (await index.getAll()).reverse(); // Most recent first
	}

	/**
	 * Get entry metadata by ID from IndexedDB
	 * 
	 * @param id - Entry identifier
	 * @returns Promise resolving to metadata or null if not found
	 */
	async getEntryMetadata(id: string): Promise<JournalEntryMetadata | null> {
		const db = await this.initDB();
		return (await db.get('metadata', id)) || null;
	}

	/**
	 * Check if an entry exists in IndexedDB
	 * 
	 * @param id - Entry identifier
	 * @returns Promise resolving to true if entry exists
	 */
	async entryExists(id: string): Promise<boolean> {
		const entry = await this.getEntry(id);
		return entry !== null;
	}

	/**
	 * Initialize IndexedDB database for caching and web storage
	 * 
	 * Creates or upgrades the IndexedDB schema for storing entries,
	 * metadata, and cloud mappings.
	 * 
	 * @private
	 * @returns Promise resolving to the initialized database instance
	 */
	private async initDB(): Promise<IDBPDatabase<DBSchema>> {
		if (!this.db) {
			this.db = await openDB<DBSchema>(STORAGE_CONFIG.dbName, STORAGE_CONFIG.dbVersion, {
				upgrade(db) {
					if (!db.objectStoreNames.contains('entries')) {
						db.createObjectStore('entries', { keyPath: 'id' });
					}
					if (!db.objectStoreNames.contains('metadata')) {
						const metadataStore = db.createObjectStore('metadata', { keyPath: 'id' });
						metadataStore.createIndex('by-date', 'modified_at');
					}
					if (!db.objectStoreNames.contains('cloudMappings')) {
						db.createObjectStore('cloudMappings', { keyPath: 'localId' });
					}
				},
			});
		}
		return this.db;
	}

	/**
	 * Cache a journal entry in IndexedDB
	 * 
	 * @private
	 * @param entry - Entry to cache
	 */
	private async cacheEntry(entry: JournalEntry): Promise<void> {
		const db = await this.initDB();
		await db.put('entries', entry);
	}

	/**
	 * Update metadata from entry and store in IndexedDB
	 * 
	 * @private
	 * @param entry - Entry to extract metadata from
	 */
	private async updateMetadataFromEntry(entry: JournalEntry): Promise<void> {
		const metadata: JournalEntryMetadata = {
			id: entry.id,
			title: entry.title,
			created_at: entry.created_at,
			modified_at: entry.modified_at,
			file_path: entry.file_path,
			preview: PreviewService.createPreview(entry.content),
			isPublished: undefined // Publish status handled by main service
		};
		
		const db = await this.initDB();
		const tx = db.transaction('metadata', 'readwrite');
		await tx.objectStore('metadata').put(metadata);
		await tx.done;
		
		// Update the reactive store
		metadataStore.updateEntryMetadata(entry.id, metadata);
	}

	/**
	 * Create default entries for new web installations
	 * 
	 * @private
	 */
	private async createDefaultEntriesIfEmpty(): Promise<void> {
		const db = await this.initDB();
		const tx = db.transaction('entries', 'readonly');
		const count = await tx.store.count();
		await tx.done;

		if (count === 0) {
			const defaultEntries = createDefaultWebEntries();
			for (const entry of defaultEntries) {
				await this.cacheEntry(entry);
				await this.updateMetadataFromEntry(entry);
			}
			console.log('Created default entries for web environment');
		}
	}

	/**
	 * Update metadata for decrypted entries with proper previews
	 * 
	 * @param entryId - Entry identifier
	 * @param decryptedContent - Decrypted entry content
	 */
	async updateDecryptedTitle(entryId: string, decryptedContent: string): Promise<void> {
		try {
			const db = await this.initDB();
			const metadata = await db.get('metadata', entryId);
			if (!metadata) {
				console.log('No metadata found for entry:', entryId);
				return;
			}

			// Update the metadata with proper title and preview from decrypted content
			const lines = decryptedContent.split('\n');
			const firstLine = lines[0]?.trim() || '';
			
			// Extract title from first line if it starts with #
			const newTitle = firstLine.startsWith('#') 
				? firstLine.replace(/^#+\s*/, '').trim() || 'Untitled'
				: firstLine || 'Untitled';

			const updatedMetadata: JournalEntryMetadata = {
				...metadata,
				title: newTitle,
				preview: PreviewService.createPreview(decryptedContent),
				modified_at: new Date().toISOString()
			};

			// Update in database
			const tx = db.transaction('metadata', 'readwrite');
			await tx.objectStore('metadata').put(updatedMetadata);
			await tx.done;

			// Update reactive store
			metadataStore.updateEntryMetadata(entryId, updatedMetadata);
			
			console.log('Updated decrypted metadata for entry:', entryId, 'New title:', newTitle);
		} catch (error) {
			console.error('Failed to update decrypted metadata:', error);
		}
	}
}
