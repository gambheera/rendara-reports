import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Watermark & page-chrome visual-regression snapshots (E4-S7, QA: "visual
 * snapshot with watermark; print-mode snapshot").
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
 * media (the full print stylesheet is E4-S8/E8).
 *
 * Determinism follows the E0-S5 harness: a vendored font as a data URI plus
 * `document.fonts.ready`, so the only variable is the OS rasterizer — hence
 * canonical baselines are Linux-only and CI-generated (docs/testing/
 * visual-regression.md).
 */
const fontBase64 = readFileSync(
  join(__dirname, '..', 'assets', 'inter-latin-400-normal.woff2'),
).toString('base64');

const pageHtml = readFileSync(join(__dirname, '__fixtures__', 'watermark-page.html'), 'utf8');

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face {
        font-family: 'RendaraVisual';
        font-style: normal;
        font-weight: 400;
        src: url(data:font/woff2;base64,${fontBase64}) format('woff2');
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { background: #e5e7eb; font-family: 'RendaraVisual', sans-serif; }
      .stage { padding: 16px; }
      .rdr-page { box-shadow: 0 1px 3px rgba(15, 23, 42, 0.18), 0 4px 12px rgba(15, 23, 42, 0.12); overflow: hidden; }
      .rdr-printable { outline: 1px dashed rgba(79, 70, 229, 0.25); pointer-events: none; }
      .rdr-text { margin: 0; }
      .rdr-image { display: block; }
      .rdr-watermark { margin: 0; }
      .rdr-watermark-text { margin: 0; }
      .rdr-watermark-image { display: block; }
    </style>
  </head>
  <body>
    <div class="stage" data-testid="watermark-page">${pageHtml}</div>
  </body>
</html>`;

test.describe('Renderer watermark visual regression (E4-S7)', () => {
  test('renders a diagonal text watermark behind the page content', async ({ page }) => {
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('watermark-page')).toHaveScreenshot('watermark-page.png');
  });

  test('keeps the watermark in print media', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('watermark-page')).toHaveScreenshot('watermark-page-print.png');
  });
});
