import type { Meta, StoryObj } from '@storybook/svelte';
import Dialog from './Dialog.svelte';

/**
 * Dialog component for displaying modal dialogs with various types (info, error, warning, confirm).
 * Supports keyboard navigation and focus management.
 */
const meta: Meta<Dialog> = {
  title: 'Components/Dialog',
  component: Dialog,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'A reusable modal dialog component with support for different dialog types, keyboard navigation, and focus management. Includes built-in icons and proper ARIA attributes for accessibility.',
      },
    },
  },
  argTypes: {
    isVisible: { 
      control: 'boolean',
      description: 'Controls whether the dialog is visible'
    },
    title: { 
      control: 'text',
      description: 'Dialog title text'
    },
    message: { 
      control: 'text',
      description: 'Dialog message content'
    },
    type: {
      control: 'select',
      options: ['info', 'error', 'warning', 'confirm'],
      description: 'Dialog type affecting icon and button styling'
    },
    confirmText: {
      control: 'text',
      description: 'Text for the confirm button'
    },
    cancelText: {
      control: 'text',
      description: 'Text for the cancel button (shown for confirm type or when oncancel is provided)'
    },
    onconfirm: { 
      action: 'confirmed',
      description: 'Callback when confirm button is clicked'
    },
    oncancel: { 
      action: 'cancelled',
      description: 'Callback when cancel button is clicked'
    },
    onclose: { 
      action: 'closed',
      description: 'Callback when dialog is closed'
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default info dialog with standard title and message
 */
export const Default: Story = {
  args: {
    isVisible: true,
    title: 'Information',
    message: 'This is a sample information dialog.',
    type: 'info',
    confirmText: 'OK',
  },
};

/**
 * Error dialog with error styling and icon
 */
export const Error: Story = {
  args: {
    isVisible: true,
    title: 'Error',
    message: 'An error occurred while processing your request. Please try again.',
    type: 'error',
    confirmText: 'OK',
  },
};

/**
 * Warning dialog with warning styling and icon
 */
export const Warning: Story = {
  args: {
    isVisible: true,
    title: 'Warning',
    message: 'This action cannot be undone. Are you sure you want to continue?',
    type: 'warning',
    confirmText: 'Continue',
  },
};

/**
 * Confirmation dialog with both confirm and cancel buttons
 */
export const Confirm: Story = {
  args: {
    isVisible: true,
    title: 'Confirm Action',
    message: 'Are you sure you want to delete this item? This action cannot be undone.',
    type: 'confirm',
    confirmText: 'Delete',
    cancelText: 'Cancel',
  },
};

/**
 * Dialog with long content to test scrolling and layout
 */
export const LongContent: Story = {
  args: {
    isVisible: true,
    title: 'Terms and Conditions',
    message: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.`,
    type: 'info',
    confirmText: 'I Agree',
    cancelText: 'Decline',
  },
};

/**
 * Custom button text example
 */
export const CustomButtons: Story = {
  args: {
    isVisible: true,
    title: 'Save Changes',
    message: 'You have unsaved changes. What would you like to do?',
    type: 'confirm',
    confirmText: 'Save',
    cancelText: 'Discard',
  },
};

/**
 * Hidden state for testing visibility toggle
 */
export const Hidden: Story = {
  args: {
    isVisible: false,
    title: 'Hidden Dialog',
    message: 'This dialog is not visible.',
    type: 'info',
  },
};