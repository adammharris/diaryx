/**
 * Service for generating entry previews
 */

import { isEncrypted } from '../utils/crypto.js';

export class PreviewService {
    private static readonly DEFAULT_PREVIEW_LENGTH = 150;
    private static readonly ENCRYPTED_PREVIEW_TEXT = '🔒 This entry is encrypted and requires a password to view';

    /**
     * Creates a preview text from entry content
     */
    static createPreview(content: string, maxLength: number = this.DEFAULT_PREVIEW_LENGTH): string {
        // Check if content is encrypted
        if (isEncrypted(content)) {
            return this.ENCRYPTED_PREVIEW_TEXT;
        }
        
        // Remove markdown formatting characters for cleaner preview
        const cleanContent = content.replace(/[#*_`]/g, '').trim();
        
        // Truncate to desired length
        const preview = cleanContent.substring(0, maxLength);
        
        // Add ellipsis if content was truncated
        return preview + (cleanContent.length > maxLength ? '...' : '');
    }

    /**
     * Checks if a preview indicates encrypted content
     */
    static isEncryptedPreview(preview: string): boolean {
        return preview === this.ENCRYPTED_PREVIEW_TEXT;
    }

    /**
     * Updates preview for an entry, preserving encryption indicators
     */
    static updatePreview(oldPreview: string, newContent: string): string {
        // If old preview was encrypted and new content is still encrypted, keep the indicator
        if (this.isEncryptedPreview(oldPreview) && isEncrypted(newContent)) {
            return this.ENCRYPTED_PREVIEW_TEXT;
        }
        
        // Generate new preview
        return this.createPreview(newContent);
    }

    /**
     * Extracts first few words for a shorter preview
     */
    static createShortPreview(content: string, maxWords: number = 10): string {
        const preview = this.createPreview(content);
        
        if (this.isEncryptedPreview(preview)) {
            return '🔒 Encrypted';
        }
        
        const words = preview.split(/\s+/).slice(0, maxWords);
        return words.join(' ') + (words.length === maxWords ? '...' : '');
    }
}