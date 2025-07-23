/**
 * Service for generating entry previews
 */

export class PreviewService {
    private static readonly DEFAULT_PREVIEW_LENGTH = 150;

    /**
     * Creates a preview text from entry content
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
     * Updates preview for an entry (simplified - no encryption checks)
     */
    static updatePreview(_oldPreview: string, newContent: string): string {
        // No longer checking for encryption - just generate new preview
        return this.createPreview(newContent);
    }

    /**
     * Extracts first few words for a shorter preview
     */
    static createShortPreview(content: string, maxWords: number = 10): string {
        const preview = this.createPreview(content);
        const words = preview.split(/\s+/).slice(0, maxWords);
        return words.join(' ') + (words.length === maxWords ? '...' : '');
    }
}