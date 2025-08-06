import type { Meta, StoryObj } from '@storybook/svelte';
import EntryCard from './EntryCard.svelte';
import type { JournalEntryMetadata } from '../storage/types';

/**
 * EntryCard component for displaying journal entry previews in a list.
 * Shows title, preview, date, and encryption status with interactive hover states.
 */
const meta: Meta<EntryCard> = {
  title: 'Components/EntryCard',
  component: EntryCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'A card component for displaying journal entry metadata. Features responsive design, encryption indicators, and smooth hover animations. Integrates with the metadata store for real-time updates.',
      },
    },
  },
  argTypes: {
    entry: {
      description: 'Journal entry metadata object',
      control: 'object'
    },
    onselect: { 
      action: 'selected',
      description: 'Callback when entry is clicked/selected'
    },
    ondelete: { 
      action: 'deleted',
      description: 'Callback when delete button is clicked'
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Sample entry data for stories
const sampleEntry: JournalEntryMetadata = {
  id: '2025-01-20T10-30-00',
  title: 'My First Journal Entry',
  created_at: '2025-01-20T10:30:00.000Z',
  modified_at: '2025-01-20T10:30:00.000Z',
  file_path: '2025-01-20T10-30-00.md',
  preview: 'Today was a great day! I started working on my journal application and made significant progress. The weather was perfect for a morning walk, and I had some interesting thoughts about productivity and creativity.',
  isPublished: false,
  isShared: false,
};

const longContentEntry: JournalEntryMetadata = {
  id: '2025-01-19T15-45-30',
  title: 'A Very Long Title That Should Wrap Properly and Test the Layout Responsiveness',
  created_at: '2025-01-19T15:45:30.000Z',
  modified_at: '2025-01-19T16:20:15.000Z',
  file_path: '2025-01-19T15-45-30.md',
  preview: 'This is a very long preview text that should demonstrate how the component handles longer content. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  isPublished: false,
  isShared: false,
};

const publishedEntry: JournalEntryMetadata = {
  id: '2025-01-18T09-15-20',
  title: 'Published Entry with E2E Encryption',
  created_at: '2025-01-18T09:15:20.000Z',
  modified_at: '2025-01-18T09:15:20.000Z',
  file_path: '2025-01-18T09-15-20.md',
  preview: '🔒 This entry is encrypted and requires authentication to view.',
  isPublished: true,
  isShared: false,
  cloudId: 'cloud-123',
};

const sharedEntry: JournalEntryMetadata = {
  id: 'shared-456',
  title: 'Shared Entry from Another User',
  created_at: '2025-01-17T14:20:10.000Z',
  modified_at: '2025-01-17T14:20:10.000Z',
  file_path: 'shared-456.md',
  preview: 'This is a shared entry from another user. It demonstrates how the component handles entries that are not owned by the current user.',
  isPublished: true,
  isShared: true,
  cloudId: 'shared-456',
};

const shortEntry: JournalEntryMetadata = {
  id: '2025-01-21T08-00-00',
  title: 'Quick Note',
  created_at: '2025-01-21T08:00:00.000Z',
  modified_at: '2025-01-21T08:00:00.000Z',
  file_path: '2025-01-21T08-00-00.md',
  preview: 'Just a quick note.',
  isPublished: false,
  isShared: false,
};

/**
 * Default entry card with typical content
 */
export const Default: Story = {
  args: {
    entry: sampleEntry,
  },
};

/**
 * Entry with long title and content to test text wrapping
 */
export const LongContent: Story = {
  args: {
    entry: longContentEntry,
  },
};

/**
 * Published entry with encryption indicator
 */
export const Published: Story = {
  args: {
    entry: publishedEntry,
  },
};

/**
 * Shared entry from another user
 */
export const Shared: Story = {
  args: {
    entry: sharedEntry,
  },
};

/**
 * Entry with minimal content
 */
export const Short: Story = {
  args: {
    entry: shortEntry,
  },
};

/**
 * Entry with recent modification time
 */
export const Recent: Story = {
  args: {
    entry: {
      ...sampleEntry,
      id: '2025-01-20T16-45-30',
      title: 'Just Updated',
      modified_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
      preview: 'This entry was just updated a few minutes ago.',
    },
  },
};

/**
 * Collection of multiple entry cards to show list layout
 */
export const MultipleEntries: Story = {
  render: () => ({
    Component: EntryCard,
    props: {},
  }),
  decorators: [
    () => ({
      template: `
        <div style="max-width: 600px; margin: 0 auto;">
          <EntryCard entry="${JSON.stringify(sampleEntry).replace(/"/g, '&quot;')}" />
          <EntryCard entry="${JSON.stringify(longContentEntry).replace(/"/g, '&quot;')}" />
          <EntryCard entry="${JSON.stringify(publishedEntry).replace(/"/g, '&quot;')}" />
          <EntryCard entry="${JSON.stringify(shortEntry).replace(/"/g, '&quot;')}" />
        </div>
      `,
    }),
  ],
};

/**
 * Entry card in dark theme
 */
export const DarkTheme: Story = {
  args: {
    entry: sampleEntry,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};