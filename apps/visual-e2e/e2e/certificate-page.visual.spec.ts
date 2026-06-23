import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Renderer visual-regression snapshot (E4-S1, QA: "visual snapshot of the
 * certificate golden").
 *
 * The page HTML is real renderer output: `tools/generate-render-fixtures.ts`
 * paginates the certificate golden with the engine and serializes page 1 via the
 * same shared style helpers the Angular component uses, committing the result to
 * `__fixtures__/certificate-page.html` (e2e projects may not import workspace
 * libs — Nx module boundaries — so the artifact is pre-rendered and loaded here
 * via `fs`; `golden-page-html.spec.ts` guards it against drift). At E4-S1 the
 * elements are positioned host boxes — element content (text/shape/image) is
 * E4-S2, which enriches this same baseline.
 *
 * Determinism follows the E0-S5 harness: a vendored font as a data URI plus
 * `document.fonts.ready`, so the only variable is the OS rasterizer — hence
 * canonical baselines are Linux-only and CI-generated (docs/testing/
 * visual-regression.md).
 */
const fontBase64 = readFileSync(
  join(__dirname, '..', 'assets', 'inter-latin-400-normal.woff2'),
).toString('base64');

const pageHtml = readFileSync(join(__dirname, '__fixtures__', 'certificate-page.html'), 'utf8');

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
    </style>
  </head>
  <body>
    <div class="stage" data-testid="certificate-page">${pageHtml}</div>
  </body>
</html>`;

test.describe('Renderer visual regression (E4-S1)', () => {
  test('renders the certificate golden page frame', async ({ page }) => {
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('certificate-page')).toHaveScreenshot('certificate-page.png');
  });
});
