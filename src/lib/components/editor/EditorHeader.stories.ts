import type { Meta, StoryObj } from '@storybook/svelte';
import EditorHeader from './EditorHeader.svelte';
import { mockEntries } from './__mocks__/editor-mocks';
import { mockHandlers, editorStoryParameters } from './__mocks__/story-utils';

/**
 * EditorHeader component handles entry title editing, navigation, and action buttons.
 * Provides the main interface for entry management including publish controls and preview toggle.
 */
const meta: Meta<EditorHeader> = {
  title: 'Components/Editor/EditorHeader',
  component: EditorHeader,
  parameters: {
    ...editorStoryParameters,
    layout: 'padded',
    docs: {
      description: {
        component: 'Header component for the journal editor featuring inline title editing, publish controls, and navigation buttons. Adapts to mobile layouts with responsive design and proper accessibility support.',
      },
    },
  },
  argTypes: {
    entry: {
      description: 'The journal entry being edited',
      control: 'object'
    },
    editableTitle: {
      control: 'text',
      description: 'Current editable title text'
    },
    isEditingTitle: {
      control: 'boolean',
      description: 'Whether title editing mode is active'
    },
    isEntryLocked: {
      control: 'boolean',
      description: 'Whether the entry is encrypted and locked'
    },
    canPublish: {
      control: 'boolean',
      description: 'Whether user can publish (authenticated and E2E unlocked)'
    },
    isPublished: {
      control: 'boolean',
      description: 'Whether the entry is currently published'
    },
    isMobile: {
      control: 'boolean',
      description: 'Whether the interface is in mobile mode'
    },
    isPreview: {
      control: 'boolean',
      description: 'Whether preview mode is active'
    },
    onTitleEdit: { 
      action: 'titleEditStarted',
      description: 'Callback when title editing begins'
    },
    onTitleSave: { 
      action: 'titleSaved',
      description: 'Callback when title is saved'
    },
    onTitleCancel: { 
      action: 'titleEditCancelled',
      description: 'Callback when title editing is cancelled'
    },
    onTitleKeydown: { 
      action: 'titleKeydown',
      description: 'Callback for title input keyboard events'
    },
    onClose: { 
      action: 'closed',
      description: 'Callback when close/back button is clicked'
    },
    onTogglePublish: { 
      action: 'publishToggled',
      description: 'Callback when publish button is clicked'
    },
    onShowInfo: { 
      action: 'infoShown',
      description: 'Callback when info button is clicked'
    },
    onTogglePreview: { 
      action: 'previewToggled',
      description: 'Callback when preview toggle is clicked'
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default header with standard entry
 */
export const Default: Story = {
  args: {
    entry: mockEntries.existingEntry,
    editableTitle: mockEntries.existingEntry.title,
    isEditingTitle: false,
    isEntryLocked: false,
    canPublish: true,
    isPublished: false,
    isMobile: false,
    isPreview: false,
    onTitleEdit: mockHandlers.onTitleEdit,
    onTitleSave: mockHandlers.onTitleSave,
    onTitleCancel: mockHandlers.onTitleCancel,
    onTitleKeydown: mockHandlers.onTitleKeydown,
    onClose: mockHandlers.onClose,
    onTogglePublish: mockHandlers.onTogglePublish,
    onShowInfo: mockHandlers.onShowInfo,
    onTogglePreview: mockHandlers.onTogglePreview,
  },
};

/**
 * Header with title editing active
 */
export const EditingTitle: Story = {
  args: {
    entry: mockEntries.existingEntry,
    editableTitle: mockEntries.existingEntry.title,
    isEditingTitle: true,
    isEntryLocked: false,
    canPublish: true,
    isPublished: false,
    isMobile: false,
    isPreview: false,
    onTitleEdit: mockHandlers.onTitleEdit,
    onTitleSave: mockHandlers.onTitleSave,
    onTitleCancel: mockHandlers.onTitleCancel,
    onTitleKeydown: mockHandlers.onTitleKeydown,
    onClose: mockHandlers.onClose,
    onTogglePublish: mockHandlers.onTogglePublish,
    onShowInfo: mockHandlers.onShowInfo,
    onTogglePreview: mockHandlers.onTogglePreview,
  },
};

/**
 * Header for locked/encrypted entry
 */
export const LockedEntry: Story = {
  args: {
    entry: mockEntries.encryptedEntry,
    editableTitle: mockEntries.encryptedEntry.title,
    isEditingTitle: false,
    isEntryLocked: true,
    canPublish: false,
    isPublished: true,
    isMobile: false,
    isPreview: false,
    onTitleEdit: mockHandlers.onTitleEdit,
    onTitleSave: mockHandlers.onTitleSave,
    onTitleCancel: mockHandlers.onTitleCancel,
    onTitleKeydown: mockHandlers.onTitleKeydown,
    onClose: mockHandlers.onClose,
    onTogglePublish: mockHandlers.onTogglePublish,
    onShowInfo: mockHandlers.onShowInfo,
    onTogglePreview: mockHandlers.onTogglePreview,
  },
};

/**
 * Header for published entry
 */
export const PublishedEntry: Story = {
  args: {
    entry: mockEntries.publishedEntry,
    editableTitle: mockEntries.publishedEntry.title,
    isEditingTitle: false,
    isEntryLocked: false,
    canPublish: true,
    isPublished: true,
    isMobile: false,
    isPreview: false,
    onTitleEdit: mockHandlers.onTitleEdit,
    onTitleSave: mockHandlers.onTitleSave,
    onTitleCancel: mockHandlers.onTitleCancel,
    onTitleKeydown: mockHandlers.onTitleKeydown,
    onClose: mockHandlers.onClose,
    onTogglePublish: mockHandlers.onTogglePublish,
    onShowInfo: mockHandlers.onShowInfo,
    onTogglePreview: mockHandlers.onTogglePreview,
  },
};

/**
 * Header in preview mode
 */
export const PreviewMode: Story = {
  args: {
    entry: mockEntries.existingEntry,
    editableTitle: mockEntries.existingEntry.title,
    isEditingTitle: false,
    isEntryLocked: false,
    canPublish: true,
    isPublished: false,
    isMobile: false,
    isPreview: true,
    onTitleEdit: mockHandlers.onTitleEdit,
    onTitleSave: mockHandlers.onTitleSave,
    onTitleCancel: mockHandlers.onTitleCancel,
    onTitleKeydown: mockHandlers.onTitleKeydown,
    onClose: mockHandlers.onClose,
    onTogglePublish: mockHandlers.onTogglePublish,
    onShowInfo: mockHandlers.onShowInfo,
    onTogglePreview: mockHandlers.onTogglePreview,
  },
};

/**
 * Header without publish permissions (not authenticated or E2E locked)
 */
export const NoPublishPermissions: Story = {
  args: {
    entry: mockEntries.existingEntry,
    editableTitle: mockEntries.existingEntry.title,
    isEditingTitle: false,
    isEntryLocked: false,
    canPublish: false,
    isPublished: false,
    isMobile: false,
    isPreview: false,
    onTitleEdit: mockHandlers.onTitleEdit,
    onTitleSave: mockHandlers.onTitleSave,
    onTitleCancel: mockHandlers.onTitleCancel,
    onTitleKeydown: mockHandlers.onTitleKeydown,
    onClose: mockHandlers.onClose,
    onTogglePublish: mockHandlers.onTogglePublish,
    onShowInfo: mockHandlers.onShowInfo,
    onTogglePreview: mockHandlers.onTogglePreview,
  },
};

/**
 * Header with very long title to test wrapping
 */
export const LongTitle: Story = {
  args: {
    entry: mockEntries.longContentEntry,
    editableTitle: mockEntries.longContentEntry.title,
    isEditingTitle: false,
    isEntryLocked: false,
    canPublish: true,
    isPublished: false,
    isMobile: false,
    isPreview: false,
    onTitleEdit: mockHandlers.onTitleEdit,
    onTitleSave: mockHandlers.onTitleSave,
    onTitleCancel: mockHandlers.onTitleCancel,
    onTitleKeydown: mockHandlers.onTitleKeydown,
    onClose: mockHandlers.onClose,
    onTogglePublish: mockHandlers.onTogglePublish,
    onShowInfo: mockHandlers.onShowInfo,
    onTogglePreview: mockHandlers.onTogglePreview,
  },
};

/**
 * Header for mobile layout
 */
export const MobileLayout: Story = {
  args: {
    entry: mockEntries.existingEntry,
    editableTitle: mockEntries.existingEntry.title,
    isEditingTitle: false,
    isEntryLocked: false,
    canPublish: true,
    isPublished: false,
    isMobile: true,
    isPreview: false,
    onTitleEdit: mockHandlers.onTitleEdit,
    onTitleSave: mockHandlers.onTitleSave,
    onTitleCancel: mockHandlers.onTitleCancel,
    onTitleKeydown: mockHandlers.onTitleKeydown,
    onClose: mockHandlers.onClose,
    onTogglePublish: mockHandlers.onTogglePublish,
    onShowInfo: mockHandlers.onShowInfo,
    onTogglePreview: mockHandlers.onTogglePreview,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile',
    },
  },
};

/**
 * Mobile layout with title editing
 */
export const MobileEditingTitle: Story = {
  args: {
    entry: mockEntries.existingEntry,
    editableTitle: mockEntries.existingEntry.title,
    isEditingTitle: true,
    isEntryLocked: false,
    canPublish: true,
    isPublished: false,
    isMobile: true,
    isPreview: false,
    onTitleEdit: mockHandlers.onTitleEdit,
    onTitleSave: mockHandlers.onTitleSave,
    onTitleCancel: mockHandlers.onTitleCancel,
    onTitleKeydown: mockHandlers.onTitleKeydown,
    onClose: mockHandlers.onClose,
    onTogglePublish: mockHandlers.onTogglePublish,
    onShowInfo: mockHandlers.onShowInfo,
    onTogglePreview: mockHandlers.onTogglePreview,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile',
    },
  },
};

/**
 * Empty/new entry header
 */
export const NewEntry: Story = {
  args: {
    entry: mockEntries.newEntry,
    editableTitle: '',
    isEditingTitle: false,
    isEntryLocked: false,
    canPublish: true,
    isPublished: false,
    isMobile: false,
    isPreview: false,
    onTitleEdit: mockHandlers.onTitleEdit,
    onTitleSave: mockHandlers.onTitleSave,
    onTitleCancel: mockHandlers.onTitleCancel,
    onTitleKeydown: mockHandlers.onTitleKeydown,
    onClose: mockHandlers.onClose,
    onTogglePublish: mockHandlers.onTogglePublish,
    onShowInfo: mockHandlers.onShowInfo,
    onTogglePreview: mockHandlers.onTogglePreview,
  },
};

/**
 * Ultra-small screen layout
 */
export const UltraSmallScreen: Story = {
  args: {
    entry: mockEntries.existingEntry,
    editableTitle: mockEntries.existingEntry.title,
    isEditingTitle: false,
    isEntryLocked: false,
    canPublish: true,
    isPublished: false,
    isMobile: true,
    isPreview: false,
    onTitleEdit: mockHandlers.onTitleEdit,
    onTitleSave: mockHandlers.onTitleSave,
    onTitleCancel: mockHandlers.onTitleCancel,
    onTitleKeydown: mockHandlers.onTitleKeydown,
    onClose: mockHandlers.onClose,
    onTogglePublish: mockHandlers.onTogglePublish,
    onShowInfo: mockHandlers.onShowInfo,
    onTogglePreview: mockHandlers.onTogglePreview,
  },
  parameters: {
    viewport: {
      viewports: {
        ultraSmall: {
          name: 'Ultra Small',
          styles: {
            width: '320px',
            height: '568px',
          },
        },
      },
      defaultViewport: 'ultraSmall',
    },
  },
};

/**
 * Interactive demo showing all button states
 */
export const InteractiveDemo: Story = {
  args: {
    entry: mockEntries.existingEntry,
    editableTitle: mockEntries.existingEntry.title,
    isEditingTitle: false,
    isEntryLocked: false,
    canPublish: true,
    isPublished: false,
    isMobile: false,
    isPreview: false,
    onTitleEdit: () => console.log('🎯 Title editing started - Click title to edit'),
    onTitleSave: () => console.log('💾 Title saved - Changes are automatically saved'),
    onTitleCancel: () => console.log('❌ Title editing cancelled - Reverted to original'),
    onTitleKeydown: (event: KeyboardEvent) => console.log(`⌨️  Key pressed: ${event.key}`),
    onClose: () => console.log('🚪 Editor closed - Return to entry list'),
    onTogglePublish: () => console.log('🌐 Publish toggled - Entry sharing state changed'),
    onShowInfo: () => console.log('ℹ️  Info modal opened - View entry metadata'),
    onTogglePreview: () => console.log('👁  Preview toggled - Switch between edit and preview modes'),
  },
};