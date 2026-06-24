import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Style-isolation e2e (E4-S5, QA: "rendered inside a host page with hostile global
 * CSS, output is unaffected; host styles unchanged by the viewer"). The renderer's
 * opt-in Shadow-DOM mode is exercised directly: the committed `style-isolation.html`
 * fixture (the shared reset/theme/chrome stylesheet + a serialized report page —
 * exactly what the `ReportSurface` shadow root carries) is dropped into a real
 * `attachShadow` root on a host page whose global CSS is deliberately hostile.
 *
 * This is **assertion-based** (computed styles), not a screenshot: isolation is a
 * boolean property, so it asserts deterministically on every OS with no committed
 * baseline image (unlike the rendered-output snapshots; see
 * docs/testing/visual-regression.md).
 */
const isolationContent = readFileSync(
  join(__dirname, '__fixtures__', 'style-isolation.html'),
  'utf8',
).trim();

/**
 * A host page with aggressively hostile global CSS — `!important` on a universal
 * selector and on `div`, the very things that defeat emulated encapsulation — plus
 * a light-DOM "victim" carrying the renderer's own class names, to prove the
 * renderer does not leak its styles back out.
 */
const HOSTILE_HOST_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      * { color: rgb(255, 0, 0) !important; font-family: 'Comic Sans MS' !important; }
      div { border: 5px solid rgb(255, 0, 0) !important; background: rgb(255, 255, 0) !important; }
      body { font-size: 40px; letter-spacing: 6px; text-transform: uppercase; }
    </style>
  </head>
  <body>
    <p id="host-victim" class="rdr-page rdr-text" style="margin: 25px">Host content</p>
    <div id="rdr-host"></div>
  </body>
</html>`;

test.describe('Renderer style isolation (E4-S5)', () => {
  test('hostile host CSS does not reach the report, and the report does not leak out', async ({
    page,
  }) => {
    await page.setContent(HOSTILE_HOST_PAGE, { waitUntil: 'load' });

    // Mount the renderer output inside a real shadow root (the viewer's isolated mode).
    await page.evaluate((inner) => {
      const host = document.getElementById('rdr-host');
      if (host === null) throw new Error('missing host element');
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = inner;
    }, isolationContent);

    // --- 1. Host CSS is blocked from reaching the report -------------------
    // A table cell carries no inline colour, so it inherits the renderer reset
    // (#111827) — not the host's `* { color: red !important }`.
    const cellColor = await page.evaluate(() => {
      const root = document.getElementById('rdr-host')?.shadowRoot;
      const cell = root?.querySelector('.rdr-table-cell');
      return cell ? getComputedStyle(cell).color : null;
    });
    expect(cellColor).toBe('rgb(17, 24, 39)');

    // The page root keeps the renderer font stack, not the host's Comic Sans.
    const pageFont = await page.evaluate(() => {
      const root = document.getElementById('rdr-host')?.shadowRoot;
      const pageEl = root?.querySelector('.rdr-page');
      return pageEl ? getComputedStyle(pageEl).fontFamily : null;
    });
    expect(pageFont).toContain('Inter');
    expect(pageFont).not.toContain('Comic Sans');

    // The host's `div { border: 5px … !important }` cannot cross the boundary.
    const pageBorder = await page.evaluate(() => {
      const root = document.getElementById('rdr-host')?.shadowRoot;
      const pageEl = root?.querySelector('.rdr-page');
      return pageEl ? getComputedStyle(pageEl).borderTopWidth : null;
    });
    expect(pageBorder).toBe('0px');

    // --- 2. The report does not leak its styles back into the host ---------
    // The light-DOM victim uses the renderer's class names, but the renderer's
    // `.rdr-page`/`.rdr-text` rules live inside the shadow root, so they do not
    // restyle it: its inline margin stands and it gets no page drop-shadow.
    const victim = await page.evaluate(() => {
      const el = document.getElementById('host-victim');
      if (el === null) return null;
      const s = getComputedStyle(el);
      return { marginTop: s.marginTop, boxShadow: s.boxShadow };
    });
    expect(victim?.marginTop).toBe('25px');
    expect(victim?.boxShadow).toBe('none');

    // --- 3. Theming via CSS custom properties ------------------------------
    // Overriding a token on the shadow host re-themes the table header fill.
    const headerFill = await page.evaluate(() => {
      const host = document.getElementById('rdr-host');
      host?.style.setProperty('--rdr-table-header-fill', 'rgb(0, 128, 0)');
      const root = host?.shadowRoot;
      const header = root?.querySelector('.rdr-table-row[data-row-kind="header"]');
      return header ? getComputedStyle(header).backgroundColor : null;
    });
    expect(headerFill).toBe('rgb(0, 128, 0)');
  });
});
