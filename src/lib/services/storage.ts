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
import { isEncrypted } from '../utils/crypto';
import { encryptionService } from './encryption';
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

	constructor() {
		this.environment = this.detectEnvironment();
		if (this.environment === 'web') {
			this.initDB();
		}
		
		// Set up encryption service callback to avoid circular dependency
		encryptionService.setMetadataUpdateCallback((entryId: string, decryptedContent: string) => {
			this.updateDecryptedTitle(entryId, decryptedContent);
		});
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

		if (this.environment === 'tauri') {
			const success = await this.deleteTauriEntry(id);
			if (success) {
				await this.deleteCachedEntry(id);
			}
			return success;
		} else {
			return this.deleteWebEntry(id);
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
						const modify = event.type.modify as any;
						eventType = modify?.kind || 'modify';
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
		return { id, title, created_at: now, modified_at: now, file_path: filePath, preview };
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
			const existing = existingMap.get(entry.id);
			let finalEntry = entry;

			// If we have a cached entry and the new entry has encrypted preview text
			if (existing && entry.preview && entry.preview.includes('encrypted and requires a password')) {
				// Check if we have a cached password for this entry
				const hasPassword = encryptionService.hasCachedPassword(entry.id);
				
				if (hasPassword) {
					// Preserve the decrypted metadata if it exists and looks valid
					let preserveTitle = false;
					let preservePreview = false;

					// Preserve the cached title if it looks like a proper decrypted title
					if (
						existing.title !== entry.title &&
						!existing.title.match(/^[A-Za-z0-9+/=]{20,}/) &&
						!existing.title.startsWith('Encrypted')
					) {
						preserveTitle = true;
					}

					// Preserve the cached preview if it looks like decrypted content
					if (
						existing.preview !== entry.preview &&
						!existing.preview.includes('encrypted and requires a password') &&
						!existing.preview.includes('encrypted') &&
						existing.preview.length > 10
					) {
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
			}
			await store.put(finalEntry);
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
		const tx = db.transaction(['entries', 'metadata'], 'readwrite');
		await tx.objectStore('entries').delete(id);
		await tx.objectStore('metadata').delete(id);
		await tx.done;
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
		const hasPassword = encryptionService.hasCachedPassword(entry.id);
		const db = await this.initDB();
		const existingMetadata = await db.get('metadata', entry.id);

		if (
			hasPassword &&
			existingMetadata &&
			isEncrypted(entry.content)
		) {
			// For encrypted entries with cached passwords, preserve the decrypted metadata
			const preservedMetadata: JournalEntryMetadata = {
				...existingMetadata,
				modified_at: entry.modified_at,
				file_path: entry.file_path
			};
			await db.put('metadata', preservedMetadata);
			metadataStore.updateEntryMetadata(entry.id, preservedMetadata);
			return;
		}

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
		await db.put('metadata', metadata);
		metadataStore.updateEntryMetadata(entry.id, metadata);
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
	 * Publish an entry to the cloud with E2E encryption
	 */
	async publishEntry(entryId: string): Promise<boolean> {
		if (!apiAuthService.isAuthenticated()) {
			console.error('Cannot publish: user not authenticated');
			return false;
		}

		// Check if E2E encryption is available
		const e2eSession = e2eEncryptionService.getCurrentSession();
		if (!e2eSession || !e2eSession.isUnlocked) {
			console.error('Cannot publish: E2E encryption not unlocked');
			return false;
		}

		try {
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

			// Get encryption metadata
			const encryptionMetadata = e2eEncryptionService.createEncryptionMetadata();

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
				owner_key_nonce: encryptedData.keyNonceB64
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
			
			if (cloudId) {
				// Store mapping between local ID and cloud UUID
				await this.storeCloudMapping(entryId, cloudId);
				console.log('Entry published successfully. Local ID:', entryId, 'Cloud ID:', cloudId);
			} else {
				console.warn('Entry published but no cloud ID returned');
			}
			
			return true;
		} catch (error) {
			console.error('Failed to publish entry:', error);
			return false;
		}
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

			// Get encryption metadata
			const encryptionMetadata = e2eEncryptionService.createEncryptionMetadata();

			// Prepare API payload according to backend schema
			const apiPayload = {
				encrypted_title: encryptedData.encryptedContentB64,
				encrypted_content: encryptedData.encryptedContentB64,
				encrypted_frontmatter: parsedContent.hasFrontmatter ? JSON.stringify(parsedContent.frontmatter) : null,
				encryption_metadata: encryptionMetadata,
				title_hash: hashes.titleHash,
				content_preview_hash: hashes.previewHash,
				is_published: true,
				file_path: entry.file_path || `${entryId}.md`
			};

			// Update the cloud entry
			const apiUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
			const response = await fetch(`${apiUrl}/api/entries/${cloudId}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					...apiAuthService.getAuthHeaders()
				},
				body: JSON.stringify(apiPayload)
			});

			if (!response.ok) {
				throw new Error(`Failed to sync entry: ${response.status}`);
			}

			console.log('Entry synced to cloud. Local ID:', entryId, 'Cloud ID:', cloudId);
			return true;
		} catch (error) {
			console.error('Failed to sync entry to cloud:', error);
			return false;
		}
	}

	/**
	 * Store mapping between local entry ID and cloud UUID
	 */
	private async storeCloudMapping(localId: string, cloudId: string): Promise<void> {
		const db = await this.initDB();
		const mapping: CloudEntryMapping = {
			localId,
			cloudId,
			publishedAt: new Date().toISOString()
		};
		await db.put('cloudMappings', mapping);
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
	 * Remove cloud mapping when entry is unpublished
	 */
	private async removeCloudMapping(localId: string): Promise<void> {
		const db = await this.initDB();
		await db.delete('cloudMappings', localId);
	}
}

export const storageService = new StorageService();