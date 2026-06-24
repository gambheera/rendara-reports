import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { fixtureDocument } from './fixture-page';

/**
 * Per-type renderer visual-regression snapshots (E4-S2, QA: "per-type visual
 * snapshots"; baseline consolidated in E4-S8). A compact A4 page with one of each
 * fixed element type — a styled text block, a horizontal rule (line), a
 * filled+stroked rectangle, a dashed ellipse, and an image — rendered through the
 * same engine + shared serializer as the certificate fixture and committed to
 * `__fixtures__/element-types-page.html` (`golden-page-html.spec.ts` guards it
 * against drift). The image is an inline data URI, so the page renders
 * deterministically without the network.
 *
 * Two snapshots (E4-S8): the on-screen render and a **print-mode** render under
 * `emulateMedia({ media: 'print' })`, where {@link fixtureDocument} applies the
 * renderer's genuine print stylesheet. The deterministic-font harness keeps the
 * only variable the OS rasterizer — canonical baselines are Linux-only and
 * CI-generated (docs/testing/visual-regression.md).
 */
const pageHtml = readFileSync(join(__dirname, '__fixtures__', 'element-types-page.html'), 'utf8');

const FIXTURE_HTML = fixtureDocument(pageHtml, 'element-types-page');

test.describe('Renderer per-type visual regression (E4-S2)', () => {
  test('renders one of each element type on screen', async ({ page }) => {
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('element-types-page')).toHaveScreenshot('element-types-page.png');
  });

  test('renders one of each element type under the print stylesheet', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('element-types-page')).toHaveScreenshot(
      'element-types-page-print.png',
    );
  });
});
