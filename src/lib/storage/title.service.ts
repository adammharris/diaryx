/**
 * Service for handling entry titles (filename-based)
 */

import { isEncrypted } from '../utils/crypto.js';
import type { JournalEntry } from './types.js';

export class TitleService {
    private static readonly ENCRYPTED_TITLE_PREFIX = '🔒';

    /**
     * Creates a fallback title for encrypted entries
     */
    static createFallbackTitle(entry: JournalEntry): string {
        // Since titles are now filename-based, just return the entry title
        // Add encryption indicator if needed
        if (isEncrypted(entry.content) && !entry.title.startsWith(this.ENCRYPTED_TITLE_PREFIX)) {
            return `${this.ENCRYPTED_TITLE_PREFIX} ${entry.title}`;
        }
        return entry.title;
    }

    /**
     * Creates a readable title from file path or ID
     */
    static createReadableTitleFromPath(filePath: string, fallbackId: string): string {
        // Extract filename without extension
        const fileName = filePath.split('/').pop()?.replace(/\.(md|txt)$/, '') || fallbackId;
        
        // Convert to human-readable format
        return fileName
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, letter => letter.toUpperCase());
    }


    /**
     * Gets display title for UI (with encryption indicator)
     */
    static getDisplayTitle(entry: JournalEntry): string {
        const title = this.createFallbackTitle(entry);
        
        // If it's encrypted and doesn't already have the indicator, add it
        if (isEncrypted(entry.content) && !title.startsWith(this.ENCRYPTED_TITLE_PREFIX)) {
            return `${this.ENCRYPTED_TITLE_PREFIX} ${title}`;
        }
        
        return title;
    }

    /**
     * Cleans title by removing encryption indicators
     */
    static cleanTitle(title: string): string {
        return title.replace(new RegExp(`^${this.ENCRYPTED_TITLE_PREFIX}\\s*`), '');
    }

    /**
     * Validates title input
     */
    static validateTitle(title: string): { valid: boolean; error?: string } {
        if (!title || typeof title !== 'string') {
            return { valid: false, error: 'Title must be a non-empty string' };
        }
        
        const trimmed = title.trim();
        if (trimmed.length === 0) {
            return { valid: false, error: 'Title cannot be empty' };
        }
        
        if (trimmed.length > 200) {
            return { valid: false, error: 'Title too long (max 200 characters)' };
        }
        
        return { valid: true };
    }
}