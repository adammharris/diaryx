import type { Preview } from '@storybook/svelte-vite';
import { themes, setTheme, setColorMode } from '../src/lib/stores/theme';
import '../src/app.css';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
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
    backgrounds: {
      default: 'light',
      values: [
        {
          name: 'light',
          value: '#ffffff',
        },
        {
          name: 'dark',
          value: '#1a1a1a',
        },
        {
          name: 'blue-light',
          value: '#f0f4ff',
        },
        {
          name: 'green-light',
          value: '#f0fff4',
        },
        {
          name: 'purple-light',
          value: '#faf5ff',
        },
        {
          name: 'pink-light',
          value: '#fdf2f8',
        },
      ],
    },
  },
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Global theme for components',
      defaultValue: 'default',
      toolbar: {
        icon: 'paintbrush',
        items: Object.keys(themes),
        showName: true,
      },
    },
    colorMode: {
      name: 'Color Mode',
      description: 'Global color mode for components',
      defaultValue: 'light',
      toolbar: {
        icon: 'mirror',
        items: ['light', 'dark'],
        showName: true,
      },
    },
  },
  decorators: [
    (story, context) => {
      const { theme, colorMode } = context.globals;
      setTheme(theme);
      setColorMode(colorMode);
      return story();
    },
  ],
};

export default preview;