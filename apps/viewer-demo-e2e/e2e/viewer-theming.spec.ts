import { expect, test } from '@playwright/test';

/**
 * E9-S5 theming & isolation e2e. The demo host consumes the BUILT
 * `@rendara/report-viewer` package and exercises the documented theming +
 * isolation contract (README "Theming & style isolation", ADR 0017):
 *
 * 1. `[theme]` re-colours the viewer chrome via `--rdr-viewer-*` custom
 *    properties — the README's dark-theme example, live.
 * 2. The viewer does not leak its styles out: a light-DOM element carrying the
 *    viewer's class names is not restyled by the viewer (emulated encapsulation).
 * 3. A host page's ordinary (non-`!important`) cascade does not reach the
 *    rendered report (inline styles + the renderer reset hold).
 *
 * These are the doc examples "actually working in viewer-demo", tested (story QA).
 * They are assertion-based (computed styles), not screenshots — isolation is a
 * boolean property, deterministic on every OS.
 */
test.describe('viewer-demo theming & isolation (E9-S5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // The chrome appears only once the pipeline validated + paginated the sample.
    await expect(page.locator('.rdr-viewer-status')).toBeVisible();
  });

  test('the [theme] input re-colours the viewer chrome', async ({ page }) => {
    const scroll = page.locator('.rdr-viewer-scroll');
    const title = page.locator('.rdr-viewer-title');

    // Default chrome: the design-system backdrop / text tokens.
    await expect(scroll).toHaveCSS('background-color', 'rgb(243, 244, 246)'); // #f3f4f6
    await expect(title).toHaveCSS('color', 'rgb(17, 24, 39)'); // #111827

    // Apply the dark theme: the --rdr-viewer-* overrides flow to the chrome.
    await page.getByRole('button', { name: 'Use dark theme' }).click();
    await expect(scroll).toHaveCSS('background-color', 'rgb(15, 23, 42)'); // #0f172a
    await expect(title).toHaveCSS('color', 'rgb(229, 231, 235)'); // #e5e7eb

    // Toggle back: the override is removed and the defaults return.
    await page.getByRole('button', { name: 'Use default theme' }).click();
    await expect(scroll).toHaveCSS('background-color', 'rgb(243, 244, 246)');
  });

  test('the viewer does not leak its styles into the host page', async ({ page }) => {
    // Drop a light-DOM element on the host page carrying the viewer's own class
    // names. Emulated encapsulation scopes every `.rdr-viewer-*` / `.rdr-page`
    // rule to the viewer's own elements, so this victim must be untouched.
    const victim = await page.evaluate(() => {
      const el = document.createElement('p');
      el.id = 'leak-victim';
      el.className = 'rdr-viewer-title rdr-page';
      el.textContent = 'Host content';
      document.body.appendChild(el);
      const s = getComputedStyle(el);
      return { fontWeight: s.fontWeight, boxShadow: s.boxShadow };
    });

    // `.rdr-viewer-title { font-weight: 600 }` did not leak → default weight.
    expect(victim.fontWeight).toBe('400');
    // `.rdr-page { box-shadow: … }` did not leak → no drop shadow.
    expect(victim.boxShadow).toBe('none');
  });

  test('ordinary host CSS does not reach the rendered report', async ({ page }) => {
    // Inheritance-based hostile host styles: the common way a host page's cascade
    // would otherwise bleed into embedded content. The renderer reset pins the
    // report's typography, and its content is painted with inline styles, so the
    // report keeps its own colour + font.
    await page.addStyleTag({
      content: `body { color: rgb(255, 0, 0); font-family: 'Comic Sans MS'; }`,
    });

    const reportText = page.locator('.rdr-viewer-scroll .rdr-text').first();
    await expect(reportText).toBeVisible();

    const style = await reportText.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, fontFamily: s.fontFamily };
    });

    // The host's red never reaches the report text (inline styles + reset win).
    expect(style.color).not.toBe('rgb(255, 0, 0)');
    // Nor does the host's font — the report keeps a real font, not Comic Sans.
    expect(style.fontFamily).not.toContain('Comic Sans');
  });
});
