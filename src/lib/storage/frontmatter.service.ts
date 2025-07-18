/**
 * Service for parsing YAML frontmatter from markdown content
 */

import * as yaml from 'js-yaml';

export interface FrontmatterData {
    tags?: string[];
    title?: string;
    date?: string;
    [key: string]: any;
}

export interface ParsedContent {
    frontmatter: FrontmatterData;
    content: string;
    hasFrontmatter: boolean;
}

export class FrontmatterService {
    /**
     * Parses YAML frontmatter from markdown content
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
     */
    static hasFrontmatter(markdown: string): boolean {
        return markdown.trim().startsWith('---');
    }
}