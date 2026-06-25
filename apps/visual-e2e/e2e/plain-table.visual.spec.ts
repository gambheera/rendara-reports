import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { fixtureDocument } from './fixture-page';

/**
 * Plain data-table renderer visual-regression snapshots (E4-S3, QA: "visual
 * snapshots for plain + grouped tables"; baseline consolidated in E4-S8). A
 * compact A4-portrait page with one ungrouped table — a header row, three detail
 * rows with right-aligned numeric columns, and a grand-total column footer —
 * rendered through the same engine + shared serializer as the other fixtures and
 * committed to `__fixtures__/plain-table-page.html` (`golden-page-html.spec.ts`
 * guards it against drift). The table content is hand-resolved (no network, no
 * JSONata) so the page renders deterministically.
 *
 * Two snapshots (E4-S8): the on-screen render and a **print-mode** render under
 * `emulateMedia({ media: 'print' })`, where {@link fixtureDocument} applies the
 * renderer's genuine print stylesheet. Canonical baselines are Linux-only and
 * CI-generated (docs/testing/visual-regression.md).
 */
const pageHtml = readFileSync(join(__dirname, '__fixtures__', 'plain-table-page.html'), 'utf8');

const FIXTURE_HTML = fixtureDocument(pageHtml, 'plain-table-page');

test.describe('Renderer plain-table visual regression (E4-S3)', () => {
  test('renders header, detail rows and a grand-total footer on screen', async ({ page }) => {
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('plain-table-page')).toHaveScreenshot('plain-table-page.png');
  });

  test('renders the plain table under the print stylesheet', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('plain-table-page')).toHaveScreenshot(
      'plain-table-page-print.png',
    );
  });
});
