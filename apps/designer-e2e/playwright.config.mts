import { defineConfig, devices } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Playwright config for the designer app (E0-S4).
 *
 * Intentionally self-contained: it does NOT import `@nx/devkit` /
 * `@nx/playwright/preset`, because Playwright loads this `.mts` file through
 * Node's ESM loader, and pulling Nx's native addon in via the CJS→ESM bridge
 * crashes on load. Output paths are routed under the git-ignored `dist/` tree.
 */
const configDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(configDir, '../..');

// For CI, set BASE_URL to point at a deployed/served instance.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200';
const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  outputDir: '../../dist/.playwright/apps/designer-e2e/test-output',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [
        ['list'],
        [
          'html',
          { outputFolder: '../../dist/.playwright/apps/designer-e2e/report', open: 'never' },
        ],
      ]
    : [['list']],
  use: {
    baseURL,
    /* Fixed viewport keeps the harness deterministic and gives E0-S5's
       visual-regression baselines a stable environment to build on. */
    viewport: { width: 1280, height: 720 },
    /* Collect trace when retrying a failed test. */
    trace: 'on-first-retry',
  },
  /* Start the designer dev server before the tests run. */
  webServer: {
    command: 'npx nx run designer:serve',
    url: 'http://localhost:4200',
    reuseExistingServer: !isCI,
    cwd: workspaceRoot,
    timeout: 120_000,
  },
  /* v1 runs Chromium only for a fast, deterministic gate; the cross-browser
     matrix is a hardening concern (brief Epic 10). */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
