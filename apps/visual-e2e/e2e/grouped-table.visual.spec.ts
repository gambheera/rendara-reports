import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { fixtureDocument } from './fixture-page';

/**
 * Grouped data-table renderer visual-regression snapshots (E4-S3, QA: "visual
 * snapshots for plain + grouped tables"; baseline consolidated in E4-S8). A
 * compact A4-landscape page with a grouped table — two region groups, each with a
 * full-width header label, two detail rows, and a subtotal footer band, plus a
 * grand-total column footer — rendered through the same engine + shared serializer
 * as the other fixtures and committed to `__fixtures__/grouped-table-page.html`
 * (`golden-page-html.spec.ts` guards it against drift). The table content is
 * hand-resolved (no network, no JSONata) so the page renders deterministically.
 *
 * Two snapshots (E4-S8): the on-screen render and a **print-mode** render under
 * `emulateMedia({ media: 'print' })`, where {@link fixtureDocument} applies the
 * renderer's genuine print stylesheet. Canonical baselines are Linux-only and
 * CI-generated (docs/testing/visual-regression.md).
 */
const pageHtml = readFileSync(join(__dirname, '__fixtures__', 'grouped-table-page.html'), 'utf8');

const FIXTURE_HTML = fixtureDocument(pageHtml, 'grouped-table-page');

test.describe('Renderer grouped-table visual regression (E4-S3)', () => {
  test('renders group labels, subtotal footers and a grand total on screen', async ({ page }) => {
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('grouped-table-page')).toHaveScreenshot('grouped-table-page.png');
  });

  test('renders the grouped table under the print stylesheet', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('grouped-table-page')).toHaveScreenshot(
      'grouped-table-page-print.png',
    );
  });
});
