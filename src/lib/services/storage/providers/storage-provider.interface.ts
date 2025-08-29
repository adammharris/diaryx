/**
 * Storage Provider Interface
 * 
 * Defines the contract for storage providers that handle entry persistence
 * across different environments (Tauri filesystem, IndexedDB, etc.).
 */

import type { JournalEntry, JournalEntryMetadata } from '../../../storage/types.js';

/**
 * Interface for storage providers handling local entry operations
 */
export interface StorageProvider {
	/**
	 * Initialize the storage provider
	 * 
	 * @returns Promise that resolves when initialization is complete
	 */
	initialize(): Promise<void>;

	/**
	 * Get a journal entry by ID
	 * 
	 * @param id - Entry identifier
	 * @returns Promise resolving to entry or null if not found
	 */
	getEntry(id: string): Promise<JournalEntry | null>;

	/**
	 * Save a journal entry
	 * 
	 * @param id - Entry identifier
	 * @param content - Entry content to save
	 * @returns Promise resolving to true if save was successful
	 */
	saveEntry(id: string, content: string): Promise<boolean>;

	/**
	 * Create a new journal entry
	 * 
	 * @param title - Entry title
	 * @returns Promise resolving to new entry ID or null if creation failed
	 */
	createEntry(title: string): Promise<string | null>;

	/**
	 * Delete a journal entry
	 * 
	 * @param id - Entry identifier
	 * @returns Promise resolving to true if deletion was successful
	 */
	deleteEntry(id: string): Promise<boolean>;

	/**
	 * Get all entry metadata
	 * 
	 * @returns Promise resolving to array of entry metadata
	 */
	getAllEntryMetadata(): Promise<JournalEntryMetadata[]>;

	/**
	 * Get entry metadata by ID
	 * 
	 * @param id - Entry identifier
	 * @returns Promise resolving to metadata or null if not found
	 */
	getEntryMetadata(id: string): Promise<JournalEntryMetadata | null>;

	/**
	 * Check if an entry exists
	 * 
	 * @param id - Entry identifier
	 * @returns Promise resolving to true if entry exists
	 */
	entryExists(id: string): Promise<boolean>;
}
