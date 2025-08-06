/**
 * Preview Service
 * 
 * Generates text previews from journal entry content for display in lists and cards.
 * Handles markdown cleanup and content truncation with intelligent formatting.
 * 
 * @description This service creates readable previews by:
 * - Removing markdown formatting characters for cleaner display
 * - Truncating content to specified lengths
 * - Adding appropriate ellipsis indicators
 * - Supporting both character-based and word-based truncation
 * 
 * @example
 * ```typescript
 * const content = `# My Entry\n\nThis is **bold** text with *emphasis*.`;
 * 
 * // Create standard preview (150 chars)
 * const preview = PreviewService.createPreview(content);
 * console.log(preview); // "My Entry This is bold text with emphasis..."
 * 
 * // Create short word-based preview (10 words)
 * const shortPreview = PreviewService.createShortPreview(content, 10);
 * console.log(shortPreview); // "My Entry This is bold text with emphasis..."
 * ```
 */

/**
 * Preview generation and formatting service
 * 
 * Provides static methods for creating text previews from journal entry content.
 */
export class PreviewService {
    private static readonly DEFAULT_PREVIEW_LENGTH = 150;

    /**
     * Creates a preview text from entry content
     * 
     * Generates a clean, readable preview by removing markdown formatting
     * and truncating to the specified length with ellipsis if needed.
     * 
     * @param {string} content - The full entry content
     * @param {number} [maxLength=150] - Maximum length of the preview
     * @returns {string} Formatted preview text
     * 
     * @example
     * ```typescript
     * const content = `# Journal Entry\n\nToday I learned about **TypeScript**!`;
     * const preview = PreviewService.createPreview(content, 50);
     * console.log(preview); // "Journal Entry Today I learned about TypeScrip..."
     * ```
     */
    static createPreview(content: string, maxLength: number = this.DEFAULT_PREVIEW_LENGTH): string {
        // Individual entry encryption has been removed - now using E2E encryption system
        // Just generate preview from content as-is
        
        // Remove markdown formatting characters for cleaner preview
        const cleanContent = content.replace(/[#*_`]/g, '').trim();
        
        // Truncate to desired length
        const preview = cleanContent.substring(0, maxLength);
        
        // Add ellipsis if content was truncated
        return preview + (cleanContent.length > maxLength ? '...' : '');
    }

    /**
     * Updates preview for an entry
     * 
     * Generates a new preview from updated content. Simplified method that
     * doesn't check encryption status.
     * 
     * @param {string} _oldPreview - Previous preview (unused, kept for compatibility)
     * @param {string} newContent - Updated entry content
     * @returns {string} New preview text
     * 
     * @example
     * ```typescript
     * const newPreview = PreviewService.updatePreview(
     *   oldPreview,
     *   'Updated entry content here...'
     * );
     * ```
     */
    static updatePreview(_oldPreview: string, newContent: string): string {
        // No longer checking for encryption - just generate new preview
        return this.createPreview(newContent);
    }

    /**
     * Extracts first few words for a shorter preview
     * 
     * Creates a word-based preview instead of character-based, useful for
     * compact display scenarios like mobile lists or notification previews.
     * 
     * @param {string} content - The full entry content
     * @param {number} [maxWords=10] - Maximum number of words to include
     * @returns {string} Word-limited preview text
     * 
     * @example
     * ```typescript
     * const content = 'This is a long journal entry with many words to truncate.';
     * const shortPreview = PreviewService.createShortPreview(content, 5);
     * console.log(shortPreview); // "This is a long journal..."
     * ```
     */
    static createShortPreview(content: string, maxWords: number = 10): string {
        const preview = this.createPreview(content);
        const words = preview.split(/\s+/).slice(0, maxWords);
        return words.join(' ') + (words.length === maxWords ? '...' : '');
    }
}