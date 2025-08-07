import type { JournalEntry, JournalEntryMetadata } from '../../../storage/types';

/**
 * Mock journal entries for testing and stories
 */
export const mockEntries = {
    newEntry: {
        id: 'new-entry',
        title: 'New Entry',
        content: '',
        created_at: new Date().toISOString(),
        modified_at: new Date().toISOString(),
        file_path: 'new-entry.md',
        preview: '',
    } as JournalEntry,

    existingEntry: {
        id: '2025-01-20T10-30-00',
        title: 'My Daily Thoughts',
        content: `# Today's Reflection

Today was a particularly interesting day. I spent some time working on my journal application and made significant progress. The weather was perfect for a morning walk.

## Key Insights

- Productivity peaks in the morning
- Fresh air helps with creativity
- Small steps lead to big changes

I'm grateful for:
- Good health
- Meaningful work
- Beautiful weather`,
        created_at: '2025-01-20T10:30:00.000Z',
        modified_at: '2025-01-20T11:45:00.000Z',
        file_path: '2025-01-20T10-30-00.md',
        preview: "Today was a particularly interesting day. I spent some time working on my journal application and made significant progress...",
    } as JournalEntry,

    longContentEntry: {
        id: '2025-01-19T15-45-30',
        title: 'A Very Long Journal Entry About Everything That Happened Today',
        content: `# An Extremely Long Title That Should Test Text Wrapping and Layout

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

## Section One: Morning Thoughts

Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.

### Subsection: Details

Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit.

## Section Two: Afternoon Activities

Sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur.

### Code Example

\`\`\`javascript
function calculateTotal(items) {
    return items.reduce((sum, item) => sum + item.price, 0);
}
\`\`\`

## Section Three: Evening Reflection

At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga.

> "The only way to do great work is to love what you do." - Steve Jobs

Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus.`,
        created_at: '2025-01-19T15:45:30.000Z',
        modified_at: '2025-01-19T16:20:15.000Z',
        file_path: '2025-01-19T15-45-30.md',
        preview: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua...',
    } as JournalEntry,

    encryptedEntry: {
        id: '2025-01-18T09-15-20',
        title: 'Private Thoughts',
        content: '🔒 This entry is encrypted and requires authentication to view.',
        created_at: '2025-01-18T09:15:20.000Z',
        modified_at: '2025-01-18T09:15:20.000Z',
        file_path: '2025-01-18T09-15-20.md',
        preview: '🔒 This entry is encrypted and requires authentication to view.',
    } as JournalEntry,

    publishedEntry: {
        id: '2025-01-17T14-20-10',
        title: 'Published Article',
        content: `---
tags: [productivity, work, mindfulness]
title: "Published Article"
date: 2025-01-17
---

# Published Article

This entry has been published and is shared with others through selected tags.

## Content with Frontmatter

The YAML frontmatter above contains metadata that will be used for sharing and organization.

### Key Points

- This content is published
- It has associated tags
- It includes proper frontmatter formatting`,
        created_at: '2025-01-17T14:20:10.000Z',
        modified_at: '2025-01-17T14:20:10.000Z',
        file_path: '2025-01-17T14-20-10.md',
        preview: 'This entry has been published and is shared with others through selected tags.',
    } as JournalEntry,
};

/**
 * Mock storage service for testing and stories
 */
export const mockStorageService = {
    getEntry: async (id: string) => {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 300));
        
        switch (id) {
            case 'new-entry': return mockEntries.newEntry;
            case '2025-01-20T10-30-00': return mockEntries.existingEntry;
            case '2025-01-19T15-45-30': return mockEntries.longContentEntry;
            case '2025-01-18T09-15-20': return mockEntries.encryptedEntry;
            case '2025-01-17T14-20-10': return mockEntries.publishedEntry;
            default: return null;
        }
    },

    saveEntry: async (id: string, content: string) => {
        // Simulate save delay
        await new Promise(resolve => setTimeout(resolve, 200));
        return Math.random() > 0.1; // 90% success rate for testing
    },

    renameEntry: async (oldId: string, newTitle: string) => {
        // Simulate rename delay
        await new Promise(resolve => setTimeout(resolve, 400));
        const newId = `${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`;
        return newId;
    },

    syncEntryToCloud: async (id: string) => {
        // Simulate cloud sync
        await new Promise(resolve => setTimeout(resolve, 500));
        return true;
    },
};

/**
 * Mock authentication session states
 */
export const mockAuthSessions = {
    authenticated: {
        isAuthenticated: true,
        user: {
            id: 'user-123',
            email: 'user@example.com',
            name: 'Test User'
        }
    },
    unauthenticated: {
        isAuthenticated: false,
        user: null
    }
};

/**
 * Mock E2E encryption session states
 */
export const mockE2ESessions = {
    unlocked: {
        isUnlocked: true,
        hasKeys: true
    },
    locked: {
        isUnlocked: false,
        hasKeys: true
    },
    noKeys: {
        isUnlocked: false,
        hasKeys: false
    }
};

/**
 * Mock metadata store entries
 */
export const mockMetadataEntries = {
    '2025-01-20T10-30-00': {
        isPublished: false,
        isShared: false
    },
    '2025-01-17T14-20-10': {
        isPublished: true,
        isShared: false,
        cloudId: 'cloud-123'
    },
    '2025-01-18T09-15-20': {
        isPublished: true,
        isShared: false,
        cloudId: 'cloud-456'
    }
};

/**
 * Mock tags for testing publish modal
 */
export const mockTags = [
    {
        tag: { id: 'tag-1', name: 'productivity', color: '#4CAF50' },
        assignedUsers: [
            { id: 'user-1', email: 'john@example.com', name: 'John Doe' }
        ]
    },
    {
        tag: { id: 'tag-2', name: 'work', color: '#2196F3' },
        assignedUsers: [
            { id: 'user-1', email: 'john@example.com', name: 'John Doe' },
            { id: 'user-2', email: 'jane@example.com', name: 'Jane Smith' }
        ]
    },
    {
        tag: { id: 'tag-3', name: 'mindfulness', color: '#9C27B0' },
        assignedUsers: [
            { id: 'user-2', email: 'jane@example.com', name: 'Jane Smith' }
        ]
    },
    {
        tag: { id: 'tag-4', name: 'personal', color: '#FF5722' },
        assignedUsers: [
            { id: 'user-1', email: 'john@example.com', name: 'John Doe' },
            { id: 'user-2', email: 'jane@example.com', name: 'Jane Smith' },
            { id: 'user-3', email: 'bob@example.com', name: 'Bob Johnson' }
        ]
    }
];