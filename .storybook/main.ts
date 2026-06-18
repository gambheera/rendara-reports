import type { StorybookConfig } from '@storybook/html-vite';

/**
 * Root **composition** host (E0-S6 follow-up). This Storybook has no stories of
 * its own — it aggregates the three per-library Storybooks under one sidebar via
 * `refs` (Storybook Composition). Each lib keeps its own isolated Storybook
 * (`libs/<lib>/.storybook`, ports 4400/4401/4402); this host just links to them.
 *
 * It uses the lightweight HTML/Vite builder (not `@storybook/angular`) because
 * the host renders no Angular components itself, and the Angular dev-server
 * builder cannot run a refs-only host through the Storybook CLI. Run the three
 * lib dev servers (or point `url`s at deployed Storybooks) before opening this
 * host: see `docs/tooling/storybook.md`.
 */
const config: StorybookConfig = {
  // A single local landing page; the real content comes from the `refs` below.
  // (Storybook requires a host to have at least one local stories entry.)
  stories: ['./*.stories.ts'],
  framework: {
    name: '@storybook/html-vite',
    options: {},
  },
  refs: {
    'ui-kit': {
      title: 'UI Kit',
      url: 'http://localhost:4400',
    },
    'report-renderer': {
      title: 'Report Renderer',
      url: 'http://localhost:4401',
    },
    'report-viewer': {
      title: 'Report Viewer',
      url: 'http://localhost:4402',
    },
  },
};

export default config;
