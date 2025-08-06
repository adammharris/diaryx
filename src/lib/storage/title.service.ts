/**
 * Title Service
 * 
 * Handles journal entry title processing, validation, and display formatting.
 * Provides utilities for creating readable titles from various sources.
 * 
 * @description This service manages title-related operations including:
 * - Fallback title generation for entries without explicit titles
 * - Converting file paths to human-readable titles
 * - Title validation with length and format constraints
 * - Display title formatting for UI components
 * 
 * @example
 * ```typescript
 * // Validate a title
 * const validation = TitleService.validateTitle('My Journal Entry');
 * if (validation.valid) {
 *   console.log('Title is valid');
 * } else {
 *   console.error('Invalid title:', validation.error);
 * }
 * 
 * // Create readable title from filename
 * const title = TitleService.createReadableTitleFromPath(
 *   '/path/to/my-journal-entry.md',
 *   'fallback-id'
 * );
 * console.log(title); // "My Journal Entry"
 * ```
 */

import type { JournalEntry } from './types.js';

/**
 * Title processing and validation service
 * 
 * Provides static methods for handling journal entry titles across the application.
 */
export class TitleService {
    /**
     * Creates a fallback title for entries
     * 
     * Returns the entry's existing title. Used for compatibility with
     * the previous encryption system.
     * 
     * @param {JournalEntry} entry - The journal entry
     * @returns {string} The entry's title
     * 
     * @example
     * ```typescript
     * const title = TitleService.createFallbackTitle(entry);
     * ```
     */
    static createFallbackTitle(entry: JournalEntry): string {
        // Since titles are now filename-based, just return the entry title
        // Individual entry encryption has been removed - now using E2E encryption system
        return entry.title;
    }

    /**
     * Creates a readable title from file path or ID
     * 
     * Converts a file path to a human-readable title by extracting the filename,
     * removing the extension, and formatting it with proper capitalization.
     * 
     * @param {string} filePath - The file path to process
     * @param {string} fallbackId - Fallback ID if path extraction fails
     * @returns {string} Human-readable title
     * 
     * @example
     * ```typescript
     * const title = TitleService.createReadableTitleFromPath(
     *   '/documents/my-daily-thoughts.md',
     *   'entry-123'
     * );
     * console.log(title); // "My Daily Thoughts"
     * ```
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
     * 
     * Returns the appropriate title for displaying in user interface components.
     * 
     * @param {JournalEntry} entry - The journal entry
     * @returns {string} Display-ready title
     * 
     * @example
     * ```typescript
     * const displayTitle = TitleService.getDisplayTitle(entry);
     * // Use in component: <h1>{displayTitle}</h1>
     * ```
     */
    static getDisplayTitle(entry: JournalEntry): string {
        // No longer using individual entry encryption - titles are just returned as-is
        return this.createFallbackTitle(entry);
    }

    /**
     * Cleans title (no longer needed but kept for compatibility)
     * 
     * Returns the title as-is. Kept for backward compatibility.
     * 
     * @param {string} title - The title to clean
     * @returns {string} The unchanged title
     * 
     * @deprecated This method is kept for compatibility but no longer performs cleaning
     */
    static cleanTitle(title: string): string {
        return title;
    }

    /**
     * Validates title input
     * 
     * Checks if a title meets the application's requirements including
     * type checking, length constraints, and content validation.
     * 
     * @param {string} title - The title to validate
     * @returns {Object} Validation result
     * @returns {boolean} returns.valid - Whether the title is valid
     * @returns {string} [returns.error] - Error message if validation fails
     * 
     * @example
     * ```typescript
     * const validation = TitleService.validateTitle('My Entry Title');
     * if (!validation.valid) {
     *   alert(`Invalid title: ${validation.error}`);
     *   return;
     * }
     * 
     * // Title is valid, proceed with saving
     * ```
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