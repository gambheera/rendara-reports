import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Per-type renderer visual-regression snapshot (E4-S2, QA: "per-type visual
 * snapshots"). A compact A4 page with one of each fixed element type — a styled
 * text block, a horizontal rule (line), a filled+stroked rectangle, a dashed
 * ellipse, and an image — rendered through the same engine + shared serializer as
 * the certificate fixture and committed to `__fixtures__/element-types-page.html`
 * (`golden-page-html.spec.ts` guards it against drift). The image is an inline
 * data URI, so the page renders deterministically without the network.
 *
 * Determinism follows the E0-S5 harness: a vendored font as a data URI plus
 * `document.fonts.ready`, so the only variable is the OS rasterizer — hence
 * canonical baselines are Linux-only and CI-generated (docs/testing/
 * visual-regression.md).
 */
const fontBase64 = readFileSync(
  join(__dirname, '..', 'assets', 'inter-latin-400-normal.woff2'),
).toString('base64');

const pageHtml = readFileSync(join(__dirname, '__fixtures__', 'element-types-page.html'), 'utf8');

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
    </style>
  </head>
  <body>
    <div class="stage" data-testid="element-types-page">${pageHtml}</div>
  </body>
</html>`;

test.describe('Renderer per-type visual regression (E4-S2)', () => {
  test('renders one of each element type', async ({ page }) => {
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('element-types-page')).toHaveScreenshot('element-types-page.png');
  });
});
