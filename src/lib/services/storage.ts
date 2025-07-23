/**
 * Unified storage service for Diaryx
 */

import {
	readTextFile,
	writeTextFile,
	remove,
	exists,
	readDir,
	mkdir,
	watch,
	BaseDirectory
} from '@tauri-apps/plugin-fs';
import { openDB, type IDBPDatabase } from 'idb';
import { detectTauri } from '../utils/tauri';
import type {
	JournalEntry,
	JournalEntryMetadata,
	DBSchema,
	StorageEnvironment,
	CloudEntryMapping
} from '../storage/types';
import { PreviewService } from '../storage/preview.service';
import { TitleService } from '../storage/title.service';
// Removed old crypto and encryption service imports - using E2E encryption system now
import { metadataStore } from '../stores/metadata';
import { apiAuthService } from './api-auth.service';
import { e2eEncryptionService } from './e2e-encryption.service';
import { FrontmatterService } from '../storage/frontmatter.service';
import type { EntryObject } from '../crypto/EntryCryptor';

class StorageService {
	public environment: StorageEnvironment;
	private db: IDBPDatabase<DBSchema> | null = null;
	private readonly dbName = 'diaryx-journal';
	private readonly dbVersion = 2;
	private readonly baseDir = BaseDirectory.Document;
	private readonly fileExtension = '.md';
	private readonly journalFolder = 'Diaryx';
	private fileWatcher: (() => void) | null = null;
	
	// Concurrency control for cloud operations
	private cloudOperationLocks = new Map<string, Promise<any>>();
	private syncInProgress = false;

	constructor() {
		this.environment = this.detectEnvironment();
		if (this.environment === 'web') {
			this.initDB();
		}
		
		// Removed old encryption service callback setup
	}

	public getJournalPath(): string {
		if (this.environment === 'tauri') {
			// In Tauri, the journal folder is relative to the user's documents directory
			// We can't get the absolute path directly here without another Tauri API call
			// For now, return a user-friendly representation
			return `~/Documents/${this.journalFolder}/`;
		} else {
			return 'N/A (Web Browser)';
		}
	}

	private detectEnvironment(): StorageEnvironment {
		if (typeof window === 'undefined' || typeof document === 'undefined') {
			return 'build';
		}
		return detectTauri() ? 'tauri' : 'web';
	}

	private async initDB(): Promise<IDBPDatabase<DBSchema>> {
		if (!this.db) {
			this.db = await openDB<DBSchema>(this.dbName, this.dbVersion, {
				upgrade(db) {
					if (!db.objectStoreNames.contains('entries')) {
						const entriesStore = db.createObjectStore('entries', { keyPath: 'id' });
						entriesStore.createIndex('by-date', 'modified_at');
					}
					if (!db.objectStoreNames.contains('metadata')) {
						const metadataStore = db.createObjectStore('metadata', { keyPath: 'id' });
						metadataStore.createIndex('by-date', 'modified_at');
					}
					if (!db.objectStoreNames.contains('cloudMappings')) {
						db.createObjectStore('cloudMappings', { keyPath: 'localId' });
					}
				}
			});
		}
		return this.db;
	}

	async getAllEntries(): Promise<JournalEntryMetadata[]> {
		if (this.environment === 'build') {
			return [];
		}

		if (this.environment === 'tauri') {
			try {
				const entries = await this.getTauriEntries();
				await this.cacheMetadata(entries);
				metadataStore.setAllEntries(entries);
				return entries;
			} catch (error) {
				console.error('Failed to get entries from filesystem, trying cache:', error);
				const cachedEntries = await this.getCachedMetadata();
				if (cachedEntries.length > 0) {
					console.warn('Using cached entries - data may be stale if files were deleted');
				}
				metadataStore.setAllEntries(cachedEntries);
				return cachedEntries;
			}
		} else {
			await this.createDefaultEntriesForWeb();
			const webEntries = await this.getCachedMetadata();
			metadataStore.setAllEntries(webEntries);
			return webEntries;
		}
	}

	async getEntry(id: string): Promise<JournalEntry | null> {
		if (this.environment === 'build') {
			return null;
		}

		if (this.environment === 'tauri') {
			try {
				const entry = await this.getTauriEntry(id);
				if (entry) {
					await this.cacheEntry(entry);
				}
				return entry;
			} catch (error) {
				console.error(`Failed to get entry ${id} from filesystem, trying cache:`, error);
				return this.getCachedEntry(id);
			}
		} else {
			return this.getCachedEntry(id);
		}
	}

	async saveEntry(id: string, content: string): Promise<boolean> {
		if (this.environment === 'build') {
			return false;
		}

		if (this.environment === 'tauri') {
			const success = await this.saveTauriEntry(id, content);
			if (success) {
				const entry = await this.getTauriEntry(id);
				if (entry) {
					await this.cacheEntry(entry);
					await this.updateMetadataFromEntry(entry);
				}
			}
			return success;
		} else {
			return this.saveWebEntry(id, content);
		}
	}

	async createEntry(title: string): Promise<string | null> {
		if (this.environment === 'build') {
			return null;
		}

		if (this.environment === 'tauri') {
			return this.createTauriEntry(title);
		} else {
			return this.createWebEntry(title);
		}
	}

	async deleteEntry(id: string): Promise<boolean> {
		if (this.environment === 'build') {
			return false;
		}

		// Use cloud-aware deletion that handles both local and cloud cleanup
		return this.deleteEntryWithCloudSync(id);
	}

	/**
	 * Delete an entry with proper cloud synchronization
	 */
	async deleteEntryWithCloudSync(id: string): Promise<boolean> {
		return this.acquireCloudLock(id, async () => {
			try {
				console.log('Starting deletion process for entry:', id);

				// Check if entry is published to cloud
				const cloudId = await this.getCloudId(id);
				let cloudDeleteSuccess = true;

				if (cloudId && apiAuthService.isAuthenticated()) {
					console.log('Entry is published to cloud, deleting from server:', cloudId);
					cloudDeleteSuccess = await this.deleteFromCloud(cloudId);
					
					if (!cloudDeleteSuccess) {
						console.warn('Failed to delete from cloud, but continuing with local deletion');
						// Continue with local deletion even if cloud deletion fails
						// This handles cases where the entry was already deleted from cloud
						// or there are network issues
					} else {
						console.log('Successfully deleted from cloud');
					}
				} else {
					console.log('Entry not published to cloud or user not authenticated');
				}

				// Delete locally regardless of cloud deletion result
				let localDeleteSuccess = false;
				
				if (this.environment === 'tauri') {
					localDeleteSuccess = await this.deleteTauriEntry(id);
					if (localDeleteSuccess) {
						await this.deleteCachedEntry(id);
					}
				} else {
					localDeleteSuccess = await this.deleteWebEntry(id);
				}

				if (!localDeleteSuccess) {
					console.error('Failed to delete entry locally:', id);
					return false;
				}

				// Clean up cloud mapping if it exists
				if (cloudId) {
					await this.removeCloudMapping(id);
					console.log('Cleaned up cloud mapping for deleted entry');
				}

				console.log('Entry deletion completed successfully:', id);
				return true;

			} catch (error) {
				console.error('Failed to delete entry:', id, error);
				return false;
			}
		});
	}

	/**
	 * Delete an entry from the cloud server
	 */
	private async deleteFromCloud(cloudId: string): Promise<boolean> {
		try {
			const apiUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
			const response = await fetch(`${apiUrl}/api/entries/${cloudId}`, {
				method: 'DELETE',
				headers: {
					...apiAuthService.getAuthHeaders()
				}
			});

			if (!response.ok) {
				if (response.status === 404) {
					// Entry doesn't exist in cloud anymore - that's fine
					console.log('Entry already deleted from cloud or never existed');
					return true;
				}
				throw new Error(`Failed to delete from cloud: ${response.status}`);
			}

			const result = await response.json();
			console.log('Cloud deletion response:', result);
			return result.success || true;

		} catch (error) {
			console.error('Error deleting from cloud:', error);
			return false;
		}
	}

	async renameEntry(oldId: string, newTitle: string): Promise<string | null> {
		if (this.environment === 'build') {
			return null;
		}

		if (this.environment === 'tauri') {
			const newId = await this.renameTauriEntry(oldId, newTitle);
			if (newId) {
				const oldEntry = await this.getCachedEntry(oldId);
				if (oldEntry) {
					const updatedEntry = {
						...oldEntry,
						id: newId,
						title: newTitle,
						modified_at: new Date().toISOString()
					};
					await this.cacheEntry(updatedEntry);
					await this.deleteCachedEntry(oldId);
					await this.updateMetadataFromEntry(updatedEntry);
				}
			}
			return newId;
		} else {
			const newId = this.titleToSafeFilename(newTitle);
			const oldEntry = await this.getCachedEntry(oldId);
			if (oldEntry) {
				const updatedEntry = {
					...oldEntry,
					id: newId,
					title: newTitle,
					modified_at: new Date().toISOString()
				};
				await this.cacheEntry(updatedEntry);
				await this.deleteCachedEntry(oldId);
				await this.updateMetadataFromEntry(updatedEntry);
			}
			return newId;
		}
	}

	async startFileWatching(
		onChange: (changedFiles?: string[], eventType?: string) => void
	): Promise<void> {
		if (this.environment === 'tauri' && !this.fileWatcher) {
			console.log('Starting file system watcher for:', this.journalFolder);
			
			this.fileWatcher = await watch(
				[this.journalFolder],
				(event) => {
					console.log('File system event:', event);
					
					// Only process actual file modifications, not access events
					if (!event.type || typeof event.type !== 'object') {
						console.log('Ignoring event - no type info');
						return;
					}
					
					// Filter out access events (reads/opens) - only process writes/creates/deletes
					if ('access' in event.type) {
						console.log('Ignoring access event:', event.type.access);
						return;
					}
					
					// Check if this is a modification/create/remove event
					const hasModify = 'modify' in event.type;
					const hasCreate = 'create' in event.type;
					const hasRemove = 'remove' in event.type;
					
					if (!hasModify && !hasCreate && !hasRemove) {
						console.log('Ignoring non-modification event:', event.type);
						return;
					}
					
					// Extract file paths from the event
					const changedFiles = event.paths || [];
					// Extract event type (metadata or data)
					let eventType = 'unknown';
					if (hasModify) {
						// Safe access to modify property
						if ('modify' in event.type) {
							const modify = event.type.modify as any;
							eventType = modify?.kind || 'modify';
						} else {
							eventType = 'modify';
						}
					} else if (hasCreate) {
						eventType = 'create';
					} else if (hasRemove) {
						eventType = 'remove';
					}
					
					console.log('Processing file change event:', eventType, changedFiles);
					onChange(changedFiles, eventType);
				},
				{
					baseDir: this.baseDir,
					delayMs: 500
				}
			);
			
			console.log('File system watcher started successfully');
		}
	}

	stopFileWatching(): void {
		if (this.fileWatcher) {
			this.fileWatcher();
			this.fileWatcher = null;
		}
	}

	// Tauri-specific methods
	private async getTauriEntries(): Promise<JournalEntryMetadata[]> {
		await this.ensureDirectoryExists();
		const entries = await readDir(this.journalFolder, { baseDir: this.baseDir });
		const journalEntries: JournalEntryMetadata[] = [];

		for (const entry of entries) {
			if (entry.isFile && entry.name?.endsWith(this.fileExtension)) {
				const id = entry.name.replace(this.fileExtension, '');
				const metadata = await this.getTauriEntryMetadata(id);
				if (metadata) {
					journalEntries.push(metadata);
				}
			}
		}
		return journalEntries.sort(
			(a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime()
		);
	}

	private async getTauriEntry(id: string): Promise<JournalEntry | null> {
		const filePath = `${this.journalFolder}/${id}${this.fileExtension}`;
		if (!(await exists(filePath, { baseDir: this.baseDir }))) {
			return null;
		}
		const content = await readTextFile(filePath, { baseDir: this.baseDir });
		const title = this.createTitleFromId(id);
		const now = new Date().toISOString();
		return { id, title, content, created_at: now, modified_at: now, file_path: filePath };
	}

	private async saveTauriEntry(id: string, content: string): Promise<boolean> {
		await this.ensureDirectoryExists();
		const filePath = `${this.journalFolder}/${id}${this.fileExtension}`;
		await writeTextFile(filePath, content, { baseDir: this.baseDir });
		return true;
	}

	private async createTauriEntry(title: string): Promise<string | null> {
		await this.ensureDirectoryExists();
		const filename = await this.generateUniqueFilename(title);
		const content = '';
		const filePath = `${this.journalFolder}/${filename}${this.fileExtension}`;
		await writeTextFile(filePath, content, { baseDir: this.baseDir });
		return filename;
	}

	private async deleteTauriEntry(id: string): Promise<boolean> {
		const filePath = `${this.journalFolder}/${id}${this.fileExtension}`;
		if (await exists(filePath, { baseDir: this.baseDir })) {
			await remove(filePath, { baseDir: this.baseDir });
		}
		return true;
	}

	private async renameTauriEntry(oldId: string, newTitle: string): Promise<string | null> {
		const oldFilePath = `${this.journalFolder}/${oldId}${this.fileExtension}`;
		if (!(await exists(oldFilePath, { baseDir: this.baseDir }))) {
			return null;
		}
		const newId = await this.generateUniqueFilename(newTitle);
		const newFilePath = `${this.journalFolder}/${newId}${this.fileExtension}`;
		const content = await readTextFile(oldFilePath, { baseDir: this.baseDir });
		await writeTextFile(newFilePath, content, { baseDir: this.baseDir });
		await remove(oldFilePath, { baseDir: this.baseDir });
		return newId;
	}

	private async getTauriEntryMetadata(id: string): Promise<JournalEntryMetadata | null> {
		const filePath = `${this.journalFolder}/${id}${this.fileExtension}`;
		const content = await readTextFile(filePath, { baseDir: this.baseDir });
		const title = this.createTitleFromId(id);
		const preview = PreviewService.createPreview(content);
		const now = new Date().toISOString();
		
		// Check publish status if authenticated (cache it for performance)
		let isPublished: boolean | undefined = undefined;
		if (apiAuthService.isAuthenticated()) {
			try {
				isPublished = await this.getEntryPublishStatus(id) || false;
			} catch (error) {
				console.warn('Failed to get publish status for metadata cache:', error);
				isPublished = false;
			}
		}
		
		return { id, title, created_at: now, modified_at: now, file_path: filePath, preview, isPublished };
	}

	// Web-specific methods
	private async saveWebEntry(id: string, content: string): Promise<boolean> {
		const entry = await this.getCachedEntry(id);
		if (!entry) return false;
		const updatedEntry = { ...entry, content, modified_at: new Date().toISOString() };
		await this.cacheEntry(updatedEntry);
		await this.updateMetadataFromEntry(updatedEntry);
		return true;
	}

	private async createWebEntry(title: string): Promise<string> {
		const id = this.titleToSafeFilename(title);
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

	private async deleteWebEntry(id: string): Promise<boolean> {
		await this.deleteCachedEntry(id);
		return true;
	}

	private async createDefaultEntriesForWeb(): Promise<void> {
		const db = await this.initDB();
		const tx = db.transaction('entries', 'readonly');
		const count = await tx.store.count();
		await tx.done;

		if (count === 0) {
			const defaultEntries = this.getDefaultEntries();
			for (const entry of defaultEntries) {
				await this.cacheEntry(entry);
				await this.updateMetadataFromEntry(entry);
			}
		}
	}

	// Caching methods
	private async cacheMetadata(entries: JournalEntryMetadata[]): Promise<void> {
		const db = await this.initDB();
		const existingMetadata = await db.getAllFromIndex('metadata', 'by-date');
		const existingMap = new Map(existingMetadata.map(m => [m.id, m]));

		const tx = db.transaction('metadata', 'readwrite');
		const store = tx.objectStore('metadata');

		for (const entry of entries) {
			// No longer using individual entry encryption - entries are handled by E2E encryption service
			// Just cache the metadata as-is
			await store.put(entry);
		}

		// Remove metadata for entries that no longer exist in the filesystem
		const newEntryIds = new Set(entries.map(e => e.id));
		for (const existingId of existingMap.keys()) {
			if (!newEntryIds.has(existingId)) {
				await store.delete(existingId);
			}
		}

		await tx.done;
	}

	private async getCachedMetadata(): Promise<JournalEntryMetadata[]> {
		const db = await this.initDB();
		const index = db.transaction('metadata').store.index('by-date');
		return (await index.getAll()).reverse();
	}

	private async cacheEntry(entry: JournalEntry): Promise<void> {
		const db = await this.initDB();
		await db.put('entries', entry);
	}

	private async getCachedEntry(id: string): Promise<JournalEntry | null> {
		const db = await this.initDB();
		return (await db.get('entries', id)) || null;
	}

	private async deleteCachedEntry(id: string): Promise<void> {
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
	}

	// Method to update metadata for decrypted entries with proper previews
	async updateDecryptedTitle(entryId: string, decryptedContent: string): Promise<void> {
		try {
			const db = await this.initDB();
			const metadata = await db.get('metadata', entryId);
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

			await db.put('metadata', updatedMetadata);

			// Notify metadata store of the update
			metadataStore.updateEntryMetadata(entryId, updatedMetadata);

			console.log('Updated metadata for unlocked entry:', entryId);
		} catch (error) {
			console.error('Failed to update decrypted metadata:', error);
		}
	}

	// Utility methods
	private async updateMetadataFromEntry(entry: JournalEntry): Promise<void> {
		const db = await this.initDB();
		
		// Generate metadata for entries
		const preview = PreviewService.createPreview(entry.content);
		const displayTitle = TitleService.createFallbackTitle(entry);
		
		// Check publish status if authenticated (cache it for performance)
		let isPublished: boolean | undefined = undefined;
		if (apiAuthService.isAuthenticated()) {
			try {
				isPublished = await this.getEntryPublishStatus(entry.id) || false;
			} catch (error) {
				console.warn('Failed to get publish status for metadata cache:', error);
				isPublished = false;
			}
		}
		
		const metadata: JournalEntryMetadata = {
			id: entry.id,
			title: displayTitle,
			created_at: entry.created_at,
			modified_at: entry.modified_at,
			file_path: entry.file_path,
			preview,
			isPublished
		};
		await db.put('metadata', metadata);
		metadataStore.updateEntryMetadata(entry.id, metadata);
	}

	/**
	 * Update the publish status in cached metadata
	 */
	private async updateEntryPublishStatusInMetadata(entryId: string, isPublished: boolean): Promise<void> {
		try {
			const db = await this.initDB();
			const metadata = await db.get('metadata', entryId);
			if (metadata) {
				const updatedMetadata = { ...metadata, isPublished };
				await db.put('metadata', updatedMetadata);
				metadataStore.updateEntryMetadata(entryId, updatedMetadata);
			}
		} catch (error) {
			console.warn('Failed to update publish status in metadata cache:', error);
		}
	}

	private titleToSafeFilename(title: string): string {
		return title
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '')
			.substring(0, 50);
	}

	private async generateUniqueFilename(baseTitle: string): Promise<string> {
		const safeTitle = this.titleToSafeFilename(baseTitle);
		let filename = safeTitle;
		let counter = 1;
		while (await this.fileExistsByFilename(filename)) {
			filename = `${safeTitle}-${counter}`;
			counter++;
		}
		return filename;
	}

	private async fileExistsByFilename(filename: string): Promise<boolean> {
		const filePath = `${this.journalFolder}/${filename}${this.fileExtension}`;
		return await exists(filePath, { baseDir: this.baseDir });
	}

	private createTitleFromId(id: string): string {
		return id.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
	}

	private async ensureDirectoryExists(): Promise<void> {
		if (!(await exists(this.journalFolder, { baseDir: this.baseDir }))) {
			await mkdir(this.journalFolder, { baseDir: this.baseDir, recursive: true });
		}
	}

	private getDefaultEntries(): JournalEntry[] {
		const welcomeEntry: JournalEntry = {
			id: '2025-01-01_welcome',
			title: 'Welcome to Diaryx!',
			content: `# Welcome to Diaryx!\n\nWelcome to your personal journal! This is a demo entry to show you how the app works.\n\n## Features in Web Mode:\n\n- ✅ **Create and edit entries** - Click the + button or type a title above\n- ✅ **Markdown support** - Use # for headings, **bold**, *italic*, and more\n- ✅ **Search functionality** - Find your entries quickly\n- ✅ **Beautiful themes** - Click the ⚙️ settings button to try different colors\n- ✅ **Local storage** - Your entries are saved in your browser\'s IndexedDB\n- ✅ **Preview mode** - Toggle between edit and preview when writing\n- ✅ **Encryption** - Protect your entries with passwords 🔒\n\n## Try it out:\n\n1. Create a new entry by typing a title above\n2. Click on this entry to edit it\n3. Try the different color themes in settings\n4. Search for entries using the search box\n5. Enable encryption by clicking the 🔒 button in the editor\n\nYour entries will persist between browser sessions, so feel free to use this as your actual journal!\n\nHappy writing! 📝`,
			created_at: '2025-01-01T10:00:00.000Z',
			modified_at: '2025-01-01T10:00:00.000Z',
			file_path: 'web-entry-welcome.md'
		};

		const demoEntry: JournalEntry = {
			id: '2025-01-02_demo-features',
			title: 'Demo: Markdown Features',
			content: `# Demo: Markdown Features\n\nThis entry demonstrates various markdown features you can use in your journal.\n\n## Headers\n\nYou can use different levels of headers:\n\n### Level 3 Header\n#### Level 4 Header\n\n## Text Formatting\n\n**Bold text** and *italic text* make your entries more expressive.\n\nYou can also use ~~strikethrough~~ and \`inline code\`.\n\n## Lists\n\n### Unordered Lists:\n- Morning coffee ☕\n- Writing in journal\n- Planning the day\n- Exercise routine\n\n### Ordered Lists:\n1. Wake up early\n2. Meditation\n3. Journal writing\n4. Breakfast\n\n## Quotes\n\n> "The journal is a vehicle for my sense of selfhood. It represents me as emotionally and spiritually independent."\n> \n> — Anaïs Nin\n\n## Code Blocks\n\n\`\`\`javascript\nfunction writeJournal(thoughts) {\n    return \`Today I think: \${thoughts}\`;\n}\n\`\`\`\n\n## Links and More\n\nYou can also add links: [Markdown Guide](https://www.markdownguide.org/)\n\nTry editing this entry to experiment with markdown!`,
			created_at: '2025-01-02T14:30:00.000Z',
			modified_at: '2025-01-02T14:30:00.000Z',
			file_path: 'web-entry-demo.md'
		};

		return [welcomeEntry, demoEntry];
	}

	// Cloud sync methods

	/**
	 * Check for conflicts before syncing an entry to cloud
	 */
	private async checkSyncConflicts(entryId: string, localModified: string): Promise<{ hasConflict: boolean; cloudEntry?: any }> {
		try {
			const cloudId = await this.getCloudId(entryId);
			if (!cloudId) {
				return { hasConflict: false };
			}

			const apiUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
			const fullUrl = `${apiUrl}/api/entries/${cloudId}`;
			console.log("Fetching from:", fullUrl);
			const response = await fetch(fullUrl, {
				method: 'GET',
				headers: {
					...apiAuthService.getAuthHeaders()
				}
			});

			if (!response.ok) {
				if (response.status === 404) {
					// Entry doesn't exist in cloud anymore
					await this.removeCloudMapping(entryId);
					return { hasConflict: false };
				}
				throw new Error(`Failed to check cloud entry: ${response.status}`);
			}

			const result = await response.json();
			const cloudEntry = result.data;
			const cloudModified = cloudEntry.updated_at;

			// Check if cloud version is newer than local version
			const localTime = new Date(localModified).getTime();
			const cloudTime = new Date(cloudModified).getTime();

			if (cloudTime > localTime) {
				console.warn('Sync conflict detected - cloud version is newer', {
					entryId,
					localModified,
					cloudModified
				});
				return { hasConflict: true, cloudEntry };
			}

			return { hasConflict: false };
		} catch (error) {
			console.error('Failed to check sync conflicts:', error);
			return { hasConflict: false };
		}
	}

	/**
	 * Acquire a lock for cloud operations on a specific entry
	 */
	private async acquireCloudLock<T>(entryId: string, operation: () => Promise<T>): Promise<T> {
		const lockKey = `cloud_${entryId}`;
		
		// If there's already an operation in progress for this entry, wait for it
		if (this.cloudOperationLocks.has(lockKey)) {
			await this.cloudOperationLocks.get(lockKey);
		}

		// Create a new lock for this operation
		const operationPromise = operation();
		this.cloudOperationLocks.set(lockKey, operationPromise);

		try {
			const result = await operationPromise;
			return result;
		} finally {
			this.cloudOperationLocks.delete(lockKey);
		}
	}

	/**
	 * Publish an entry to the cloud with E2E encryption
	 */
	async publishEntry(entryId: string): Promise<boolean> {
		const isAuth = apiAuthService.isAuthenticated();
		const currentSession = apiAuthService.getCurrentSession();
		console.log('Publishing check:', { 
			isAuth, 
			hasSession: !!currentSession, 
			sessionAuth: currentSession?.isAuthenticated 
		});
		
		if (!isAuth) {
			console.error('Cannot publish: user not authenticated');
			return false;
		}

		// Check if E2E encryption is available
		const e2eSession = e2eEncryptionService.getCurrentSession();
		if (!e2eSession || !e2eSession.isUnlocked) {
			console.error('Cannot publish: E2E encryption not unlocked');
			return false;
		}

		return this.acquireCloudLock(entryId, async () => {
			try {
				// Check if entry is already published
				const existingCloudId = await this.getCloudId(entryId);
				if (existingCloudId) {
					console.log('Entry already published, updating instead');
					return this.syncEntryToCloud(entryId);
				}

				// Get the entry to publish
				const entry = await this.getEntry(entryId);
				if (!entry) {
					console.error('Entry not found:', entryId);
					return false;
				}

				// Parse frontmatter from content
				const parsedContent = FrontmatterService.parseContent(entry.content);
				
				// Prepare entry object for encryption
				const entryObject: EntryObject = {
					title: entry.title,
					content: entry.content,
					frontmatter: parsedContent.frontmatter,
					tags: FrontmatterService.extractTags(parsedContent.frontmatter)
				};

				// Encrypt the entry using E2E encryption service
				const encryptedData = e2eEncryptionService.encryptEntry(entryObject);
				if (!encryptedData) {
					throw new Error('Failed to encrypt entry');
				}

				// Generate hashes using E2E encryption service
				const hashes = e2eEncryptionService.generateHashes(entryObject);

				// Get encryption metadata and include the content nonce
				const encryptionMetadata = {
					...e2eEncryptionService.createEncryptionMetadata(),
					contentNonceB64: encryptedData.contentNonceB64
				};

				// Prepare API payload according to backend schema
				// Note: We're using the same encrypted content for both title and content for now
				// In a more sophisticated implementation, we might encrypt them separately
				const apiPayload = {
					encrypted_title: encryptedData.encryptedContentB64,
					encrypted_content: encryptedData.encryptedContentB64,
					encrypted_frontmatter: parsedContent.hasFrontmatter ? JSON.stringify(parsedContent.frontmatter) : null,
					encryption_metadata: encryptionMetadata,
					title_hash: hashes.titleHash,
					content_preview_hash: hashes.previewHash,
					is_published: true,
					file_path: entry.file_path || `${entryId}.md`,
					owner_encrypted_entry_key: encryptedData.encryptedEntryKeyB64,
					owner_key_nonce: encryptedData.keyNonceB64,
					// Include local modification time for conflict detection
					client_modified_at: entry.modified_at
				};

				// Debug: Log the payload before sending
				console.log('Frontend API payload:', {
					...apiPayload,
					encrypted_title: apiPayload.encrypted_title?.substring(0, 50) + '...',
					encrypted_content: apiPayload.encrypted_content?.substring(0, 50) + '...',
					owner_encrypted_entry_key: apiPayload.owner_encrypted_entry_key?.substring(0, 50) + '...'
				});

				// Call the API to publish
				const apiUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
				const response = await fetch(`${apiUrl}/api/entries`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...apiAuthService.getAuthHeaders()
					},
					body: JSON.stringify(apiPayload)
				});

				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(`Failed to publish entry: ${response.status} - ${errorText}`);
				}

				// Parse response to get cloud UUID
				const result = await response.json();
				const cloudId = result.data?.entry?.id;
				const serverTimestamp = result.data?.entry?.updated_at;
				
				if (cloudId) {
					// Store mapping between local ID and cloud UUID with server timestamp
					await this.storeCloudMapping(entryId, cloudId, serverTimestamp);
					
					// Update metadata to reflect published status
					await this.updateEntryPublishStatusInMetadata(entryId, true);
					
					console.log('Entry published successfully. Local ID:', entryId, 'Cloud ID:', cloudId, 'Server timestamp:', serverTimestamp);
				} else {
					console.warn('Entry published but no cloud ID returned');
				}
				
				return true;
			} catch (error) {
				console.error('Failed to publish entry:', error);
				return false;
			}
		});
	}

	/**
	 * Unpublish an entry from the cloud
	 */
	async unpublishEntry(entryId: string): Promise<boolean> {
		if (!apiAuthService.isAuthenticated()) {
			console.error('Cannot unpublish: user not authenticated');
			return false;
		}

		try {
			// Get the cloud UUID for this entry
			const cloudId = await this.getCloudId(entryId);
			if (!cloudId) {
				console.error('No cloud ID found for entry:', entryId);
				return false;
			}

			// Call the API to unpublish
			const apiUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
			console.log("Fetching from:", `${import.meta.env.VITE_API_BASE_URL}/api/entries`);
			const response = await fetch(`${apiUrl}/api/entries/${cloudId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					...apiAuthService.getAuthHeaders()
				},
				body: JSON.stringify({
					is_published: false
				})
			});

			if (!response.ok) {
				throw new Error(`Failed to unpublish entry: ${response.status}`);
			}

			// Remove the cloud mapping since entry is unpublished
			await this.removeCloudMapping(entryId);
			
			// Update metadata to reflect unpublished status
			await this.updateEntryPublishStatusInMetadata(entryId, false);
			
			console.log('Entry unpublished successfully. Local ID:', entryId, 'Cloud ID:', cloudId);
			return true;
		} catch (error) {
			console.error('Failed to unpublish entry:', error);
			return false;
		}
	}

	/**
	 * Get publish status of an entry from the cloud
	 */
	async getEntryPublishStatus(entryId: string): Promise<boolean | null> {
		if (!apiAuthService.isAuthenticated()) {
			return null;
		}

		try {
			// Get the cloud UUID for this entry
			const cloudId = await this.getCloudId(entryId);
			if (!cloudId) {
				// No cloud mapping means entry was never published
				return false;
			}

			const apiUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
			console.log("Fetching from:", `${import.meta.env.VITE_API_BASE_URL}/api/entries`);
			const response = await fetch(`${apiUrl}/api/entries/${cloudId}`, {
				method: 'GET',
				headers: {
					...apiAuthService.getAuthHeaders()
				}
			});

			if (!response.ok) {
				// Entry doesn't exist in cloud - not published anymore
				// Remove stale mapping
				await this.removeCloudMapping(entryId);
				return false;
			}

			const data = await response.json();
			return data.data?.is_published || false;
		} catch (error) {
			console.error('Failed to get entry publish status:', error);
			return null;
		}
	}

	/**
	 * Sync an entry to cloud (update existing published entry)
	 */
	async syncEntryToCloud(entryId: string): Promise<boolean> {
		if (!apiAuthService.isAuthenticated()) {
			return false;
		}

		// Check if E2E encryption is available
		const e2eSession = e2eEncryptionService.getCurrentSession();
		if (!e2eSession || !e2eSession.isUnlocked) {
			console.error('Cannot sync: E2E encryption not unlocked');
			return false;
		}

		return this.acquireCloudLock(entryId, async () => {
			try {
				// Get the cloud UUID for this entry
				const cloudId = await this.getCloudId(entryId);
				if (!cloudId) {
					console.error('No cloud ID found for entry:', entryId);
					return false;
				}

				// Get the local entry
				const entry = await this.getEntry(entryId);
				if (!entry) {
					return false;
				}

				// Check for conflicts before syncing
				const conflictCheck = await this.checkSyncConflicts(entryId, entry.modified_at);
				if (conflictCheck.hasConflict) {
					console.error('Sync conflict detected - cloud version is newer. Manual resolution required.');
					// TODO: Implement conflict resolution UI
					return false;
				}

				// Parse frontmatter from content
				const parsedContent = FrontmatterService.parseContent(entry.content);
				
				// Prepare entry object for encryption
				const entryObject: EntryObject = {
					title: entry.title,
					content: entry.content,
					frontmatter: parsedContent.frontmatter,
					tags: FrontmatterService.extractTags(parsedContent.frontmatter)
				};

				// Encrypt the entry using E2E encryption service
				const encryptedData = e2eEncryptionService.encryptEntry(entryObject);
				if (!encryptedData) {
					throw new Error('Failed to encrypt entry');
				}

				// Generate hashes using E2E encryption service
				const hashes = e2eEncryptionService.generateHashes(entryObject);

				// Get encryption metadata and include the content nonce
				const encryptionMetadata = {
					...e2eEncryptionService.createEncryptionMetadata(),
					contentNonceB64: encryptedData.contentNonceB64
				};

				// Get API URL for requests
				const apiUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

				// Get the last known server timestamp for conditional updates
				const lastServerTimestamp = await this.getLastServerTimestamp(entryId);
				console.log('Last known server timestamp:', lastServerTimestamp);
				console.log('Client entry modification time:', entry.modified_at);

				// Prepare API payload according to backend schema
				const apiPayload = {
					encrypted_title: encryptedData.encryptedContentB64,
					encrypted_content: encryptedData.encryptedContentB64,
					encrypted_frontmatter: parsedContent.hasFrontmatter ? JSON.stringify(parsedContent.frontmatter) : null,
					encryption_metadata: encryptionMetadata,
					title_hash: hashes.titleHash,
					content_preview_hash: hashes.previewHash,
					is_published: true,
					file_path: entry.file_path || `${entryId}.md`,
					// Send the client's actual modification time for conflict detection
					client_modified_at: entry.modified_at,
					// Use last known server timestamp for conditional update
					if_unmodified_since: lastServerTimestamp
				};

				console.log('Syncing with timestamps:', {
					client_modified_at: apiPayload.client_modified_at,
					if_unmodified_since: apiPayload.if_unmodified_since
				});

				// Update the cloud entry
				console.log("Fetching from:", `${import.meta.env.VITE_API_BASE_URL}/api/entries/${cloudId}`);
				const response = await fetch(`${apiUrl}/api/entries/${cloudId}`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						...apiAuthService.getAuthHeaders()
					},
					body: JSON.stringify(apiPayload)
				});

				if (!response.ok) {
					if (response.status === 409) {
						// Conflict detected by server
						console.error('Server detected a sync conflict');
						return false;
					}
					throw new Error(`Failed to sync entry: ${response.status}`);
				}

				// Parse response to get updated server timestamp
				const responseData = await response.json();
				const updatedServerTimestamp = responseData.data?.updated_at;
				
				if (updatedServerTimestamp) {
					// Store the server's new timestamp for future conflict detection
					await this.updateCloudMappingTimestamp(entryId, updatedServerTimestamp);
					console.log('Updated server timestamp for entry:', entryId, updatedServerTimestamp);
				}

				console.log('Entry synced to cloud. Local ID:', entryId, 'Cloud ID:', cloudId);
				return true;
			} catch (error) {
				console.error('Failed to sync entry to cloud:', error);
				return false;
			}
		});
	}

	/**
	 * Fetch user's entries from the cloud
	 */
	async fetchCloudEntries(): Promise<any[]> {
		if (!apiAuthService.isAuthenticated()) {
			console.log('Cannot fetch cloud entries: user not authenticated');
			return [];
		}

		try {
			const apiUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
			console.log("Fetching from:", `${apiUrl}/api/entries`);
			const response = await fetch(`${apiUrl}/api/entries`, {
				method: 'GET',
				headers: {
					...apiAuthService.getAuthHeaders()
				}
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch entries: ${response.status}`);
			}

			const result = await response.json();
			return result.data || [];
		} catch (error) {
			console.error('Failed to fetch cloud entries:', error);
			return [];
		}
	}

	/**
	 * Import cloud entries as local entries
	 */
	async importCloudEntries(): Promise<number> {
		// Prevent concurrent import operations
		if (this.syncInProgress) {
			console.log('Import already in progress, skipping');
			return 0;
		}

		this.syncInProgress = true;
		
		try {
			const cloudEntries = await this.fetchCloudEntries();
			if (cloudEntries.length === 0) {
				console.log('No cloud entries to import');
				return 0;
			}

			console.log('Found', cloudEntries.length, 'cloud entries to import');

			// Check if E2E encryption is available
			const e2eSession = e2eEncryptionService.getCurrentSession();
			if (!e2eSession || !e2eSession.isUnlocked) {
				console.log('E2E encryption not unlocked - cannot decrypt entries');
				return 0;
			}

			let importedCount = 0;

			for (const cloudEntry of cloudEntries) {
				try {
					console.log('Debug - Processing cloud entry:', {
						id: cloudEntry.id,
						hasAccessKey: !!cloudEntry.access_key,
						hasEncryptionMetadata: !!cloudEntry.encryption_metadata,
						hasAuthor: !!cloudEntry.author,
						authorPublicKey: cloudEntry.author?.public_key?.substring(0, 20) + '...'
					});
					
					// Skip if we already have this entry locally (check by cloud ID)
					const existingLocalId = await this.getLocalIdByCloudId(cloudEntry.id);
					if (existingLocalId) {
						// Check if we should update the local entry with newer cloud version
						const localEntry = await this.getEntry(existingLocalId);
						if (localEntry) {
							const localTime = new Date(localEntry.modified_at).getTime();
							const cloudTime = new Date(cloudEntry.updated_at).getTime();
							
							if (cloudTime > localTime) {
								console.log('Cloud version is newer, updating local entry:', existingLocalId);
								// Continue with import to update the local entry
							} else {
								console.log('Local version is up to date, skipping:', cloudEntry.id);
								continue;
							}
						} else {
							console.log('Entry mapping exists but local entry not found, reimporting:', cloudEntry.id);
						}
					}

					// Check if we have access key for this entry
					if (!cloudEntry.access_key?.encrypted_entry_key) {
						console.log('No access key for entry, skipping:', cloudEntry.id);
						continue;
					}

					// Parse encryption metadata to get content nonce
					let encryptionMetadata;
					try {
						encryptionMetadata = typeof cloudEntry.encryption_metadata === 'string' 
							? JSON.parse(cloudEntry.encryption_metadata) 
							: cloudEntry.encryption_metadata;
					} catch (error) {
						console.log('Failed to parse encryption metadata, skipping:', cloudEntry.id);
						continue;
					}

					// Get content nonce from encryption metadata
					const contentNonceB64 = encryptionMetadata.contentNonceB64;
					if (!contentNonceB64) {
						console.log('No content nonce found in encryption metadata, skipping:', cloudEntry.id);
						continue;
					}

					// Get author's public key
					const authorPublicKey = cloudEntry.author?.public_key;
					console.log('Debug - Entry:', cloudEntry.id, 'Author public key:', authorPublicKey, 'Type:', typeof authorPublicKey);
					
					if (!authorPublicKey || typeof authorPublicKey !== 'string') {
						console.log('No valid author public key found, skipping:', cloudEntry.id);
						continue;
					}

					// Try to decrypt the entry
					console.log('Attempting decryption with:', {
						hasEncryptedContent: !!cloudEntry.encrypted_content,
						hasContentNonce: !!contentNonceB64,
						hasEncryptedEntryKey: !!cloudEntry.access_key.encrypted_entry_key,
						hasKeyNonce: !!cloudEntry.access_key.key_nonce,
						hasAuthorPublicKey: !!authorPublicKey
					});

					// Validate encrypted data integrity before attempting decryption
					const encryptedData = {
						encryptedContentB64: cloudEntry.encrypted_content,
						contentNonceB64: contentNonceB64,
						encryptedEntryKeyB64: cloudEntry.access_key.encrypted_entry_key,
						keyNonceB64: cloudEntry.access_key.key_nonce
					};

					if (!this.validateEncryptedData(encryptedData)) {
						console.error('Encrypted data validation failed for entry:', cloudEntry.id);
						continue;
					}
					
					const decryptedEntry = e2eEncryptionService.decryptEntry(encryptedData, authorPublicKey);
					
					console.log('Decryption result:', decryptedEntry ? 'success' : 'failed');

					if (!decryptedEntry) {
						console.log('Failed to decrypt entry, skipping:', cloudEntry.id);
						continue;
					}

					// Validate decrypted content
					if (!decryptedEntry.content || typeof decryptedEntry.content !== 'string') {
						console.error('Invalid decrypted content for entry:', cloudEntry.id);
						continue;
					}

					// Use existing local ID if updating, otherwise generate new one
					let localId = existingLocalId;
					if (!localId) {
						localId = await this.generateUniqueFilenameForImport(decryptedEntry.title || 'Untitled Entry');
					}
					
					// Create the entry locally
					const journalEntry: JournalEntry = {
						id: localId,
						title: decryptedEntry.title,
						content: decryptedEntry.content,
						created_at: cloudEntry.created_at,
						modified_at: cloudEntry.updated_at,
						file_path: `${localId}.md`
					};

					// Save to appropriate storage based on environment
					if (this.environment === 'tauri') {
						// Save to filesystem
						const filePath = `${this.journalFolder}/${localId}${this.fileExtension}`;
						await writeTextFile(filePath, journalEntry.content, { baseDir: this.baseDir });
					} else {
						// Save to IndexedDB
						const db = await this.initDB();
						await db.put('entries', journalEntry);
					}

					// Cache the entry metadata  
					const metadata: JournalEntryMetadata = {
						id: journalEntry.id,
						title: journalEntry.title,
						created_at: journalEntry.created_at,
						modified_at: journalEntry.modified_at,
						file_path: journalEntry.file_path,
						preview: PreviewService.createPreview(journalEntry.content),
						isPublished: true // Entries imported from cloud are by definition published
					};
					await this.cacheMetadata([metadata]);

					// Store the cloud mapping with server timestamp
					await this.storeCloudMapping(localId, cloudEntry.id, cloudEntry.updated_at);

					console.log('Imported entry:', localId, 'from cloud ID:', cloudEntry.id);
					importedCount++;

				} catch (error) {
					console.error('Failed to import entry:', cloudEntry.id, error);
				}
			}

			console.log('Successfully imported', importedCount, 'entries from cloud');
			return importedCount;
		} finally {
			this.syncInProgress = false;
		}
	}

	/**
	 * Check if user has E2E encryption set up by checking if they have any entries in the cloud
	 */
	async hasCloudEntries(): Promise<boolean> {
		const cloudEntries = await this.fetchCloudEntries();
		return cloudEntries.length > 0;
	}

	/**
	 * Sync after login - import cloud entries if any exist
	 */
	async syncAfterLogin(): Promise<number> {
		try {
			console.log('Performing post-login sync...');
			
			// Check if user has entries in the cloud
			const hasEntries = await this.hasCloudEntries();
			if (hasEntries) {
				console.log('User has cloud entries, attempting to import...');
				
				// Check if E2E encryption is set up
				const e2eSession = e2eEncryptionService.getCurrentSession();
				if (!e2eSession || !e2eSession.isUnlocked) {
					console.log('E2E encryption not set up - user will need to unlock encryption to access cloud entries');
					// Could potentially show a notification to the user here
					return 0;
				}
				
				// Import cloud entries
				const importedCount = await this.importCloudEntries();
				if (importedCount > 0) {
					// Refresh the UI by reloading entries
					console.log('Post-login sync completed successfully');
				}
				return importedCount;
			} else {
				console.log('User has no cloud entries - likely a new user');
				return 0;
			}
		} catch (error) {
			console.error('Failed to sync after login:', error);
			return 0;
		}
	}

	/**
	 * Perform bidirectional sync between local and cloud entries
	 */
	async performBidirectionalSync(): Promise<{ imported: number; uploaded: number; conflicts: number }> {
		if (this.syncInProgress) {
			console.log('Sync already in progress');
			return { imported: 0, uploaded: 0, conflicts: 0 };
		}

		this.syncInProgress = true;
		let imported = 0;
		let uploaded = 0;
		let conflicts = 0;

		try {
			// First, import any new or updated entries from cloud
			imported = await this.importCloudEntries();

			// Then, sync any local changes to cloud
			const localEntries = await this.getAllEntries();
			
			for (const localEntry of localEntries) {
				try {
					const cloudId = await this.getCloudId(localEntry.id);
					
					if (!cloudId) {
						// Local entry not published yet - could auto-publish here if desired
						continue;
					}

					// Check if local version is newer than cloud
					const conflictCheck = await this.checkSyncConflicts(localEntry.id, localEntry.modified_at);
					
					if (conflictCheck.hasConflict) {
						console.warn('Sync conflict for entry:', localEntry.id);
						conflicts++;
						// TODO: Store conflict info for user resolution
						continue;
					}

					// Sync local changes to cloud
					const syncResult = await this.syncEntryToCloud(localEntry.id);
					if (syncResult) {
						uploaded++;
					}
				} catch (error) {
					console.error('Failed to sync local entry to cloud:', localEntry.id, error);
				}
			}

			console.log('Bidirectional sync completed:', { imported, uploaded, conflicts });
			return { imported, uploaded, conflicts };
		} finally {
			this.syncInProgress = false;
		}
	}

	/**
	 * Validate encrypted data integrity before processing
	 */
	private validateEncryptedData(encryptedData: {
		encryptedContentB64: string;
		contentNonceB64: string;
		encryptedEntryKeyB64: string;
		keyNonceB64: string;
	}): boolean {
		try {
			// Check that all required fields are present and are valid Base64
			if (!encryptedData.encryptedContentB64 || !encryptedData.contentNonceB64 ||
				!encryptedData.encryptedEntryKeyB64 || !encryptedData.keyNonceB64) {
				console.error('Missing required encrypted data fields');
				return false;
			}

			// Validate Base64 format
			const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
			const fields = [
				encryptedData.encryptedContentB64,
				encryptedData.contentNonceB64,
				encryptedData.encryptedEntryKeyB64,
				encryptedData.keyNonceB64
			];

			for (const field of fields) {
				if (!base64Regex.test(field)) {
					console.error('Invalid Base64 format detected');
					return false;
				}
			}

			// Check minimum lengths for security
			if (encryptedData.contentNonceB64.length < 16 || // Minimum 12 bytes encoded
				encryptedData.keyNonceB64.length < 16 ||
				encryptedData.encryptedContentB64.length < 20 || // Some minimum content
				encryptedData.encryptedEntryKeyB64.length < 40) { // Minimum key size
				console.error('Encrypted data fields too short');
				return false;
			}

			return true;
		} catch (error) {
			console.error('Error validating encrypted data:', error);
			return false;
		}
	}

	private async generateUniqueFilenameForImport(baseTitle: string): Promise<string> {
		const safeTitle = this.titleToSafeFilename(baseTitle);
		let filename = safeTitle;
		let counter = 1;

		// Check for existing entries in a way that works for both environments
		while (await this.entryExistsForImport(filename)) {
			filename = `${safeTitle}-${counter}`;
			counter++;
		}
		
		return filename;
	}

	/**
	 * Check if entry exists during import (works in both Tauri and web)
	 */
	private async entryExistsForImport(filename: string): Promise<boolean> {
		if (this.environment === 'tauri') {
			const filePath = `${this.journalFolder}/${filename}${this.fileExtension}`;
			return await exists(filePath, { baseDir: this.baseDir });
		} else {
			// In web mode, check IndexedDB
			const db = await this.initDB();
			const entry = await db.get('entries', filename);
			return !!entry;
		}
	}

	/**
	 * Store mapping between local entry ID and cloud UUID
	 */
	private async storeCloudMapping(localId: string, cloudId: string, serverTimestamp?: string): Promise<void> {
		const db = await this.initDB();
		const mapping: CloudEntryMapping = {
			localId,
			cloudId,
			publishedAt: new Date().toISOString(),
			lastServerTimestamp: serverTimestamp
		};
		await db.put('cloudMappings', mapping);
	}

	/**
	 * Update the server timestamp for an existing cloud mapping
	 */
	private async updateCloudMappingTimestamp(localId: string, serverTimestamp: string): Promise<void> {
		const db = await this.initDB();
		const mapping = await db.get('cloudMappings', localId);
		if (mapping) {
			mapping.lastServerTimestamp = serverTimestamp;
			await db.put('cloudMappings', mapping);
		}
	}

	/**
	 * Get the last known server timestamp for conflict detection
	 */
	private async getLastServerTimestamp(localId: string): Promise<string | null> {
		const db = await this.initDB();
		const mapping = await db.get('cloudMappings', localId);
		return mapping?.lastServerTimestamp || null;
	}

	/**
	 * Get cloud UUID for a local entry ID
	 */
	private async getCloudId(localId: string): Promise<string | null> {
		const db = await this.initDB();
		const mapping = await db.get('cloudMappings', localId);
		return mapping?.cloudId || null;
	}

	/**
	 * Get local ID for a given cloud UUID
	 */
	private async getLocalIdByCloudId(cloudId: string): Promise<string | null> {
		const db = await this.initDB();
		const tx = db.transaction('cloudMappings', 'readonly');
		const store = tx.objectStore('cloudMappings');
		const allMappings = await store.getAll();
		
		for (const mapping of allMappings) {
			if (mapping.cloudId === cloudId) {
				return mapping.localId;
			}
		}
		
		return null;
	}

	/**
	 * Remove cloud mapping when entry is unpublished
	 */
	private async removeCloudMapping(localId: string): Promise<void> {
		const db = await this.initDB();
		await db.delete('cloudMappings', localId);
	}

	/**
	 * Get current sync status
	 */
	public getSyncStatus(): { inProgress: boolean; activeOperations: string[] } {
		return {
			inProgress: this.syncInProgress,
			activeOperations: Array.from(this.cloudOperationLocks.keys())
		};
	}

	/**
	 * Cancel all ongoing sync operations (emergency stop)
	 */
	public cancelSyncOperations(): void {
		console.warn('Cancelling all sync operations');
		this.syncInProgress = false;
		this.cloudOperationLocks.clear();
	}
}

export const storageService = new StorageService();