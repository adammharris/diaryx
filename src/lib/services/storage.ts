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
	StorageEnvironment
} from '../storage/types';
import { PreviewService } from '../storage/preview.service';
import { TitleService } from '../storage/title.service';
import { isEncrypted } from '../utils/crypto';
import { passwordStore } from '../stores/password';
import { metadataStore } from '../stores/metadata';

class StorageService {
	private environment: StorageEnvironment;
	private db: IDBPDatabase<DBSchema> | null = null;
	private readonly dbName = 'diaryx-journal';
	private readonly dbVersion = 1;
	private readonly baseDir = BaseDirectory.Document;
	private readonly fileExtension = '.md';
	private readonly journalFolder = 'Diaryx';
	private fileWatcher: (() => void) | null = null;

	constructor() {
		this.environment = this.detectEnvironment();
		if (this.environment === 'web') {
			this.initDB();
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

			// If we have a cached entry and the new entry appears encrypted
			if (existing && isEncrypted(entry.preview || '')) {
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
				// (i.e., it's not the standard encrypted preview text)
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
		const hasPassword = passwordStore.hasCachedPassword(entry.id);
		const db = await this.initDB();
		const existingMetadata = await db.get('metadata', entry.id);

		if (
			hasPassword &&
			existingMetadata &&
			!existingMetadata.preview.includes('encrypted') &&
			isEncrypted(entry.content)
		) {
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
}

export const storageService = new StorageService();