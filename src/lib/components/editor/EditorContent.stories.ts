import type { Meta, StoryObj } from '@storybook/svelte';
import EditorContent from './EditorContent.svelte';
import { mockEntries } from './__mocks__/editor-mocks';
import { mockHandlers, editorStoryParameters } from './__mocks__/story-utils';

/**
 * EditorContent component handles the main content editing experience.
 * Supports edit mode, preview mode, locked states, and mobile optimizations.
 */
const meta: Meta<EditorContent> = {
  title: 'Components/Editor/EditorContent',
  component: EditorContent,
  parameters: {
    ...editorStoryParameters,
    docs: {
      description: {
        component: 'The main content area of the journal editor. Features a textarea for editing, markdown preview, encryption lock screen, and loading states. Includes mobile-specific optimizations for keyboard handling and cursor scrolling.',
      },
    },
  },
  argTypes: {
    content: {
      control: 'text',
      description: 'Current content of the entry'
    },
    isPreview: {
      control: 'boolean',
      description: 'Whether preview mode is active (shows rendered markdown)'
    },
    isLoading: {
      control: 'boolean',
      description: 'Whether the content is loading'
    },
    isEntryLocked: {
      control: 'boolean',
      description: 'Whether the entry is encrypted and locked'
    },
    isMobile: {
      control: 'boolean',
      description: 'Whether the interface is in mobile mode'
    },
    textareaFocused: {
      control: 'boolean',
      description: 'Whether the textarea currently has focus'
    },
    textareaElement: {
      description: 'Reference to the textarea DOM element',
    },
    onContentChange: { 
      action: 'contentChanged',
      description: 'Callback when content is modified'
    },
    onTextareaFocus: { 
      action: 'textareaFocused',
      description: 'Callback when textarea gains focus'
    },
    onTextareaBlur: { 
      action: 'textareaBlurred',
      description: 'Callback when textarea loses focus'
    },
    onTextareaInput: { 
      action: 'textareaInput',
      description: 'Callback on textarea input events'
    },
    onTextareaClick: { 
      action: 'textareaClicked',
      description: 'Callback when textarea is clicked'
    },
    onUnlockEntry: { 
      action: 'unlockRequested',
      description: 'Callback when unlock button is clicked'
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default edit mode with sample content
 */
export const Default: Story = {
  args: {
    content: mockEntries.existingEntry.content,
    isPreview: false,
    isLoading: false,
    isEntryLocked: false,
    isMobile: false,
    textareaFocused: false,
    onContentChange: mockHandlers.onContentChange,
    onTextareaFocus: mockHandlers.onTextareaFocus,
    onTextareaBlur: mockHandlers.onTextareaBlur,
    onTextareaInput: mockHandlers.onTextareaInput,
    onTextareaClick: mockHandlers.onTextareaClick,
    onUnlockEntry: mockHandlers.onUnlockEntry,
  },
};

/**
 * Preview mode showing rendered markdown
 */
export const PreviewMode: Story = {
  args: {
    content: mockEntries.existingEntry.content,
    isPreview: true,
    isLoading: false,
    isEntryLocked: false,
    isMobile: false,
    textareaFocused: false,
    onContentChange: mockHandlers.onContentChange,
    onTextareaFocus: mockHandlers.onTextareaFocus,
    onTextareaBlur: mockHandlers.onTextareaBlur,
    onTextareaInput: mockHandlers.onTextareaInput,
    onTextareaClick: mockHandlers.onTextareaClick,
    onUnlockEntry: mockHandlers.onUnlockEntry,
  },
};

/**
 * Loading state while entry is being fetched
 */
export const LoadingState: Story = {
  args: {
    content: '',
    isPreview: false,
    isLoading: true,
    isEntryLocked: false,
    isMobile: false,
    textareaFocused: false,
    onContentChange: mockHandlers.onContentChange,
    onTextareaFocus: mockHandlers.onTextareaFocus,
    onTextareaBlur: mockHandlers.onTextareaBlur,
    onTextareaInput: mockHandlers.onTextareaInput,
    onTextareaClick: mockHandlers.onTextareaClick,
    onUnlockEntry: mockHandlers.onUnlockEntry,
  },
};

/**
 * Locked entry requiring encryption password
 */
export const LockedEntry: Story = {
  args: {
    content: mockEntries.encryptedEntry.content,
    isPreview: false,
    isLoading: false,
    isEntryLocked: true,
    isMobile: false,
    textareaFocused: false,
    onContentChange: mockHandlers.onContentChange,
    onTextareaFocus: mockHandlers.onTextareaFocus,
    onTextareaBlur: mockHandlers.onTextareaBlur,
    onTextareaInput: mockHandlers.onTextareaInput,
    onTextareaClick: mockHandlers.onTextareaClick,
    onUnlockEntry: mockHandlers.onUnlockEntry,
  },
};

/**
 * Empty content for new entries
 */
export const EmptyContent: Story = {
  args: {
    content: '',
    isPreview: false,
    isLoading: false,
    isEntryLocked: false,
    isMobile: false,
    textareaFocused: false,
    onContentChange: mockHandlers.onContentChange,
    onTextareaFocus: mockHandlers.onTextareaFocus,
    onTextareaBlur: mockHandlers.onTextareaBlur,
    onTextareaInput: mockHandlers.onTextareaInput,
    onTextareaClick: mockHandlers.onTextareaClick,
    onUnlockEntry: mockHandlers.onUnlockEntry,
  },
};

/**
 * Long content with complex markdown
 */
export const LongContent: Story = {
  args: {
    content: mockEntries.longContentEntry.content,
    isPreview: false,
    isLoading: false,
    isEntryLocked: false,
    isMobile: false,
    textareaFocused: false,
    onContentChange: mockHandlers.onContentChange,
    onTextareaFocus: mockHandlers.onTextareaFocus,
    onTextareaBlur: mockHandlers.onTextareaBlur,
    onTextareaInput: mockHandlers.onTextareaInput,
    onTextareaClick: mockHandlers.onTextareaClick,
    onUnlockEntry: mockHandlers.onUnlockEntry,
  },
};

/**
 * Complex markdown preview with various elements
 */
export const ComplexMarkdownPreview: Story = {
  args: {
    content: `# Complex Markdown Preview

This demonstrates various markdown elements in preview mode.

## Text Formatting

**Bold text** and *italic text* and ***bold italic***.

## Lists

### Unordered List
- Item 1
- Item 2
  - Nested item
  - Another nested item
- Item 3

### Ordered List
1. First item
2. Second item
3. Third item

## Code Examples

Inline \`code\` and code blocks:

\`\`\`javascript
function greet(name) {
    console.log(\`Hello, \${name}!\`);
}

greet('World');
\`\`\`

## Blockquotes

> This is a blockquote.
> It can span multiple lines.
>
> - Even contain lists
> - Like this one

## Tables

| Feature | Status | Notes |
|---------|--------|-------|
| Editing | ✅ | Full support |
| Preview | ✅ | Markdown rendering |
| Mobile | ✅ | Responsive design |

## Links and Images

[Example link](https://example.com)

---

*That's a horizontal rule above this text.*`,
    isPreview: true,
    isLoading: false,
    isEntryLocked: false,
    isMobile: false,
    textareaFocused: false,
    onContentChange: mockHandlers.onContentChange,
    onTextareaFocus: mockHandlers.onTextareaFocus,
    onTextareaBlur: mockHandlers.onTextareaBlur,
    onTextareaInput: mockHandlers.onTextareaInput,
    onTextareaClick: mockHandlers.onTextareaClick,
    onUnlockEntry: mockHandlers.onUnlockEntry,
  },
};

/**
 * Mobile layout with focused textarea
 */
export const MobileEditingFocused: Story = {
  args: {
    content: "This is mobile content that I'm actively editing...",
    isPreview: false,
    isLoading: false,
    isEntryLocked: false,
    isMobile: true,
    textareaFocused: true,
    onContentChange: mockHandlers.onContentChange,
    onTextareaFocus: mockHandlers.onTextareaFocus,
    onTextareaBlur: mockHandlers.onTextareaBlur,
    onTextareaInput: mockHandlers.onTextareaInput,
    onTextareaClick: mockHandlers.onTextareaClick,
    onUnlockEntry: mockHandlers.onUnlockEntry,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile',
    },
  },
};

/**
 * Mobile preview mode
 */
export const MobilePreview: Story = {
  args: {
    content: mockEntries.existingEntry.content,
    isPreview: true,
    isLoading: false,
    isEntryLocked: false,
    isMobile: true,
    textareaFocused: false,
    onContentChange: mockHandlers.onContentChange,
    onTextareaFocus: mockHandlers.onTextareaFocus,
    onTextareaBlur: mockHandlers.onTextareaBlur,
    onTextareaInput: mockHandlers.onTextareaInput,
    onTextareaClick: mockHandlers.onTextareaClick,
    onUnlockEntry: mockHandlers.onUnlockEntry,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile',
    },
  },
};

/**
 * Mobile locked entry
 */
export const MobileLockedEntry: Story = {
  args: {
    content: mockEntries.encryptedEntry.content,
    isPreview: false,
    isLoading: false,
    isEntryLocked: true,
    isMobile: true,
    textareaFocused: false,
    onContentChange: mockHandlers.onContentChange,
    onTextareaFocus: mockHandlers.onTextareaFocus,
    onTextareaBlur: mockHandlers.onTextareaBlur,
    onTextareaInput: mockHandlers.onTextareaInput,
    onTextareaClick: mockHandlers.onTextareaClick,
    onUnlockEntry: mockHandlers.onUnlockEntry,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile',
    },
  },
};

/**
 * Ultra-small screen layout
 */
export const UltraSmallScreen: Story = {
  args: {
    content: "Content on a very small screen.",
    isPreview: false,
    isLoading: false,
    isEntryLocked: false,
    isMobile: true,
    textareaFocused: false,
    onContentChange: mockHandlers.onContentChange,
    onTextareaFocus: mockHandlers.onTextareaFocus,
    onTextareaBlur: mockHandlers.onTextareaBlur,
    onTextareaInput: mockHandlers.onTextareaInput,
    onTextareaClick: mockHandlers.onTextareaClick,
    onUnlockEntry: mockHandlers.onUnlockEntry,
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
 * Interactive demo showing mode switching
 */
export const InteractiveDemo: Story = {
  args: {
    content: `# Interactive Demo

Try switching between **edit** and **preview** modes to see how the content renders.

## Features
- Real-time editing
- Markdown preview
- Mobile optimization
- Keyboard shortcuts

\`\`\`javascript
// This is sample code
function demo() {
  console.log('Hello from the editor!');
}
\`\`\`

> Remember to save your changes regularly!`,
    isPreview: false,
    isLoading: false,
    isEntryLocked: false,
    isMobile: false,
    textareaFocused: false,
    onContentChange: (content: string) => {
      console.log(`📝 Content updated: ${content.length} characters`);
    },
    onTextareaFocus: () => console.log('🎯 Textarea focused - Start typing!'),
    onTextareaBlur: () => console.log('👋 Textarea blurred - Focus lost'),
    onTextareaInput: () => console.log('⌨️  Typing detected - Auto-save will trigger'),
    onTextareaClick: () => console.log('👆 Textarea clicked - Cursor repositioned'),
    onUnlockEntry: () => console.log('🔓 Unlock requested - Enter encryption password'),
  },
};