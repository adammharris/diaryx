/**
 * Frontmatter Service
 * 
 * Handles parsing and extraction of YAML frontmatter from markdown content.
 * Supports the industry-standard frontmatter format used by static site generators
 * and markdown processors.
 * 
 * @description This service provides comprehensive frontmatter processing capabilities:
 * - YAML frontmatter parsing with error handling
 * - Tag extraction and normalization
 * - Metadata extraction for display purposes
 * - Content validation and parsing
 * 
 * Frontmatter format supported:
 * ```markdown
 * ---
 * title: "My Entry Title"
 * tags: [personal, work, important]
 * date: 2025-01-18
 * custom_field: "Custom value"
 * ---
 * 
 * # Entry content starts here
 * This is the actual markdown content...
 * ```
 * 
 * @example
 * ```typescript
 * const markdown = `---
 * title: "My Journal Entry"
 * tags: [personal, thoughts]
 * date: 2025-01-18
 * ---
 * 
 * # Today's Thoughts
 * This was an interesting day...`;
 * 
 * const parsed = FrontmatterService.parseContent(markdown);
 * console.log(parsed.frontmatter.title); // "My Journal Entry"
 * console.log(parsed.content); // "# Today's Thoughts\nThis was..."
 * 
 * const tags = FrontmatterService.extractTags(parsed.frontmatter);
 * console.log(tags); // ["personal", "thoughts"]
 * ```
 */

import * as yaml from 'js-yaml';

/**
 * Frontmatter data structure
 * 
 * Represents parsed YAML frontmatter with common fields and extensibility.
 */
export interface FrontmatterData {
    tags?: string[];
    title?: string;
    date?: string;
    [key: string]: any;
}

/**
 * Result of parsing markdown content with frontmatter
 */
export interface ParsedContent {
    frontmatter: FrontmatterData;
    content: string;
    hasFrontmatter: boolean;
}

/**
 * Frontmatter parsing and processing service
 * 
 * Provides static methods for handling YAML frontmatter in markdown documents.
 * All methods are designed to be safe and handle malformed input gracefully.
 */
export class FrontmatterService {
    /**
     * Parses YAML frontmatter from markdown content
     * 
     * Extracts and parses YAML frontmatter from the beginning of markdown content.
     * Handles malformed YAML gracefully by returning the original content.
     * 
     * @param {string} markdown - The markdown content to parse
     * @returns {ParsedContent} Object containing parsed frontmatter and content
     * 
     * @example
     * ```typescript
     * const markdown = `---
     * title: "Hello World"
     * tags: [greeting, test]
     * ---
     * # Content here`;
     * 
     * const result = FrontmatterService.parseContent(markdown);
     * console.log(result.frontmatter.title); // "Hello World"
     * console.log(result.hasFrontmatter); // true
     * console.log(result.content); // "# Content here"
     * ```
     */
    static parseContent(markdown: string): ParsedContent {
        try {
            // Check if content starts with frontmatter delimiter
            const trimmed = markdown.trim();
            if (!trimmed.startsWith('---')) {
                return {
                    frontmatter: {},
                    content: markdown,
                    hasFrontmatter: false
                };
            }

            // Find the end of frontmatter
            const lines = trimmed.split('\n');
            let endIndex = -1;
            
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() === '---') {
                    endIndex = i;
                    break;
                }
            }

            if (endIndex === -1) {
                // No closing delimiter found
                return {
                    frontmatter: {},
                    content: markdown,
                    hasFrontmatter: false
                };
            }

            // Extract YAML and content
            const yamlContent = lines.slice(1, endIndex).join('\n');
            const markdownContent = lines.slice(endIndex + 1).join('\n');

            // Parse YAML
            const frontmatter = yaml.load(yamlContent) as FrontmatterData || {};
            
            return {
                frontmatter,
                content: markdownContent,
                hasFrontmatter: Object.keys(frontmatter).length > 0
            };
        } catch (error) {
            console.warn('Failed to parse frontmatter:', error);
            // Return original content if parsing fails
            return {
                frontmatter: {},
                content: markdown,
                hasFrontmatter: false
            };
        }
    }

    /**
     * Extracts tags from frontmatter, normalizing them to lowercase strings
     * 
     * Handles various tag formats including arrays and comma-separated strings.
     * Normalizes all tags to lowercase and removes empty entries.
     * 
     * @param {FrontmatterData} frontmatter - The parsed frontmatter object
     * @returns {string[]} Array of normalized tag strings
     * 
     * @example
     * ```typescript
     * const frontmatter = {
     *   tags: ["Personal", "WORK", "Important"]
     * };
     * 
     * const tags = FrontmatterService.extractTags(frontmatter);
     * console.log(tags); // ["personal", "work", "important"]
     * 
     * // Also handles comma-separated strings
     * const frontmatter2 = {
     *   tags: "Personal, Work, Important"
     * };
     * 
     * const tags2 = FrontmatterService.extractTags(frontmatter2);
     * console.log(tags2); // ["personal", "work", "important"]
     * ```
     */
    static extractTags(frontmatter: FrontmatterData): string[] {
        if (!frontmatter.tags) {
            return [];
        }

        // Handle various tag formats
        let tags: string[] = [];
        
        if (Array.isArray(frontmatter.tags)) {
            tags = frontmatter.tags;
        } else if (typeof frontmatter.tags === 'string') {
            // Handle comma-separated tags
            tags = frontmatter.tags.split(',').map(tag => tag.trim());
        }

        // Normalize tags: lowercase, remove empty strings
        return tags
            .map(tag => String(tag).toLowerCase().trim())
            .filter(tag => tag.length > 0);
    }

    /**
     * Gets all metadata from frontmatter for display purposes
     * 
     * Extracts and formats all frontmatter fields for UI display.
     * Handles special cases like arrays, dates, and provides type information.
     * 
     * @param {FrontmatterData} frontmatter - The parsed frontmatter object
     * @returns {Array<{key: string, value: any, type: string}>} Formatted metadata entries
     * 
     * @example
     * ```typescript
     * const frontmatter = {
     *   title: "My Entry",
     *   tags: ["personal", "work"],
     *   date: "2025-01-18",
     *   priority: 5
     * };
     * 
     * const metadata = FrontmatterService.getMetadataInfo(frontmatter);
     * metadata.forEach(item => {
     *   console.log(`${item.key}: ${item.value} (${item.type})`);
     * });
     * // Output:
     * // Title: My Entry (string)
     * // Tags: personal, work (array)
     * // Date: 1/18/2025, 12:00:00 AM (date)
     * // Priority: 5 (number)
     * ```
     */
    static getMetadataInfo(frontmatter: FrontmatterData): Array<{key: string, value: any, type: string}> {
        const metadata: Array<{key: string, value: any, type: string}> = [];

        Object.entries(frontmatter).forEach(([key, value]) => {
            let displayValue = value;
            let type = typeof value;

            // Special handling for arrays (like tags)
            if (Array.isArray(value)) {
                displayValue = value.join(', ');
                type = 'array';
            }
            
            // Special handling for dates
            if (key.toLowerCase().includes('date') && typeof value === 'string') {
                try {
                    const date = new Date(value);
                    if (!isNaN(date.getTime())) {
                        displayValue = date.toLocaleString();
                        type = 'date';
                    }
                } catch {
                    // Keep original value if not a valid date
                }
            }

            metadata.push({
                key: key.charAt(0).toUpperCase() + key.slice(1), // Capitalize first letter
                value: displayValue,
                type
            });
        });

        return metadata;
    }

    /**
     * Checks if content has YAML frontmatter
     * 
     * Quick check to determine if markdown content contains frontmatter
     * by looking for the opening delimiter.
     * 
     * @param {string} markdown - The markdown content to check
     * @returns {boolean} True if content starts with frontmatter delimiter
     * 
     * @example
     * ```typescript
     * const withFrontmatter = `---
     * title: "Test"
     * ---
     * Content here`;
     * 
     * const withoutFrontmatter = `# Just a title
     * Regular content`;
     * 
     * console.log(FrontmatterService.hasFrontmatter(withFrontmatter)); // true
     * console.log(FrontmatterService.hasFrontmatter(withoutFrontmatter)); // false
     * ```
     */
    static hasFrontmatter(markdown: string): boolean {
        return markdown.trim().startsWith('---');
    }
}