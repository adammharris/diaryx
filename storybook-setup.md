# Storybook Setup for Diaryx

## Installation

```bash
# Install Storybook for Svelte
npx storybook@latest init

# Install additional addons
bun add -d @storybook/addon-docs @storybook/addon-controls @storybook/addon-actions
```

## Configuration

### `.storybook/main.ts`
```typescript
import type { StorybookConfig } from '@storybook/svelte-vite';

const config: StorybookConfig = {
  stories: ['../src/lib/components/**/*.stories.@(js|jsx|ts|tsx|svelte)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-docs',
    '@storybook/addon-controls',
    '@storybook/addon-actions',
  ],
  framework: {
    name: '@storybook/svelte-vite',
    options: {},
  },
  viteFinal: async (config) => {
    // Ensure Storybook can resolve your path aliases
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      '$lib': path.resolve(__dirname, '../src/lib'),
    };
    return config;
  },
};

export default config;
```

### `.storybook/preview.ts`
```typescript
import type { Preview } from '@storybook/svelte';
import '../src/app.css'; // Your global styles

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    docs: {
      extractComponentDescription: (component, { notes }) => {
        if (notes) {
          return typeof notes === 'string' ? notes : notes.markdown || notes.text;
        }
        return null;
      },
    },
  },
};

export default preview;
```

## Sample Story

### `src/lib/components/Dialog.stories.ts`
```typescript
import type { Meta, StoryObj } from '@storybook/svelte';
import Dialog from './Dialog.svelte';

const meta: Meta<Dialog> = {
  title: 'Components/Dialog',
  component: Dialog,
  parameters: {
    docs: {
      description: {
        component: 'A reusable dialog component with customizable content and actions.',
      },
    },
  },
  argTypes: {
    title: { control: 'text' },
    open: { control: 'boolean' },
    onClose: { action: 'closed' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Sample Dialog',
    open: true,
  },
};

export const WithLongContent: Story = {
  args: {
    title: 'Dialog with Long Content',
    open: true,
  },
};

// Theme variations
export const DarkTheme: Story = {
  args: {
    title: 'Dark Theme Dialog',
    open: true,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
```

## Package.json Scripts
```json
{
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build",
    "docs:all": "bun run docs && bun run build-storybook"
  }
}
```