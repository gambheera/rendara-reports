import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Self-contained visual-regression smoke test (E0-S5).
 *
 * The fixture embeds its own font (vendored woff2, OFL) as a data URI and waits
 * for `document.fonts.ready`, so rendering depends on nothing in the host
 * environment except the OS rasterizer. It deliberately does not load any app
 * page — the designer/viewer shells are skeletons that will churn; real report
 * snapshots are added against this same harness once the renderer (Epic 4)
 * lands. Content mirrors the renderer's core primitives: pinned-font text, a
 * filled rectangle and a rule.
 */
const fontBase64 = readFileSync(
  join(__dirname, '..', 'assets', 'inter-latin-400-normal.woff2'),
).toString('base64');

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
      html, body { background: #ffffff; }
      .page {
        width: 560px;
        padding: 24px;
        font-family: 'RendaraVisual', sans-serif;
        color: #111827;
      }
      .title { font-size: 24px; line-height: 1.2; margin-bottom: 20px; }
      .rect { width: 240px; height: 64px; background: #4f46e5; }
      .rule { height: 0; border-top: 2px solid #111827; margin-top: 20px; }
    </style>
  </head>
  <body>
    <div class="page" data-testid="fixture">
      <div class="title">Rendara Reports — visual harness</div>
      <div class="rect"></div>
      <div class="rule"></div>
    </div>
  </body>
</html>`;

test.describe('Visual-regression harness', () => {
  test('renders the deterministic fixture', async ({ page }) => {
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('fixture')).toHaveScreenshot('harness.png');
  });
});
