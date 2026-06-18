import type { StorybookConfig } from '@storybook/angular';

/**
 * Storybook host config for `report-renderer` (E0-S6). One Storybook per library
 * keeps each lib documentable and visually testable in isolation. The Angular
 * framework compiles via `@angular-devkit/build-angular`; zoneless bootstrap is
 * enabled through the `experimentalZoneless` builder option (see project.json),
 * so Zone.js is never pulled into the workspace.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|mdx)'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/angular',
    options: {},
  },
};

export default config;
