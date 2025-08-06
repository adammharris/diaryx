import type { StorybookConfig } from '@storybook/sveltekit';

const config: StorybookConfig = {
  stories: [
    '../src/stories/**/*.stories.@(js|ts|svelte)',
    '../src/lib/components/**/*.stories.@(js|ts|svelte)',
    '../src/**/*.mdx'
  ],
  addons: ['@storybook/addon-svelte-csf', '@storybook/addon-docs'],
  framework: {
    name: '@storybook/sveltekit',
    options: {}
  },
  docs: {
    defaultName: 'Docs'
  },
  core: {
    disableTelemetry: true
  }
};

export default config;