import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shared fixture-document builder for the renderer visual-regression specs
 * (consolidated in E4-S8). Every golden spec used to hand-copy the same
 * `<!doctype html>` scaffold — embedded font, the on-screen chrome CSS, the stage
 * wrapper — so the print stylesheet introduced by E4-S8 would have had to be
 * pasted into each one. This helper is the single home for that scaffold, so a
 * golden spec only supplies its serialized page/document HTML and a test id.
 *
 * e2e projects may not import workspace libs (Nx module boundaries), so the
 * renderer's HTML is pre-rendered into `__fixtures__/*.html` and read via `fs`
 * (drift-guarded by `golden-page-html.spec.ts`). The two CSS layers below follow
 * the same rule:
 *
 *  - **screen chrome** — a literal mirror of the renderer's `RENDERER_PAGE_CSS` /
 *    `RENDERER_DOCUMENT_CSS` on-screen chrome (page drop-shadow, the non-printing
 *    printable-area guide, the centred multi-page column). Kept as a literal here
 *    because e2e can't import the constant; the union of page + document rules is
 *    harmless for single-page fixtures (the document selectors simply don't match).
 *  - **print stylesheet** — the *genuine* renderer artifact, read from
 *    `__fixtures__/renderer-print.css` (emitted from `RENDERER_PRINT_CSS` by
 *    `tools/generate-render-fixtures.ts`). Appended after the screen chrome so the
 *    `*-print.png` snapshots, captured under `emulateMedia({ media: 'print' })`,
 *    exercise the real `@media print` rules — not a harness approximation.
 *
 * Determinism follows the E0-S5 harness: a vendored font (OFL) as a data URI plus
 * `document.fonts.ready`, so the only variable is the OS rasterizer — hence
 * canonical baselines are Linux-only and CI-generated (docs/testing/
 * visual-regression.md).
 */
const fontBase64 = readFileSync(
  join(__dirname, '..', 'assets', 'inter-latin-400-normal.woff2'),
).toString('base64');

/** The renderer's genuine `@media print` stylesheet (E4-S8 artifact). */
const printCss = readFileSync(join(__dirname, '__fixtures__', 'renderer-print.css'), 'utf8');

/**
 * On-screen chrome the harness paints around a serialized page/document: the grey
 * backdrop, the page drop-shadow, the printable-area guide, the multi-page column,
 * and the tiny content resets. Literal mirror of the renderer's screen chrome.
 */
const SCREEN_CHROME_CSS = `* { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { background: #e5e7eb; font-family: 'RendaraVisual', sans-serif; }
      .stage { padding: 16px; }
      .rdr-document { display: flex; flex-direction: column; align-items: center; gap: 24px; }
      .rdr-page-slot { position: relative; overflow: hidden; flex: 0 0 auto; }
      .rdr-page { box-shadow: 0 1px 3px rgba(15, 23, 42, 0.18), 0 4px 12px rgba(15, 23, 42, 0.12); overflow: hidden; }
      .rdr-printable { outline: 1px dashed rgba(79, 70, 229, 0.25); pointer-events: none; }
      .rdr-text { margin: 0; }
      .rdr-image { display: block; }
      .rdr-watermark { margin: 0; }
      .rdr-watermark-text { margin: 0; }
      .rdr-watermark-image { display: block; }`;

/**
 * Wraps a serialized renderer page/document in the full deterministic fixture
 * document (font + screen chrome + the genuine print stylesheet), tagged with
 * `data-testid="${testId}"` so the spec can target the stage for `toHaveScreenshot`.
 */
export function fixtureDocument(innerHtml: string, testId: string): string {
  return `<!doctype html>
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
      ${SCREEN_CHROME_CSS}
      ${printCss}
    </style>
  </head>
  <body>
    <div class="stage" data-testid="${testId}">${innerHtml}</div>
  </body>
</html>`;
}
