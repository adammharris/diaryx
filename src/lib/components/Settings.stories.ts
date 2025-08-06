import type { Meta, StoryObj } from '@storybook/svelte';
import Settings from './Settings.svelte';

/**
 * Settings modal component for configuring themes, authentication, and sync options.
 * Features theme selection, Google OAuth integration, and E2E encryption management.
 */
const meta: Meta<Settings> = {
  title: 'Components/Settings',
  component: Settings,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'A comprehensive settings modal with theme selection, account management, cloud sync configuration, and biometric authentication. Features responsive design for both desktop and mobile layouts.',
      },
    },
  },
  argTypes: {
    storageService: {
      description: 'Storage service instance for managing journal entries',
      control: 'object'
    },
    onclose: { 
      action: 'closed',
      description: 'Callback when settings modal is closed'
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Mock storage service
const mockStorageService = {
  getJournalPath: () => '/Users/username/Documents/Diaryx/',
  syncAfterLogin: async () => {},
  createEntry: async () => 'new-entry-id',
  getAllEntries: async () => [],
  getEntry: async () => null,
  saveEntry: async () => true,
  deleteEntry: async () => true,
  clearCacheAndRefresh: async () => {},
};

/**
 * Default settings modal for unauthenticated user
 */
export const Default: Story = {
  args: {
    storageService: mockStorageService,
  },
};

/**
 * Settings modal with authenticated user but no E2E encryption setup
 */
export const AuthenticatedNoE2E: Story = {
  args: {
    storageService: mockStorageService,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the settings modal for a user who is signed in but has not yet set up end-to-end encryption for cloud sync.',
      },
    },
  },
};

/**
 * Settings modal with authenticated user and E2E encryption enabled
 */
export const AuthenticatedWithE2E: Story = {
  args: {
    storageService: mockStorageService,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the settings modal for a user who is fully set up with authentication and end-to-end encryption, ready for cloud sync.',
      },
    },
  },
};

/**
 * Settings modal on mobile layout
 */
export const MobileLayout: Story = {
  args: {
    storageService: mockStorageService,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
    docs: {
      description: {
        story: 'Demonstrates how the settings modal adapts to mobile screen sizes with modified navigation and layout.',
      },
    },
  },
};

/**
 * Settings modal in web browser mode
 */
export const WebMode: Story = {
  args: {
    storageService: {
      ...mockStorageService,
      getJournalPath: () => 'IndexedDB (browser storage)',
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the settings modal when running in web browser mode, displaying appropriate storage information.',
      },
    },
  },
};

/**
 * Settings modal with dark theme
 */
export const DarkTheme: Story = {
  args: {
    storageService: mockStorageService,
  },
  parameters: {
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        story: 'Demonstrates the settings modal appearance in dark theme with proper contrast and color schemes.',
      },
    },
  },
};

/**
 * Settings modal with biometric authentication available
 */
export const WithBiometrics: Story = {
  args: {
    storageService: mockStorageService,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the settings modal with biometric authentication options available and configured.',
      },
    },
  },
};

/**
 * Settings modal showing all theme options
 */
export const ThemeSelection: Story = {
  args: {
    storageService: mockStorageService,
  },
  decorators: [
    () => ({
      template: `<div style="--story-height: 100vh; height: 100vh;">
        <Settings {storageService} {onclose} />
      </div>`,
    }),
  ],
  parameters: {
    docs: {
      description: {
        story: 'Focuses on the theme selection grid showing all available color themes with previews.',
      },
    },
  },
};