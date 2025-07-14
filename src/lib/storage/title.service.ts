/**
 * Service for handling entry titles and title extraction
 */

import { isEncrypted } from '../utils/crypto.js';
import type { JournalEntry } from './types.js';

export class TitleService {
    private static readonly ENCRYPTED_TITLE_PREFIX = '🔒';
    private static readonly ENCRYPTED_CONTENT_PATTERN = /^[A-Za-z0-9+/=]{20,}/;
    private static readonly LONG_TITLE_THRESHOLD = 50;

    /**
     * Extracts title from markdown content (first heading)
     */
    static extractTitleFromContent(content: string): string | null {
        // Don't extract title from encrypted content
        if (isEncrypted(content)) {
            return null;
        }
        
        const firstLine = content.split('\n')[0];
        if (firstLine.startsWith('#')) {
            return firstLine.replace(/^#+\s*/, '').trim();
        }
        return null;
    }

    /**
     * Creates a fallback title for encrypted entries
     */
    static createFallbackTitle(entry: JournalEntry): string {
        // For encrypted entries, use a readable filename-based title
        if (isEncrypted(entry.content)) {
            // If the current title looks like encrypted content, create a fallback
            if (this.titleLooksEncrypted(entry.title)) {
                const readableTitle = this.createReadableTitleFromPath(entry.file_path, entry.id);
                return `${this.ENCRYPTED_TITLE_PREFIX} ${readableTitle}`;
            }
        }
        return entry.title;
    }

    /**
     * Checks if a title appears to be encrypted content
     */
    static titleLooksEncrypted(title: string): boolean {
        return (
            title.length > this.LONG_TITLE_THRESHOLD ||
            this.ENCRYPTED_CONTENT_PATTERN.test(title)
        );
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
     * Updates title from decrypted content
     */
    static updateTitleFromDecryptedContent(currentTitle: string, decryptedContent: string): string {
        const extractedTitle = this.extractTitleFromContent(decryptedContent);
        return extractedTitle || currentTitle;
    }

    /**
     * Checks if an entry has a proper title (not encrypted content)
     */
    static hasProperTitle(entry: JournalEntry): boolean {
        if (isEncrypted(entry.content)) {
            return !this.titleLooksEncrypted(entry.title);
        }
        return true;
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