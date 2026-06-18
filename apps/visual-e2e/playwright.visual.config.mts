import { defineConfig, devices } from '@playwright/test';

/**
 * Visual-regression Playwright config (E0-S5).
 *
 * Named `playwright.visual.config.mts` (not `playwright.config.mts`) so the
 * `@nx/playwright/plugin` does not infer an `e2e` target — visual regression is
 * a separate `visual` target wired in project.json, kept out of the functional
 * e2e gate. Like the E0-S4 e2e configs it is self-contained (no Nx imports).
 *
 * Determinism: a fixed viewport + device scale, disabled animations, reduced
 * motion and a forced light scheme. The example spec embeds its own font and
 * waits for `document.fonts.ready`, so the only remaining variable is the OS
 * rasterizer — which is why **canonical baselines are Linux-only and generated
 * by CI** (see docs/testing/visual-regression.md). No web server is needed; the
 * fixture is rendered via `page.setContent()`.
 */
const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.visual.spec.ts',
  outputDir: '../../dist/.playwright/apps/visual-e2e/test-output',
  // Commit only `*-linux.png`; `*-win32.png` / `*-darwin.png` are git-ignored.
  snapshotPathTemplate: 'e2e/__screenshots__/{testFileName}/{arg}-{projectName}-{platform}{ext}',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  reporter: isCI
    ? [
        ['list'],
        ['html', { outputFolder: '../../dist/.playwright/apps/visual-e2e/report', open: 'never' }],
      ]
    : [['list']],
  use: {
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  },
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      // Small tolerances absorb sub-pixel noise without hiding real regressions.
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
