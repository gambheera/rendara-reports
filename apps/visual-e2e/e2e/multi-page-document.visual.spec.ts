import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { fixtureDocument } from './fixture-page';

/**
 * Multi-page document renderer visual-regression snapshots (E4-S4, QA: "multi-page
 * golden renders correct page count; zoom levels visually snapshotted"; baseline
 * consolidated in E4-S8). A single long table paginated into several A4-portrait
 * pages, serialized as a whole document at a reduced zoom (0.4) so the snapshot
 * shows the pages stacked — the multi-page layout and the zoom transform captured
 * in one artifact. Rendered through the same engine + shared serializer as the
 * other fixtures and committed to `__fixtures__/multi-page-document.html`
 * (`golden-page-html.spec.ts` guards it against drift). The table content is
 * hand-resolved (no network, no JSONata) so the page count + slicing are
 * deterministic.
 *
 * Two snapshots (E4-S8): the on-screen render and a **print-mode** render under
 * `emulateMedia({ media: 'print' })`, where {@link fixtureDocument} applies the
 * renderer's genuine print stylesheet (the stacked pages collapse their gaps and
 * the backdrop turns white). Canonical baselines are Linux-only and CI-generated
 * (docs/testing/visual-regression.md).
 */
const documentHtml = readFileSync(
  join(__dirname, '__fixtures__', 'multi-page-document.html'),
  'utf8',
);

const FIXTURE_HTML = fixtureDocument(documentHtml, 'multi-page-document');

test.describe('Renderer multi-page document visual regression (E4-S4)', () => {
  test('stacks several pages at a reduced zoom on screen', async ({ page }) => {
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('multi-page-document')).toHaveScreenshot(
      'multi-page-document.png',
    );
  });

  test('stacks the pages under the print stylesheet', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('multi-page-document')).toHaveScreenshot(
      'multi-page-document-print.png',
    );
  });
});
