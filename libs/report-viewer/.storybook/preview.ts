import type { Preview } from '@storybook/angular';

/**
 * Shared preview parameters. Zoneless change detection is configured by the
 * `experimentalZoneless` builder option (project.json), not here, to avoid
 * providing both a zoned and a zoneless change detector.
 */
const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
