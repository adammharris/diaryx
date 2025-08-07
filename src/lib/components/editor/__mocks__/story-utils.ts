import type { JournalEntry } from '../../../storage/types';
import { mockEntries, mockAuthSessions, mockE2ESessions, mockMetadataEntries } from './editor-mocks';

/**
 * Utility functions for creating mock data in Storybook stories
 */

/**
 * Creates a mock journal entry with optional overrides
 */
export function createMockEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
    return {
        ...mockEntries.existingEntry,
        ...overrides,
    };
}

/**
 * Creates a mock authentication session
 */
export function createMockAuthSession(isAuthenticated = false) {
    return isAuthenticated ? mockAuthSessions.authenticated : mockAuthSessions.unauthenticated;
}

/**
 * Creates a mock E2E encryption session
 */
export function createMockE2ESession(state: 'unlocked' | 'locked' | 'noKeys' = 'noKeys') {
    return mockE2ESessions[state];
}

/**
 * Creates mock keyboard visibility state
 */
export function createMockKeyboardState(isVisible = false, height = 0) {
    return {
        isKeyboardVisible: isVisible,
        keyboardHeight: height
    };
}

/**
 * Creates mock save status scenarios
 */
export const mockSaveStatuses = {
    idle: 'idle' as const,
    saving: 'saving' as const,
    saved: 'saved' as const,
    error: 'error' as const,
};

/**
 * Action creators for Storybook actions
 */
export const createMockActions = () => ({
    onclose: () => console.log('Editor closed'),
    onsaved: (data: { id: string; content: string }) => console.log('Entry saved:', data),
    onrenamed: (data: { oldId: string; newId: string }) => console.log('Entry renamed:', data),
    onpublishtoggle: (data: { entryId: string; publish: boolean; tagIds?: string[] }) => 
        console.log('Publish toggled:', data),
    onerror: (data: { title: string; message: string }) => console.log('Error occurred:', data),
    onkeyboardtoggle: (data: { visible: boolean }) => console.log('Keyboard toggled:', data),
});

/**
 * Mock metadata store for stories
 */
export function createMockMetadataStore(entries = mockMetadataEntries) {
    return {
        entries,
        getEntry: (id: string) => entries[id] || null,
    };
}

/**
 * Viewport configurations for responsive stories
 */
export const storyViewports = {
    mobile: {
        name: 'Mobile',
        styles: {
            width: '375px',
            height: '667px',
        },
    },
    tablet: {
        name: 'Tablet',
        styles: {
            width: '768px',
            height: '1024px',
        },
    },
    desktop: {
        name: 'Desktop',
        styles: {
            width: '1200px',
            height: '800px',
        },
    },
};

/**
 * Common story parameters for editor components
 */
export const editorStoryParameters = {
    layout: 'fullscreen' as const,
    viewport: {
        viewports: storyViewports,
    },
    docs: {
        inlineStories: false,
        iframeHeight: 600,
    },
};

/**
 * Mock event handlers for components
 */
export const mockHandlers = {
    onContentChange: (content: string) => console.log('Content changed:', content.length + ' characters'),
    onTitleEdit: () => console.log('Title edit started'),
    onTitleSave: () => console.log('Title saved'),
    onTitleCancel: () => console.log('Title edit cancelled'),
    onTitleKeydown: (event: KeyboardEvent) => console.log('Title keydown:', event.key),
    onClose: () => console.log('Component closed'),
    onTogglePublish: () => console.log('Publish toggled'),
    onShowInfo: () => console.log('Info modal shown'),
    onTogglePreview: () => console.log('Preview toggled'),
    onTextareaFocus: () => console.log('Textarea focused'),
    onTextareaBlur: () => console.log('Textarea blurred'),
    onTextareaInput: () => console.log('Textarea input'),
    onTextareaClick: () => console.log('Textarea clicked'),
    onUnlockEntry: () => console.log('Entry unlock requested'),
    onTagSelectionChange: (tagIds: string[]) => console.log('Tags selected:', tagIds),
    onPublishWithTags: () => console.log('Publishing with tags'),
    onCancel: () => console.log('Operation cancelled'),
};

/**
 * Creates a delay for simulating async operations in stories
 */
export function createDelay(ms = 1000): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Story decorators for common setups
 */
export const withMobileViewport = (Story: any) => ({
    Component: Story,
    parameters: {
        viewport: {
            defaultViewport: 'mobile',
        },
    },
});

export const withDarkTheme = (Story: any) => ({
    Component: Story,
    parameters: {
        backgrounds: {
            default: 'dark',
        },
        theme: 'dark',
    },
});

/**
 * Test data for complex scenarios
 */
export const complexScenarios = {
    publishingWorkflow: {
        entry: createMockEntry({
            id: 'publishing-test',
            title: 'Entry to Publish',
            content: `---
tags: [productivity, work]
---

# Publishing Test

This entry will be used to test the publishing workflow.`
        }),
        frontmatterTags: ['productivity', 'work'],
        selectedTags: ['tag-1', 'tag-2']
    },

    errorScenarios: {
        saveError: {
            storageService: {
                ...mockEntries,
                saveEntry: async () => {
                    await createDelay(500);
                    return false; // Force save failure
                }
            }
        },
        loadError: {
            storageService: {
                getEntry: async () => {
                    await createDelay(500);
                    throw new Error('Failed to load entry');
                }
            }
        }
    }
};