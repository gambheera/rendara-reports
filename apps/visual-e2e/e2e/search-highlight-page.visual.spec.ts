import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { fixtureDocument } from './fixture-page';

/**
 * In-report search highlight visual-regression snapshot (E8-S6, QA: "snapshot +
 * e2e" for the chosen optional viewer extra).
 *
 * The page HTML is real renderer output: `tools/generate-render-fixtures.ts`
 * renders the plain-table golden with an active search query ("Lamp"), so the
 * shared serializer wraps matching runs in `<mark class="rdr-mark">` exactly as
 * the viewer's Find feature paints them, with the first match promoted to the
 * active style — committed to `__fixtures__/search-highlight-page.html` (e2e
 * projects may not import workspace libs — Nx module boundaries — so the artifact
 * is pre-rendered and loaded here via `fs`; `golden-page-html.spec.ts` guards it
 * against drift).
 *
 * Determinism follows the E0-S5 harness: a vendored font as a data URI plus
 * `document.fonts.ready`, so the only variable is the OS rasterizer.
 */
const pageHtml = readFileSync(
  join(__dirname, '__fixtures__', 'search-highlight-page.html'),
  'utf8',
);

const FIXTURE_HTML = fixtureDocument(pageHtml, 'search-highlight-page');

test.describe('Renderer search-highlight visual regression (E8-S6)', () => {
  test('highlights matching runs, with a distinct active match', async ({ page }) => {
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('search-highlight-page')).toHaveScreenshot(
      'search-highlight-page.png',
    );
  });
});
