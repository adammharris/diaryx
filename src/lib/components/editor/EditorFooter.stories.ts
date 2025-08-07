import type { Meta, StoryObj } from '@storybook/svelte';
import EditorFooter from './EditorFooter.svelte';
import { mockEntries } from './__mocks__/editor-mocks';
import { mockSaveStatuses, editorStoryParameters } from './__mocks__/story-utils';

/**
 * EditorFooter component displays entry status, word count, save state, and modification time.
 * Provides visual feedback about the current state of the journal entry being edited.
 */
const meta: Meta<EditorFooter> = {
  title: 'Components/Editor/EditorFooter',
  component: EditorFooter,
  parameters: {
    ...editorStoryParameters,
    layout: 'padded',
    docs: {
      description: {
        component: 'Footer component for the journal editor that displays entry status indicators, word count, autosave status, and last modified timestamp. Adapts to mobile layouts and keyboard visibility.',
      },
    },
  },
  argTypes: {
    entry: {
      description: 'The journal entry being edited',
      control: 'object'
    },
    content: {
      control: 'text',
      description: 'Current content of the entry for word count calculation'
    },
    saveStatus: {
      control: 'select',
      options: ['idle', 'saving', 'saved', 'error'],
      description: 'Current save status of the entry'
    },
    canPublish: {
      control: 'boolean',
      description: 'Whether the user can publish entries (authenticated and E2E unlocked)'
    },
    isPublished: {
      control: 'boolean',
      description: 'Whether the entry is currently published'
    },
    isEntryLocked: {
      control: 'boolean',
      description: 'Whether the entry is encrypted and locked'
    },
    isMobile: {
      control: 'boolean',
      description: 'Whether the interface is in mobile mode'
    },
    isKeyboardVisible: {
      control: 'boolean',
      description: 'Whether the mobile keyboard is currently visible'
    },
    keyboardHeight: {
      control: 'number',
      description: 'Height of the mobile keyboard in pixels'
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default footer showing standard draft state
 */
export const Default: Story = {
  args: {
    entry: mockEntries.existingEntry,
    content: mockEntries.existingEntry.content,
    saveStatus: mockSaveStatuses.idle,
    canPublish: false,
    isPublished: false,
    isEntryLocked: false,
    isMobile: false,
    isKeyboardVisible: false,
    keyboardHeight: 0,
  },
};

/**
 * Footer showing saving state with progress indicator
 */
export const SavingState: Story = {
  args: {
    entry: mockEntries.existingEntry,
    content: "This content is being saved automatically...",
    saveStatus: mockSaveStatuses.saving,
    canPublish: true,
    isPublished: false,
    isEntryLocked: false,
    isMobile: false,
    isKeyboardVisible: false,
    keyboardHeight: 0,
  },
};

/**
 * Footer showing successful save confirmation
 */
export const SavedState: Story = {
  args: {
    entry: mockEntries.existingEntry,
    content: mockEntries.existingEntry.content,
    saveStatus: mockSaveStatuses.saved,
    canPublish: true,
    isPublished: false,
    isEntryLocked: false,
    isMobile: false,
    isKeyboardVisible: false,
    keyboardHeight: 0,
  },
};

/**
 * Footer showing save error state
 */
export const SaveErrorState: Story = {
  args: {
    entry: mockEntries.existingEntry,
    content: "This content failed to save due to an error.",
    saveStatus: mockSaveStatuses.error,
    canPublish: true,
    isPublished: false,
    isEntryLocked: false,
    isMobile: false,
    isKeyboardVisible: false,
    keyboardHeight: 0,
  },
};

/**
 * Footer for published entry
 */
export const PublishedEntry: Story = {
  args: {
    entry: mockEntries.publishedEntry,
    content: mockEntries.publishedEntry.content,
    saveStatus: mockSaveStatuses.saved,
    canPublish: true,
    isPublished: true,
    isEntryLocked: false,
    isMobile: false,
    isKeyboardVisible: false,
    keyboardHeight: 0,
  },
};

/**
 * Footer for encrypted/locked entry
 */
export const LockedEntry: Story = {
  args: {
    entry: mockEntries.encryptedEntry,
    content: mockEntries.encryptedEntry.content,
    saveStatus: mockSaveStatuses.idle,
    canPublish: false,
    isPublished: true,
    isEntryLocked: true,
    isMobile: false,
    isKeyboardVisible: false,
    keyboardHeight: 0,
  },
};

/**
 * Footer showing local-only status (not authenticated)
 */
export const LocalOnlyEntry: Story = {
  args: {
    entry: mockEntries.existingEntry,
    content: "This entry is stored locally only.",
    saveStatus: mockSaveStatuses.saved,
    canPublish: false,
    isPublished: false,
    isEntryLocked: false,
    isMobile: false,
    isKeyboardVisible: false,
    keyboardHeight: 0,
  },
};

/**
 * Footer with very long content to test word count
 */
export const LongContent: Story = {
  args: {
    entry: mockEntries.longContentEntry,
    content: mockEntries.longContentEntry.content,
    saveStatus: mockSaveStatuses.saved,
    canPublish: true,
    isPublished: false,
    isEntryLocked: false,
    isMobile: false,
    isKeyboardVisible: false,
    keyboardHeight: 0,
  },
};

/**
 * Footer with empty content (zero words)
 */
export const EmptyContent: Story = {
  args: {
    entry: mockEntries.newEntry,
    content: "",
    saveStatus: mockSaveStatuses.idle,
    canPublish: true,
    isPublished: false,
    isEntryLocked: false,
    isMobile: false,
    isKeyboardVisible: false,
    keyboardHeight: 0,
  },
};

/**
 * Mobile layout footer
 */
export const MobileLayout: Story = {
  args: {
    entry: mockEntries.existingEntry,
    content: mockEntries.existingEntry.content,
    saveStatus: mockSaveStatuses.saved,
    canPublish: true,
    isPublished: false,
    isEntryLocked: false,
    isMobile: true,
    isKeyboardVisible: false,
    keyboardHeight: 0,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile',
    },
  },
};

/**
 * Mobile with keyboard visible (shows animation and padding adjustment)
 */
export const MobileWithKeyboard: Story = {
  args: {
    entry: mockEntries.existingEntry,
    content: "Typing on mobile with keyboard visible.",
    saveStatus: mockSaveStatuses.saving,
    canPublish: true,
    isPublished: false,
    isEntryLocked: false,
    isMobile: true,
    isKeyboardVisible: true,
    keyboardHeight: 300,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile',
    },
  },
};

/**
 * Very small screen layout (ultra-mobile)
 */
export const UltraMobileLayout: Story = {
  args: {
    entry: mockEntries.existingEntry,
    content: "Short content on tiny screen.",
    saveStatus: mockSaveStatuses.saved,
    canPublish: true,
    isPublished: false,
    isEntryLocked: false,
    isMobile: true,
    isKeyboardVisible: false,
    keyboardHeight: 0,
  },
  parameters: {
    viewport: {
      viewports: {
        ultraMobile: {
          name: 'Ultra Mobile',
          styles: {
            width: '320px',
            height: '568px',
          },
        },
      },
      defaultViewport: 'ultraMobile',
    },
  },
};

/**
 * No entry loaded state
 */
export const NoEntry: Story = {
  args: {
    entry: null,
    content: "",
    saveStatus: mockSaveStatuses.idle,
    canPublish: false,
    isPublished: false,
    isEntryLocked: false,
    isMobile: false,
    isKeyboardVisible: false,
    keyboardHeight: 0,
  },
};

/**
 * All status states demo for visual comparison
 */
export const StatusComparison: Story = {
  render: () => ({
    Component: 'div',
    props: {},
    template: `
      <div style="display: flex; flex-direction: column; gap: 1rem; padding: 1rem;">
        <h3>Footer Status States</h3>
        
        <div style="border: 1px solid #ccc; border-radius: 8px;">
          <h4 style="margin: 0; padding: 0.5rem; background: #f5f5f5;">Draft (Local Only)</h4>
          <EditorFooter 
            entry={mockEntries.existingEntry}
            content="Draft entry content."
            saveStatus="saved"
            canPublish={false}
            isPublished={false}
            isEntryLocked={false}
            isMobile={false}
            isKeyboardVisible={false}
            keyboardHeight={0}
          />
        </div>

        <div style="border: 1px solid #ccc; border-radius: 8px;">
          <h4 style="margin: 0; padding: 0.5rem; background: #f5f5f5;">Published Entry</h4>
          <EditorFooter 
            entry={mockEntries.publishedEntry}
            content={mockEntries.publishedEntry.content}
            saveStatus="saved"
            canPublish={true}
            isPublished={true}
            isEntryLocked={false}
            isMobile={false}
            isKeyboardVisible={false}
            keyboardHeight={0}
          />
        </div>

        <div style="border: 1px solid #ccc; border-radius: 8px;">
          <h4 style="margin: 0; padding: 0.5rem; background: #f5f5f5;">Encrypted/Locked</h4>
          <EditorFooter 
            entry={mockEntries.encryptedEntry}
            content={mockEntries.encryptedEntry.content}
            saveStatus="idle"
            canPublish={false}
            isPublished={true}
            isEntryLocked={true}
            isMobile={false}
            isKeyboardVisible={false}
            keyboardHeight={0}
          />
        </div>
      </div>
    `,
  }),
};