import type { Preview } from '@storybook/angular';
import { componentWrapperDecorator } from '@storybook/angular';

/**
 * Shared preview config. Zoneless change detection is configured by the
 * `experimentalZoneless` builder option (project.json), not here, to avoid
 * providing both a zoned and a zoneless change detector.
 *
 * The design-token contract (`src/styles/tokens.css`) is loaded via the
 * builder's `styles` option in project.json — the Angular Storybook builder has
 * no CSS loader for a `preview.ts` `import`, so global stylesheets go through
 * `styles` (same as the app builder). That makes every story render against the
 * real `--rdr-*` custom properties.
 *
 * A `theme` toolbar toggle wraps each story in a themed surface (`.rdr-theme-dark`
 * for dark; light is the `:root` default), satisfying the story-specific QA:
 * a token-driven sample component renders in light *and* dark.
 */
const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Design-token theme',
      toolbar: {
        title: 'Theme',
        icon: 'contrast',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' },
  decorators: [
    componentWrapperDecorator(
      (story) =>
        `<div [class.rdr-theme-dark]="theme === 'dark'"
              style="padding:24px; min-height:100vh; box-sizing:border-box;
                     background:var(--rdr-color-backdrop); color:var(--rdr-color-text-primary);">${story}</div>`,
      ({ globals }) => ({ theme: globals['theme'] }),
    ),
  ],
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
