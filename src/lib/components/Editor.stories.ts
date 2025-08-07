import type { Meta, StoryObj } from '@storybook/svelte';
import Editor from './Editor.svelte';
import { mockEntries, mockStorageService, mockAuthSessions, mockE2ESessions } from './editor/__mocks__/editor-mocks';
import { createMockActions, editorStoryParameters } from './editor/__mocks__/story-utils';

/**
 * Main Editor component integrating all editor functionality.
 * Provides complete journal editing experience with header, content, footer, and modals.
 */
const meta: Meta<Editor> = {
  title: 'Components/Editor',
  component: Editor,
  parameters: {
    ...editorStoryParameters,
    docs: {
      description: {
        component: 'The main journal editor component that orchestrates all editing functionality. Features entry loading, content editing, autosave, publishing, encryption support, and mobile optimization. Composed of EditorHeader, EditorContent, EditorFooter, and PublishModal components.',
      },
    },
  },
  argTypes: {
    storageService: {
      description: 'Storage service for loading and saving entries',
    },
    entryId: {
      control: 'text',
      description: 'ID of the entry to edit'
    },
    preloadedEntry: {
      description: 'Pre-loaded entry data to avoid double loading',
      control: 'object'
    },
    onclose: { 
      action: 'closed',
      description: 'Callback when editor is closed'
    },
    onsaved: { 
      action: 'saved',
      description: 'Callback when entry is saved'
    },
    onrenamed: { 
      action: 'renamed',
      description: 'Callback when entry is renamed'
    },
    onpublishtoggle: { 
      action: 'publishToggled',
      description: 'Callback when publish status changes'
    },
    onerror: { 
      action: 'error',
      description: 'Callback when errors occur'
    },
    onkeyboardtoggle: { 
      action: 'keyboardToggled',
      description: 'Callback when mobile keyboard visibility changes'
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockActions = createMockActions();

/**
 * Default editor with existing entry
 */
export const Default: Story = {
  args: {
    storageService: mockStorageService,
    entryId: mockEntries.existingEntry.id,
    preloadedEntry: mockEntries.existingEntry,
    onclose: mockActions.onclose,
    onsaved: mockActions.onsaved,
    onrenamed: mockActions.onrenamed,
    onpublishtoggle: mockActions.onpublishtoggle,
    onerror: mockActions.onerror,
    onkeyboardtoggle: mockActions.onkeyboardtoggle,
  },
};

/**
 * Editor with new/empty entry
 */
export const NewEntry: Story = {
  args: {
    storageService: mockStorageService,
    entryId: mockEntries.newEntry.id,
    preloadedEntry: mockEntries.newEntry,
    onclose: mockActions.onclose,
    onsaved: mockActions.onsaved,
    onrenamed: mockActions.onrenamed,
    onpublishtoggle: mockActions.onpublishtoggle,
    onerror: mockActions.onerror,
    onkeyboardtoggle: mockActions.onkeyboardtoggle,
  },
};

/**
 * Editor with long content entry for scrolling tests
 */
export const LongContent: Story = {
  args: {
    storageService: mockStorageService,
    entryId: mockEntries.longContentEntry.id,
    preloadedEntry: mockEntries.longContentEntry,
    onclose: mockActions.onclose,
    onsaved: mockActions.onsaved,
    onrenamed: mockActions.onrenamed,
    onpublishtoggle: mockActions.onpublishtoggle,
    onerror: mockActions.onerror,
    onkeyboardtoggle: mockActions.onkeyboardtoggle,
  },
};

/**
 * Editor with encrypted/locked entry
 */
export const EncryptedEntry: Story = {
  args: {
    storageService: mockStorageService,
    entryId: mockEntries.encryptedEntry.id,
    preloadedEntry: mockEntries.encryptedEntry,
    onclose: mockActions.onclose,
    onsaved: mockActions.onsaved,
    onrenamed: mockActions.onrenamed,
    onpublishtoggle: mockActions.onpublishtoggle,
    onerror: mockActions.onerror,
    onkeyboardtoggle: mockActions.onkeyboardtoggle,
  },
};

/**
 * Editor with published entry (with E2E unlocked)
 */
export const PublishedEntry: Story = {
  args: {
    storageService: mockStorageService,
    entryId: mockEntries.publishedEntry.id,
    preloadedEntry: mockEntries.publishedEntry,
    onclose: mockActions.onclose,
    onsaved: mockActions.onsaved,
    onrenamed: mockActions.onrenamed,
    onpublishtoggle: mockActions.onpublishtoggle,
    onerror: mockActions.onerror,
    onkeyboardtoggle: mockActions.onkeyboardtoggle,
  },
};

/**
 * Mobile editor experience
 */
export const MobileEditor: Story = {
  args: {
    storageService: mockStorageService,
    entryId: mockEntries.existingEntry.id,
    preloadedEntry: mockEntries.existingEntry,
    onclose: mockActions.onclose,
    onsaved: mockActions.onsaved,
    onrenamed: mockActions.onrenamed,
    onpublishtoggle: mockActions.onpublishtoggle,
    onerror: mockActions.onerror,
    onkeyboardtoggle: (data) => {
      console.log(`📱 Mobile keyboard ${data.visible ? 'shown' : 'hidden'}`);
    },
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile',
    },
  },
};

/**
 * Editor in preview mode
 */
export const PreviewMode: Story = {
  args: {
    storageService: mockStorageService,
    entryId: mockEntries.existingEntry.id,
    preloadedEntry: mockEntries.existingEntry,
    onclose: mockActions.onclose,
    onsaved: mockActions.onsaved,
    onrenamed: mockActions.onrenamed,
    onpublishtoggle: mockActions.onpublishtoggle,
    onerror: mockActions.onerror,
    onkeyboardtoggle: mockActions.onkeyboardtoggle,
  },
  // Note: Preview mode is controlled by the component's internal state
  // This story shows how to switch modes via the UI
};

/**
 * Editor loading state (no preloaded entry)
 */
export const LoadingEntry: Story = {
  args: {
    storageService: {
      ...mockStorageService,
      getEntry: async (id: string) => {
        // Simulate slow loading
        await new Promise(resolve => setTimeout(resolve, 2000));
        return mockEntries.existingEntry;
      }
    },
    entryId: mockEntries.existingEntry.id,
    // No preloadedEntry - will show loading state
    onclose: mockActions.onclose,
    onsaved: mockActions.onsaved,
    onrenamed: mockActions.onrenamed,
    onpublishtoggle: mockActions.onpublishtoggle,
    onerror: mockActions.onerror,
    onkeyboardtoggle: mockActions.onkeyboardtoggle,
  },
};

/**
 * No entry selected state
 */
export const NoEntry: Story = {
  args: {
    storageService: mockStorageService,
    entryId: null,
    onclose: mockActions.onclose,
    onsaved: mockActions.onsaved,
    onrenamed: mockActions.onrenamed,
    onpublishtoggle: mockActions.onpublishtoggle,
    onerror: mockActions.onerror,
    onkeyboardtoggle: mockActions.onkeyboardtoggle,
  },
};

/**
 * Save error scenario
 */
export const SaveError: Story = {
  args: {
    storageService: {
      ...mockStorageService,
      saveEntry: async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return false; // Simulate save failure
      }
    },
    entryId: mockEntries.existingEntry.id,
    preloadedEntry: mockEntries.existingEntry,
    onclose: mockActions.onclose,
    onsaved: mockActions.onsaved,
    onrenamed: mockActions.onrenamed,
    onpublishtoggle: mockActions.onpublishtoggle,
    onerror: (data) => {
      console.error(`❌ Error: ${data.title} - ${data.message}`);
    },
    onkeyboardtoggle: mockActions.onkeyboardtoggle,
  },
};

/**
 * Complete publishing workflow demonstration
 */
export const PublishingWorkflow: Story = {
  args: {
    storageService: mockStorageService,
    entryId: 'publishing-test',
    preloadedEntry: {
      ...mockEntries.existingEntry,
      id: 'publishing-test',
      title: 'Entry to Publish',
      content: `---
tags: [productivity, work]
title: "Entry to Publish"
---

# Publishing Test

This entry demonstrates the complete publishing workflow.

## Features
- Tag selection from frontmatter
- User assignment preview
- Complete publish/unpublish cycle

Try clicking the publish button to see the tag selection modal.`
    },
    onclose: mockActions.onclose,
    onsaved: mockActions.onsaved,
    onrenamed: mockActions.onrenamed,
    onpublishtoggle: (data) => {
      console.log(`🌐 Publishing ${data.publish ? 'enabled' : 'disabled'} for entry ${data.entryId}`);
      if (data.tagIds && data.tagIds.length > 0) {
        console.log(`📋 Selected tags: ${data.tagIds.join(', ')}`);
      }
    },
    onerror: mockActions.onerror,
    onkeyboardtoggle: mockActions.onkeyboardtoggle,
  },
};

/**
 * Autosave demonstration
 */
export const AutosaveDemo: Story = {
  args: {
    storageService: {
      ...mockStorageService,
      saveEntry: async (id: string, content: string) => {
        console.log(`💾 Autosaving entry ${id} (${content.length} characters)`);
        await new Promise(resolve => setTimeout(resolve, 800));
        return true;
      }
    },
    entryId: mockEntries.existingEntry.id,
    preloadedEntry: {
      ...mockEntries.existingEntry,
      content: 'Start typing to see autosave in action...'
    },
    onclose: mockActions.onclose,
    onsaved: (data) => {
      console.log(`✅ Entry saved: ${data.id} (${data.content.length} characters)`);
    },
    onrenamed: mockActions.onrenamed,
    onpublishtoggle: mockActions.onpublishtoggle,
    onerror: mockActions.onerror,
    onkeyboardtoggle: mockActions.onkeyboardtoggle,
  },
};

/**
 * Title editing demonstration
 */
export const TitleEditingDemo: Story = {
  args: {
    storageService: {
      ...mockStorageService,
      renameEntry: async (oldId: string, newTitle: string) => {
        console.log(`✏️  Renaming entry from ${oldId} to "${newTitle}"`);
        await new Promise(resolve => setTimeout(resolve, 600));
        return `${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`;
      }
    },
    entryId: mockEntries.existingEntry.id,
    preloadedEntry: {
      ...mockEntries.existingEntry,
      title: 'Click me to edit this title!'
    },
    onclose: mockActions.onclose,
    onsaved: mockActions.onsaved,
    onrenamed: (data) => {
      console.log(`🏷  Entry renamed from ${data.oldId} to ${data.newId}`);
    },
    onpublishtoggle: mockActions.onpublishtoggle,
    onerror: mockActions.onerror,
    onkeyboardtoggle: mockActions.onkeyboardtoggle,
  },
};

/**
 * Interactive demo showing all features
 */
export const InteractiveDemo: Story = {
  args: {
    storageService: mockStorageService,
    entryId: mockEntries.existingEntry.id,
    preloadedEntry: {
      ...mockEntries.existingEntry,
      title: 'Interactive Demo Entry',
      content: `# Welcome to the Interactive Demo!

This story demonstrates all the features of the refactored Editor component:

## What you can try:
1. **Edit the title** - Click on the title above to edit it
2. **Switch modes** - Use the Preview/Edit button to toggle views
3. **View entry info** - Click the info (ⓘ) button for metadata
4. **Publishing** - Try the publish button (simulated)
5. **Mobile experience** - Switch to mobile viewport

## Content editing:
- Type here to see **autosave** in action
- The word count updates in real-time
- Try adding *markdown* formatting

## Mobile features:
- Responsive design
- Virtual keyboard handling  
- Touch-optimized interface

---

*This content will autosave as you type!*`
    },
    onclose: () => console.log('🚪 Editor closed - would return to entry list'),
    onsaved: (data) => console.log(`💾 Auto-saved: ${data.content.split(' ').length} words`),
    onrenamed: (data) => console.log(`✏️  Renamed from "${data.oldId}" to "${data.newId}"`),
    onpublishtoggle: (data) => console.log(`📢 ${data.publish ? 'Published' : 'Unpublished'} entry with tags: ${data.tagIds?.join(', ') || 'none'}`),
    onerror: (data) => console.error(`⚠️  ${data.title}: ${data.message}`),
    onkeyboardtoggle: (data) => console.log(`⌨️  Mobile keyboard ${data.visible ? 'shown' : 'hidden'}`),
  },
};