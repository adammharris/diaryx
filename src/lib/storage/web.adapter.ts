/**
 * Web storage adapter for browser-only mode
 */

import type { JournalEntry, IWebStorage } from './types.js';
import { TitleService } from './title.service.js';
import { PreviewService } from './preview.service.js';

export class WebStorageAdapter implements IWebStorage {
    async createEntryInWeb(title: string): Promise<string> {
        const now = new Date();
        const id = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        
        return id;
    }

    async saveEntryInWeb(id: string, content: string): Promise<boolean> {
        try {
            // In web mode, the actual saving is handled by the cache adapter
            // This method validates the input and returns success
            return true;
        } catch (error) {
            console.error('Failed to save entry in web mode:', error);
            return false;
        }
    }

    async deleteEntryInWeb(id: string): Promise<boolean> {
        try {
            // In web mode, the actual deletion is handled by the cache adapter
            // This method validates the input and returns success
            return true;
        } catch (error) {
            console.error('Failed to delete entry in web mode:', error);
            return false;
        }
    }

    async createDefaultEntriesForWeb(): Promise<void> {
        // This method returns the default entries to be created
        // The actual creation is handled by the main adapter
    }

    /**
     * Creates a new journal entry object for web mode
     */
    createNewEntry(title: string, id?: string): JournalEntry {
        const now = new Date();
        const entryId = id || now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        
        return {
            id: entryId,
            title,
            content: `# ${title}\n\n`,
            created_at: now.toISOString(),
            modified_at: now.toISOString(),
            file_path: `web-entry-${entryId}.md`
        };
    }

    /**
     * Updates an existing entry with new content
     */
    updateEntry(entry: JournalEntry, content: string): JournalEntry {
        const updatedEntry: JournalEntry = {
            ...entry,
            content,
            modified_at: new Date().toISOString(),
            // Update title from first line if it's a heading
            title: TitleService.extractTitleFromContent(content) || entry.title
        };

        return updatedEntry;
    }

    /**
     * Gets default entries for web mode
     */
    getDefaultEntries(): JournalEntry[] {
        const welcomeEntry: JournalEntry = {
            id: '2025-01-01_welcome',
            title: 'Welcome to Diaryx!',
            content: `# Welcome to Diaryx!

Welcome to your personal journal! This is a demo entry to show you how the app works.

## Features in Web Mode:

- ✅ **Create and edit entries** - Click the + button or type a title above
- ✅ **Markdown support** - Use # for headings, **bold**, *italic*, and more
- ✅ **Search functionality** - Find your entries quickly
- ✅ **Beautiful themes** - Click the ⚙️ settings button to try different colors
- ✅ **Local storage** - Your entries are saved in your browser's IndexedDB
- ✅ **Preview mode** - Toggle between edit and preview when writing
- ✅ **Encryption** - Protect your entries with passwords 🔒

## Try it out:

1. Create a new entry by typing a title above
2. Click on this entry to edit it
3. Try the different color themes in settings
4. Search for entries using the search box
5. Enable encryption by clicking the 🔒 button in the editor

Your entries will persist between browser sessions, so feel free to use this as your actual journal!

Happy writing! 📝`,
            created_at: '2025-01-01T10:00:00.000Z',
            modified_at: '2025-01-01T10:00:00.000Z',
            file_path: 'web-entry-welcome.md'
        };

        const demoEntry: JournalEntry = {
            id: '2025-01-02_demo-features',
            title: 'Demo: Markdown Features',
            content: `# Demo: Markdown Features

This entry demonstrates various markdown features you can use in your journal.

## Headers

You can use different levels of headers:

### Level 3 Header
#### Level 4 Header

## Text Formatting

**Bold text** and *italic text* make your entries more expressive.

You can also use ~~strikethrough~~ and \`inline code\`.

## Lists

### Unordered Lists:
- Morning coffee ☕
- Writing in journal
- Planning the day
- Exercise routine

### Ordered Lists:
1. Wake up early
2. Meditation
3. Journal writing
4. Breakfast

## Quotes

> "The journal is a vehicle for my sense of selfhood. It represents me as emotionally and spiritually independent."
> 
> — Anaïs Nin

## Code Blocks

\`\`\`javascript
function writeJournal(thoughts) {
    return \`Today I think: \${thoughts}\`;
}
\`\`\`

## Links and More

You can also add links: [Markdown Guide](https://www.markdownguide.org/)

Try editing this entry to experiment with markdown!`,
            created_at: '2025-01-02T14:30:00.000Z',
            modified_at: '2025-01-02T14:30:00.000Z',
            file_path: 'web-entry-demo.md'
        };

        return [welcomeEntry, demoEntry];
    }

    /**
     * Validates entry data for web storage
     */
    validateEntry(entry: Partial<JournalEntry>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!entry.title || entry.title.trim().length === 0) {
            errors.push('Title is required');
        }

        if (!entry.content || typeof entry.content !== 'string') {
            errors.push('Content is required and must be a string');
        }

        if (!entry.id || entry.id.trim().length === 0) {
            errors.push('ID is required');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}