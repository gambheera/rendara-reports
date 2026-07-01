import { defineConfig, devices } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Playwright config for the viewer-demo host app (E0-S4).
 *
 * Intentionally self-contained: it does NOT import `@nx/devkit` /
 * `@nx/playwright/preset`, because Playwright loads this `.mts` file through
 * Node's ESM loader, and pulling Nx's native addon in via the CJS→ESM bridge
 * crashes on load. Output paths are routed under the git-ignored `dist/` tree.
 * Served on 4201 so it never collides with the designer dev server (4200).
 */
const configDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(configDir, '../..');

// For CI, set BASE_URL to point at a deployed/served instance.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4201';
const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  outputDir: '../../dist/.playwright/apps/viewer-demo-e2e/test-output',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [
        ['list'],
        [
          'html',
          { outputFolder: '../../dist/.playwright/apps/viewer-demo-e2e/report', open: 'never' },
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
  /* Serve the PRODUCTION build of the demo before the tests run (E9-S4).
     The demo consumes the BUILT `@rendara/report-viewer` package, whose
     partial-compiled FESM is resolved to AOT instructions by the Angular Linker
     — which runs in the production build but not the vite dev server's dependency
     optimizer. So e2e exercises `serve-static` (prod build + file server), which
     also matches what a host ships. The `build` it depends on runs
     `report-viewer:local-install`, installing the freshly bundled package. */
  webServer: {
    command: 'npx nx run viewer-demo:serve-static --port=4201',
    url: 'http://localhost:4201',
    reuseExistingServer: !isCI,
    cwd: workspaceRoot,
    timeout: 180_000,
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
