/**
 * Tauri filesystem storage adapter using Tauri FS plugin
 */

import { 
    readTextFile, 
    writeTextFile, 
    remove, 
    exists, 
    readDir,
    mkdir,
    watchImmediate,
    BaseDirectory 
} from '@tauri-apps/plugin-fs';
import type { JournalEntry, JournalEntryMetadata, IFileSystemStorage } from './types.js';
import { PreviewService } from './preview.service.js';

export class TauriStorageAdapter implements IFileSystemStorage {
    private readonly baseDir = BaseDirectory.Document;
    private readonly fileExtension = '.md';
    private readonly journalFolder = 'Diaryx';
    private fileWatcher: (() => void) | null = null;
    private onFileChange: ((changedFiles?: string[], eventType?: string) => void) | null = null;

    async getEntriesFromFS(): Promise<JournalEntryMetadata[]> {
        try {
            // Ensure the Diaryx folder exists
            await this.ensureDirectoryExists();
            
            // Read directory contents from Diaryx folder
            const entries = await readDir(this.journalFolder, { baseDir: this.baseDir });
            const journalEntries: JournalEntryMetadata[] = [];

            for (const entry of entries) {
                if (entry.isFile && entry.name?.endsWith(this.fileExtension)) {
                    const id = entry.name.replace(this.fileExtension, '');
                    const metadata = await this.getEntryMetadata(id);
                    if (metadata) {
                        journalEntries.push(metadata);
                    }
                }
            }

            // Sort by modified date (newest first)
            return journalEntries.sort((a, b) => 
                new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime()
            );
        } catch (error) {
            console.error('Failed to get entries from filesystem:', error);
            return [];
        }
    }

    async getEntryFromFS(id: string): Promise<JournalEntry | null> {
        try {
            const filePath = `${this.journalFolder}/${id}${this.fileExtension}`;
            
            // Check if file exists
            const fileExists = await exists(filePath, { baseDir: this.baseDir });
            if (!fileExists) {
                return null;
            }

            // Read file content
            const content = await readTextFile(filePath, { baseDir: this.baseDir });
            
            // Title is derived from filename, not content
            const title = this.createTitleFromId(id);
            
            // Get file stats for dates (approximate)
            const now = new Date().toISOString();
            
            return {
                id,
                title,
                content,
                created_at: now, // FS plugin doesn't provide creation time
                modified_at: now, // FS plugin doesn't provide modification time
                file_path: filePath
            };
        } catch (error) {
            console.error(`Failed to get entry ${id} from filesystem:`, error);
            return null;
        }
    }

    async saveEntryToFS(id: string, content: string): Promise<boolean> {
        try {
            // Ensure the Diaryx folder exists
            await this.ensureDirectoryExists();
            
            const filePath = `${this.journalFolder}/${id}${this.fileExtension}`;
            await writeTextFile(filePath, content, { baseDir: this.baseDir });
            return true;
        } catch (error) {
            console.error(`Failed to save entry ${id} to filesystem:`, error);
            return false;
        }
    }

    /**
     * Converts a title to a safe filename
     */
    private titleToSafeFilename(title: string): string {
        return title
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-') // Collapse multiple hyphens
            .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
            .substring(0, 50); // Limit length
    }

    /**
     * Generates a unique filename, handling duplicates
     */
    private async generateUniqueFilename(baseTitle: string): Promise<string> {
        const safeTitle = this.titleToSafeFilename(baseTitle);
        let filename = safeTitle;
        let counter = 1;

        // Keep checking until we find a unique filename
        while (await this.fileExistsByFilename(filename)) {
            filename = `${safeTitle}-${counter}`;
            counter++;
        }

        return filename;
    }

    /**
     * Checks if a file exists with the given filename (for duplicate checking)
     */
    private async fileExistsByFilename(filename: string): Promise<boolean> {
        try {
            const filePath = `${this.journalFolder}/${filename}${this.fileExtension}`;
            return await exists(filePath, { baseDir: this.baseDir });
        } catch {
            return false;
        }
    }

    async createEntryInFS(title: string): Promise<string | null> {
        try {
            // Ensure the Diaryx folder exists
            await this.ensureDirectoryExists();
            
            // Generate unique filename based on title
            const filename = await this.generateUniqueFilename(title);
            
            // Create initial empty content
            const content = '';
            
            const filePath = `${this.journalFolder}/${filename}${this.fileExtension}`;
            await writeTextFile(filePath, content, { baseDir: this.baseDir });
            
            // Return the filename as the ID (without extension)
            return filename;
        } catch (error) {
            console.error('Failed to create entry in filesystem:', error);
            return null;
        }
    }

    async deleteEntryFromFS(id: string): Promise<boolean> {
        try {
            const filePath = `${this.journalFolder}/${id}${this.fileExtension}`;
            console.log(`TauriAdapter.deleteEntryFromFS called with id: ${id}`);
            console.log(`Full file path: ${filePath}`);
            console.log(`Base directory: ${this.baseDir}`);
            
            // Check if file exists first
            const fileExists = await exists(filePath, { baseDir: this.baseDir });
            console.log(`File exists: ${fileExists}`);
            
            if (fileExists) {
                console.log(`Removing file: ${filePath}`);
                await remove(filePath, { baseDir: this.baseDir });
                console.log(`File removed successfully`);
                return true;
            } else {
                console.warn(`File ${filePath} does not exist, considering deletion successful`);
                return true; // File doesn't exist, so deletion is "successful"
            }
        } catch (error) {
            console.error(`Failed to delete entry ${id} from filesystem:`, error);
            return false;
        }
    }

    async renameEntryInFS(oldId: string, newTitle: string): Promise<string | null> {
        try {
            const oldFilePath = `${this.journalFolder}/${oldId}${this.fileExtension}`;
            
            // Check if old file exists
            const fileExists = await exists(oldFilePath, { baseDir: this.baseDir });
            if (!fileExists) {
                console.error(`Cannot rename: file ${oldFilePath} does not exist`);
                return null;
            }

            // Generate new unique filename based on the new title
            const newId = await this.generateUniqueFilename(newTitle);
            const newFilePath = `${this.journalFolder}/${newId}${this.fileExtension}`;

            // Read the content from the old file
            const content = await readTextFile(oldFilePath, { baseDir: this.baseDir });
            
            // Write to new file
            await writeTextFile(newFilePath, content, { baseDir: this.baseDir });
            
            // Remove old file
            await remove(oldFilePath, { baseDir: this.baseDir });
            
            console.log(`Renamed entry from ${oldId} to ${newId}`);
            return newId;
        } catch (error) {
            console.error(`Failed to rename entry ${oldId}:`, error);
            return null;
        }
    }

    /**
     * Checks if a file exists
     */
    async fileExists(id: string): Promise<boolean> {
        try {
            const filePath = `${this.journalFolder}/${id}${this.fileExtension}`;
            return await exists(filePath, { baseDir: this.baseDir });
        } catch (error) {
            console.error('Failed to check file existence:', error);
            return false;
        }
    }

    /**
     * Gets metadata for a single entry
     */
    private async getEntryMetadata(id: string): Promise<JournalEntryMetadata | null> {
        try {
            const filePath = `${this.journalFolder}/${id}${this.fileExtension}`;
            const content = await readTextFile(filePath, { baseDir: this.baseDir });
            
            // Title is derived from the filename (id), not from content
            const title = this.createTitleFromId(id);
            const preview = PreviewService.createPreview(content);
            
            const now = new Date().toISOString();
            
            return {
                id,
                title,
                created_at: now, // Approximate
                modified_at: now, // Approximate
                file_path: filePath,
                preview
            };
        } catch (error) {
            console.error(`Failed to get metadata for entry ${id}:`, error);
            return null;
        }
    }

    /**
     * Creates a readable title from entry ID
     */
    private createTitleFromId(id: string): string {
        return id
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, letter => letter.toUpperCase());
    }

    /**
     * Ensures the Diaryx directory exists, creating it if necessary
     */
    private async ensureDirectoryExists(): Promise<void> {
        try {
            const dirExists = await exists(this.journalFolder, { baseDir: this.baseDir });
            if (!dirExists) {
                console.log('Creating Diaryx directory...');
                await mkdir(this.journalFolder, { baseDir: this.baseDir, recursive: true });
                console.log('Diaryx directory created successfully');
            }
        } catch (error) {
            console.error('Failed to create Diaryx directory:', error);
            throw error;
        }
    }

    /**
     * Executes a filesystem operation with timeout
     */
    async withTimeout<T>(
        operation: Promise<T>,
        timeoutMs: number = 15000,
        errorMessage: string = 'Operation timeout'
    ): Promise<T> {
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
        );

        return Promise.race([operation, timeoutPromise]);
    }

    /**
     * Gets entries with timeout protection
     */
    async getEntriesWithTimeout(timeoutMs: number = 15000): Promise<JournalEntryMetadata[]> {
        return this.withTimeout(
            this.getEntriesFromFS(),
            timeoutMs,
            'Timeout loading entries from filesystem'
        );
    }

    /**
     * Gets single entry with timeout protection
     */
    async getEntryWithTimeout(id: string, timeoutMs: number = 10000): Promise<JournalEntry | null> {
        return this.withTimeout(
            this.getEntryFromFS(id),
            timeoutMs,
            `Timeout loading entry ${id} from filesystem`
        );
    }

    /**
     * Start watching for file changes in the journal directory
     */
    async startWatching(onChange: (changedFiles?: string[], eventType?: string) => void): Promise<void> {
        if (this.fileWatcher) {
            console.log('File watcher already exists, updating callback');
            this.onFileChange = onChange;
            return; // Already watching
        }

        try {
            console.log('Starting file system watcher for:', this.journalFolder);
            this.onFileChange = onChange;
            
            this.fileWatcher = await watchImmediate(
                [this.journalFolder],
                (event) => {
                    console.log('File system event:', event);
                    // Extract file paths from the event
                    const changedFiles = event.paths || [];
                    // Extract event type (metadata or data)
                    let eventType = 'unknown';
                    if (event.type && typeof event.type === 'object' && 'modify' in event.type) {
                        const modify = event.type.modify as any;
                        eventType = modify?.kind || 'unknown';
                    }
                    // Call immediately - let the main page handle debouncing
                    if (this.onFileChange) {
                        this.onFileChange(changedFiles, eventType);
                    }
                },
                { baseDir: this.baseDir }
            );
            
            console.log('File system watcher started successfully');
        } catch (error) {
            console.error('Failed to start file system watcher:', error);
        }
    }

    /**
     * Stop watching for file changes
     */
    stopWatching(): void {
        if (this.fileWatcher) {
            console.log('Stopping file system watcher');
            this.fileWatcher();
            this.fileWatcher = null;
            this.onFileChange = null;
        }
    }
}