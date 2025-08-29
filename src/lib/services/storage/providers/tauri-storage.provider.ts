/**
 * Tauri Storage Provider
 * 
 * Handles journal entry storage operations for Tauri desktop environment
 * using the filesystem API for persistence.
 */

import { 
	readTextFile, 
	writeTextFile, 
	exists, 
	remove, 
	BaseDirectory 
} from '@tauri-apps/plugin-fs';
import type { StorageProvider } from './storage-provider.interface.js';
import type { JournalEntry, JournalEntryMetadata } from '../../../storage/types.js';
import { PreviewService } from '../../../storage/preview.service.js';
import { 
	STORAGE_CONFIG,
	generateUniqueFilename,
	createTitleFromId,
	getEntryFilePath,
	fileExistsByFilename
} from '../utils/index.js';

/**
 * Storage provider implementation for Tauri filesystem operations
 */
export class TauriStorageProvider implements StorageProvider {
	/**
	 * Initialize the Tauri storage provider
	 * 
	 * Ensures the journal directory exists in the filesystem.
	 */
	async initialize(): Promise<void> {
		await this.ensureDirectoryExists();
	}

	/**
	 * Get a journal entry by ID from the filesystem
	 * 
	 * @param id - Entry identifier
	 * @returns Promise resolving to entry or null if not found
	 */
	async getEntry(id: string): Promise<JournalEntry | null> {
		const filePath = getEntryFilePath(id);
		if (!(await exists(filePath, { baseDir: STORAGE_CONFIG.baseDir }))) {
			return null;
		}
		const content = await readTextFile(filePath, { baseDir: STORAGE_CONFIG.baseDir });
		const title = createTitleFromId(id);
		const now = new Date().toISOString();
		return { id, title, content, created_at: now, modified_at: now, file_path: filePath };
	}

	/**
	 * Save a journal entry to the filesystem
	 * 
	 * @param id - Entry identifier
	 * @param content - Entry content to save
	 * @returns Promise resolving to true if save was successful
	 */
	async saveEntry(id: string, content: string): Promise<boolean> {
		await this.ensureDirectoryExists();
		const filePath = getEntryFilePath(id);
		await writeTextFile(filePath, content, { baseDir: STORAGE_CONFIG.baseDir });
		return true;
	}

	/**
	 * Create a new journal entry in the filesystem
	 * 
	 * @param title - Entry title
	 * @returns Promise resolving to new entry ID or null if creation failed
	 */
	async createEntry(title: string): Promise<string | null> {
		await this.ensureDirectoryExists();
		const filename = await generateUniqueFilename(title, fileExistsByFilename);
		const content = '';
		const filePath = getEntryFilePath(filename);
		await writeTextFile(filePath, content, { baseDir: STORAGE_CONFIG.baseDir });
		return filename;
	}

	/**
	 * Delete a journal entry from the filesystem
	 * 
	 * @param id - Entry identifier
	 * @returns Promise resolving to true if deletion was successful
	 */
	async deleteEntry(id: string): Promise<boolean> {
		const filePath = getEntryFilePath(id);
		if (await exists(filePath, { baseDir: STORAGE_CONFIG.baseDir })) {
			await remove(filePath, { baseDir: STORAGE_CONFIG.baseDir });
		}
		return true;
	}

	/**
	 * Get all entry metadata (not implemented for Tauri - handled by main service)
	 * 
	 * @returns Promise resolving to empty array (metadata handled by main service)
	 */
	async getAllEntryMetadata(): Promise<JournalEntryMetadata[]> {
		// This is handled by the main service through file watching and caching
		// The Tauri provider focuses on individual file operations
		return [];
	}

	/**
	 * Get entry metadata by ID from the filesystem
	 * 
	 * @param id - Entry identifier
	 * @returns Promise resolving to metadata or null if not found
	 */
	async getEntryMetadata(id: string): Promise<JournalEntryMetadata | null> {
		const filePath = getEntryFilePath(id);
		if (!(await exists(filePath, { baseDir: STORAGE_CONFIG.baseDir }))) {
			return null;
		}
		const content = await readTextFile(filePath, { baseDir: STORAGE_CONFIG.baseDir });
		const title = createTitleFromId(id);
		const preview = PreviewService.createPreview(content);
		const now = new Date().toISOString();
		
		return { 
			id, 
			title, 
			created_at: now, 
			modified_at: now, 
			file_path: filePath, 
			preview,
			isPublished: undefined // Publish status handled by main service
		};
	}

	/**
	 * Check if an entry exists in the filesystem
	 * 
	 * @param id - Entry identifier
	 * @returns Promise resolving to true if entry exists
	 */
	async entryExists(id: string): Promise<boolean> {
		const filePath = getEntryFilePath(id);
		return await exists(filePath, { baseDir: STORAGE_CONFIG.baseDir });
	}

	/**
	 * Rename entry in the filesystem
	 * 
	 * @param oldId - Current entry ID
	 * @param newTitle - New title
	 * @returns Promise resolving to new entry ID or null if failed
	 */
	async renameEntry(oldId: string, newTitle: string): Promise<string | null> {
		const oldFilePath = getEntryFilePath(oldId);
		if (!(await exists(oldFilePath, { baseDir: STORAGE_CONFIG.baseDir }))) {
			return null;
		}
		const newId = await generateUniqueFilename(newTitle, fileExistsByFilename);
		const newFilePath = getEntryFilePath(newId);
		const content = await readTextFile(oldFilePath, { baseDir: STORAGE_CONFIG.baseDir });
		await writeTextFile(newFilePath, content, { baseDir: STORAGE_CONFIG.baseDir });
		await remove(oldFilePath, { baseDir: STORAGE_CONFIG.baseDir });
		return newId;
	}

	/**
	 * Ensure the journal directory exists in the filesystem
	 * 
	 * @private
	 */
	private async ensureDirectoryExists(): Promise<void> {
		// The mkdir function from Tauri plugin-fs will create the directory and parents when recursive is true
		const { mkdir } = await import('@tauri-apps/plugin-fs');
		try {
			await mkdir(STORAGE_CONFIG.journalFolder, { 
				baseDir: STORAGE_CONFIG.baseDir,
				recursive: true 
			});
		} catch (error) {
			if (!(error as any)?.message?.includes?.('File exists')) {
				console.warn('Failed to create journal directory:', error);
			}
		}
	}
}
