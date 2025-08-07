import type { Meta, StoryObj } from '@storybook/svelte';
import PublishModal from './PublishModal.svelte';
import { mockEntries, mockTags } from './__mocks__/editor-mocks';
import { mockHandlers, editorStoryParameters } from './__mocks__/story-utils';

/**
 * PublishModal component for sharing journal entries with selected tags.
 * Allows users to select tags for publishing entries to specific user groups.
 */
const meta: Meta<PublishModal> = {
  title: 'Components/Editor/PublishModal',
  component: PublishModal,
  parameters: {
    ...editorStoryParameters,
    docs: {
      description: {
        component: 'A modal dialog for publishing journal entries with tag selection. Integrates with the TagSelector component to allow users to choose which tags (and their associated users) should have access to the entry.',
      },
    },
  },
  argTypes: {
    isVisible: { 
      control: 'boolean',
      description: 'Controls whether the modal is visible'
    },
    entry: {
      description: 'The journal entry to be published',
      control: 'object'
    },
    entryId: {
      control: 'text',
      description: 'ID of the entry being published'
    },
    selectedTagIds: {
      control: 'object',
      description: 'Array of currently selected tag IDs'
    },
    frontmatterTags: {
      control: 'object', 
      description: 'Tags extracted from YAML frontmatter in the entry'
    },
    onTagSelectionChange: { 
      action: 'tagSelectionChanged',
      description: 'Callback when tag selection changes'
    },
    onPublishWithTags: { 
      action: 'publishedWithTags',
      description: 'Callback when publish button is clicked'
    },
    onCancel: { 
      action: 'cancelled',
      description: 'Callback when cancel button is clicked or modal is closed'
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default publish modal with basic entry and no pre-selected tags
 */
export const Default: Story = {
  args: {
    isVisible: true,
    entry: mockEntries.existingEntry,
    entryId: mockEntries.existingEntry.id,
    selectedTagIds: [],
    frontmatterTags: [],
    onTagSelectionChange: mockHandlers.onTagSelectionChange,
    onPublishWithTags: mockHandlers.onPublishWithTags,
    onCancel: mockHandlers.onCancel,
  },
};

/**
 * Modal with tags pre-selected from frontmatter
 */
export const WithPreselectedTags: Story = {
  args: {
    isVisible: true,
    entry: mockEntries.publishedEntry,
    entryId: mockEntries.publishedEntry.id,
    selectedTagIds: ['tag-1', 'tag-2'],
    frontmatterTags: ['productivity', 'work'],
    onTagSelectionChange: mockHandlers.onTagSelectionChange,
    onPublishWithTags: mockHandlers.onPublishWithTags,
    onCancel: mockHandlers.onCancel,
  },
};

/**
 * Modal showing frontmatter tags that need to be matched to backend tags
 */
export const FrontmatterTags: Story = {
  args: {
    isVisible: true,
    entry: {
      ...mockEntries.publishedEntry,
      content: `---
tags: [productivity, mindfulness, work, personal]
title: "Entry with Many Tags"
---

# Entry with Multiple Tags

This entry has several tags defined in the frontmatter that should be pre-populated in the tag selector.`
    },
    entryId: mockEntries.publishedEntry.id,
    selectedTagIds: [],
    frontmatterTags: ['productivity', 'mindfulness', 'work', 'personal'],
    onTagSelectionChange: mockHandlers.onTagSelectionChange,
    onPublishWithTags: mockHandlers.onPublishWithTags,
    onCancel: mockHandlers.onCancel,
  },
};

/**
 * Modal with a very long entry title to test layout
 */
export const LongEntryTitle: Story = {
  args: {
    isVisible: true,
    entry: mockEntries.longContentEntry,
    entryId: mockEntries.longContentEntry.id,
    selectedTagIds: ['tag-1'],
    frontmatterTags: [],
    onTagSelectionChange: mockHandlers.onTagSelectionChange,
    onPublishWithTags: mockHandlers.onPublishWithTags,
    onCancel: mockHandlers.onCancel,
  },
};

/**
 * Modal with no tags selected (publish button should be disabled)
 */
export const NoTagsSelected: Story = {
  args: {
    isVisible: true,
    entry: mockEntries.existingEntry,
    entryId: mockEntries.existingEntry.id,
    selectedTagIds: [],
    frontmatterTags: [],
    onTagSelectionChange: mockHandlers.onTagSelectionChange,
    onPublishWithTags: mockHandlers.onPublishWithTags,
    onCancel: mockHandlers.onCancel,
  },
};

/**
 * Modal with maximum tags selected to test UI limits
 */
export const ManyTagsSelected: Story = {
  args: {
    isVisible: true,
    entry: mockEntries.existingEntry,
    entryId: mockEntries.existingEntry.id,
    selectedTagIds: ['tag-1', 'tag-2', 'tag-3', 'tag-4'],
    frontmatterTags: ['productivity', 'work', 'mindfulness', 'personal'],
    onTagSelectionChange: mockHandlers.onTagSelectionChange,
    onPublishWithTags: mockHandlers.onPublishWithTags,
    onCancel: mockHandlers.onCancel,
  },
};

/**
 * Mobile view of the publish modal (full screen)
 */
export const MobileView: Story = {
  args: {
    isVisible: true,
    entry: mockEntries.existingEntry,
    entryId: mockEntries.existingEntry.id,
    selectedTagIds: ['tag-1', 'tag-2'],
    frontmatterTags: ['productivity', 'work'],
    onTagSelectionChange: mockHandlers.onTagSelectionChange,
    onPublishWithTags: mockHandlers.onPublishWithTags,
    onCancel: mockHandlers.onCancel,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile',
    },
  },
};

/**
 * Hidden modal for testing visibility toggle
 */
export const Hidden: Story = {
  args: {
    isVisible: false,
    entry: mockEntries.existingEntry,
    entryId: mockEntries.existingEntry.id,
    selectedTagIds: [],
    frontmatterTags: [],
    onTagSelectionChange: mockHandlers.onTagSelectionChange,
    onPublishWithTags: mockHandlers.onPublishWithTags,
    onCancel: mockHandlers.onCancel,
  },
};

/**
 * Modal with untitled entry
 */
export const UntitledEntry: Story = {
  args: {
    isVisible: true,
    entry: {
      ...mockEntries.newEntry,
      title: '',
    },
    entryId: mockEntries.newEntry.id,
    selectedTagIds: ['tag-1'],
    frontmatterTags: [],
    onTagSelectionChange: mockHandlers.onTagSelectionChange,
    onPublishWithTags: mockHandlers.onPublishWithTags,
    onCancel: mockHandlers.onCancel,
  },
};

/**
 * Interactive demo showing complete publish workflow
 */
export const PublishWorkflowDemo: Story = {
  args: {
    isVisible: true,
    entry: {
      ...mockEntries.existingEntry,
      title: 'My Productivity Tips',
      content: `---
tags: [productivity, work]
title: "My Productivity Tips"
---

# My Productivity Tips

Here are some tips I've learned about staying productive while working remotely.

## Morning Routine
- Start with a clear plan
- Prioritize important tasks
- Minimize distractions

## Tools I Use
- Task management app
- Time blocking
- Regular breaks`
    },
    entryId: 'productivity-tips',
    selectedTagIds: [],
    frontmatterTags: ['productivity', 'work'],
    onTagSelectionChange: (tagIds: string[]) => {
      console.log('Selected tags for sharing:', tagIds);
      // In a real app, this would update the component state
    },
    onPublishWithTags: () => {
      console.log('Entry published! It will be shared with users assigned to the selected tags.');
      // In a real app, this would trigger the publishing process
    },
    onCancel: () => {
      console.log('Publishing cancelled. Entry remains as draft.');
    },
  },
};