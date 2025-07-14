/**
 * Tauri filesystem storage adapter using Tauri FS plugin
 */

import { 
    readTextFile, 
    writeTextFile, 
    remove, 
    exists, 
    readDir,
    BaseDirectory 
} from '@tauri-apps/plugin-fs';
import type { JournalEntry, JournalEntryMetadata, IFileSystemStorage } from './types.js';
import { PreviewService } from './preview.service.js';
import { TitleService } from './title.service.js';

export class TauriStorageAdapter implements IFileSystemStorage {
    private readonly baseDir = BaseDirectory.Document;
    private readonly fileExtension = '.md';
    private readonly journalFolder = 'Diaryx';

    async getEntriesFromFS(): Promise<JournalEntryMetadata[]> {
        try {
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
            
            // Extract title from content
            const extractedTitle = TitleService.extractTitleFromContent(content);
            const title = extractedTitle || this.createTitleFromId(id);
            
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
            const filePath = `${this.journalFolder}/${id}${this.fileExtension}`;
            await writeTextFile(filePath, content, { baseDir: this.baseDir });
            return true;
        } catch (error) {
            console.error(`Failed to save entry ${id} to filesystem:`, error);
            return false;
        }
    }

    async createEntryInFS(title: string): Promise<string | null> {
        try {
            // Generate unique ID from timestamp
            const now = new Date();
            const id = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
            
            // Create initial content with title
            const content = `# ${title}\n\n`;
            
            const filePath = `${this.journalFolder}/${id}${this.fileExtension}`;
            await writeTextFile(filePath, content, { baseDir: this.baseDir });
            
            return id;
        } catch (error) {
            console.error('Failed to create entry in filesystem:', error);
            return null;
        }
    }

    async deleteEntryFromFS(id: string): Promise<boolean> {
        try {
            const filePath = `${this.journalFolder}/${id}${this.fileExtension}`;
            
            // Check if file exists first
            const fileExists = await exists(filePath, { baseDir: this.baseDir });
            
            if (fileExists) {
                await remove(filePath, { baseDir: this.baseDir });
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
            
            const extractedTitle = TitleService.extractTitleFromContent(content);
            const title = extractedTitle || this.createTitleFromId(id);
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
}