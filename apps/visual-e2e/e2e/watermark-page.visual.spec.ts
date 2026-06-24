import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { fixtureDocument } from './fixture-page';

/**
 * Watermark & page-chrome visual-regression snapshots (E4-S7, QA: "visual
 * snapshot with watermark; print-mode snapshot"; harness consolidated in E4-S8).
 *
 * The page HTML is real renderer output: `tools/generate-render-fixtures.ts`
 * paginates the plain-table golden *with* a `CONFIDENTIAL` text watermark (the
 * engine echoes the render-time config onto the document; brief §8 / ADR 0007),
 * then serializes page 1 via the same shared style helpers the Angular component
 * uses — committed to `__fixtures__/watermark-page.html` (e2e projects may not
 * import workspace libs — Nx module boundaries — so the artifact is pre-rendered
 * and loaded here via `fs`; `golden-page-html.spec.ts` guards it against drift).
 *
 * Two snapshots: the on-screen render, and a **print-mode** render under
 * `emulateMedia({ media: 'print' })` to confirm the watermark survives print
 * media — now under the renderer's genuine print stylesheet that {@link
 * fixtureDocument} applies (`print-color-adjust: exact` keeps the overlay from
 * being dropped by the print engine's ink-saving default; E4-S8).
 *
 * Determinism follows the E0-S5 harness: a vendored font as a data URI plus
 * `document.fonts.ready`, so the only variable is the OS rasterizer — hence
 * canonical baselines are Linux-only and CI-generated (docs/testing/
 * visual-regression.md).
 */
const pageHtml = readFileSync(join(__dirname, '__fixtures__', 'watermark-page.html'), 'utf8');

const FIXTURE_HTML = fixtureDocument(pageHtml, 'watermark-page');

test.describe('Renderer watermark visual regression (E4-S7)', () => {
  test('renders a diagonal text watermark behind the page content', async ({ page }) => {
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('watermark-page')).toHaveScreenshot('watermark-page.png');
  });

  test('keeps the watermark under the print stylesheet', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('watermark-page')).toHaveScreenshot('watermark-page-print.png');
  });
});
