/**
 * Service for handling entry titles (filename-based)
 */

import type { JournalEntry } from './types.js';

export class TitleService {
    /**
     * Creates a fallback title for entries
     */
    static createFallbackTitle(entry: JournalEntry): string {
        // Since titles are now filename-based, just return the entry title
        // Individual entry encryption has been removed - now using E2E encryption system
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
     * Gets display title for UI
     */
    static getDisplayTitle(entry: JournalEntry): string {
        // No longer using individual entry encryption - titles are just returned as-is
        return this.createFallbackTitle(entry);
    }

    /**
     * Cleans title (no longer needed but kept for compatibility)
     */
    static cleanTitle(title: string): string {
        return title;
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