import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Multi-page document renderer visual-regression snapshot (E4-S4, QA: "multi-page
 * golden renders correct page count; zoom levels visually snapshotted"). A single
 * long table paginated into several A4-portrait pages, serialized as a whole
 * document at a reduced zoom (0.4) so the snapshot shows the pages stacked — the
 * multi-page layout and the zoom transform captured in one artifact. Rendered
 * through the same engine + shared serializer as the other fixtures and committed
 * to `__fixtures__/multi-page-document.html` (`golden-page-html.spec.ts` guards it
 * against drift). The table content is hand-resolved (no network, no JSONata) so
 * the page count + slicing are deterministic.
 *
 * Determinism follows the E0-S5 harness: a vendored font as a data URI plus
 * `document.fonts.ready`, so the only variable is the OS rasterizer — hence
 * canonical baselines are Linux-only and CI-generated (docs/testing/
 * visual-regression.md).
 */
const fontBase64 = readFileSync(
  join(__dirname, '..', 'assets', 'inter-latin-400-normal.woff2'),
).toString('base64');

const documentHtml = readFileSync(
  join(__dirname, '__fixtures__', 'multi-page-document.html'),
  'utf8',
);

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
      .rdr-document { display: flex; flex-direction: column; align-items: center; gap: 24px; }
      .rdr-page-slot { position: relative; overflow: hidden; flex: 0 0 auto; }
      .rdr-page { box-shadow: 0 1px 3px rgba(15, 23, 42, 0.18), 0 4px 12px rgba(15, 23, 42, 0.12); overflow: hidden; }
      .rdr-printable { outline: 1px dashed rgba(79, 70, 229, 0.25); pointer-events: none; }
      .rdr-text { margin: 0; }
      .rdr-image { display: block; }
    </style>
  </head>
  <body>
    <div class="stage" data-testid="multi-page-document">${documentHtml}</div>
  </body>
</html>`;

test.describe('Renderer multi-page document visual regression (E4-S4)', () => {
  test('stacks several pages at a reduced zoom', async ({ page }) => {
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('multi-page-document')).toHaveScreenshot(
      'multi-page-document.png',
    );
  });
});
