import { expect, test } from '@playwright/test';

/**
 * E7-S4 zoom e2e. The demo host embeds a sample report in the viewer; these drive
 * the live zoom controls — the `−`/`%`/`+` stepper and the fit-mode dropdown — and
 * assert both the percent readout and that the *rendered* page sheet actually
 * rescales (its on-screen width tracks the zoom), so the zoom is applied
 * end-to-end and not just reflected in the chrome. A viewport resize asserts the
 * fit modes re-resolve against the container ("fit math correct across container
 * sizes"); the unit-level fit arithmetic is covered by the renderer's
 * `resolveZoomFactor` tests.
 *
 * Pixel-level baselines of the rendered output at zoom live in the renderer's
 * visual-regression set (`apps/visual-e2e`, the `multi-page-document` golden the
 * viewer forwards the identical `ZoomSpec` to); these checks cover the viewer's
 * interactive zoom behaviour on top of it.
 */

/** The on-screen width (px) of the main rendered page sheet (not a rail thumbnail). */
async function pageWidth(page: import('@playwright/test').Page): Promise<number> {
  const box = await page.locator('.rdr-viewer-scroll .rdr-page').first().boundingBox();
  return box?.width ?? 0;
}

/** The zoom percent shown in the readout, parsed to an integer. */
async function readoutPercent(page: import('@playwright/test').Page): Promise<number> {
  const text = (await page.locator('.rdr-viewer-zoom-readout').textContent())?.trim() ?? '';
  return Number(text.replace('%', ''));
}

test.describe('viewer zoom', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.rdr-viewer-status')).toBeVisible();
  });

  test('renders the zoom stepper, readout and fit-mode dropdown', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible();
    await expect(page.locator('#rdr-viewer-zoom')).toBeVisible();
    await expect(page.locator('.rdr-viewer-zoom-readout')).toHaveText(/^\d+%$/);
  });

  test('zoom in enlarges the rendered page and updates the readout', async ({ page }) => {
    const before = await pageWidth(page);
    const beforePercent = await readoutPercent(page);

    await page.getByRole('button', { name: 'Zoom in' }).click();

    await expect.poll(() => readoutPercent(page)).toBeGreaterThan(beforePercent);
    await expect.poll(() => pageWidth(page)).toBeGreaterThan(before);
  });

  test('zoom out shrinks the rendered page after zooming in', async ({ page }) => {
    await page.getByRole('button', { name: 'Zoom in' }).click();
    const enlarged = await pageWidth(page);

    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect.poll(() => pageWidth(page)).toBeLessThan(enlarged);
  });

  test('selecting an explicit percent sets the zoom', async ({ page }) => {
    await page.locator('#rdr-viewer-zoom').selectOption('0.5');
    await expect(page.locator('.rdr-viewer-zoom-readout')).toHaveText('50%');
  });

  test('fit-width re-resolves when the container is resized', async ({ page }) => {
    await page.locator('#rdr-viewer-zoom').selectOption('fit-width');
    const wide = await pageWidth(page);

    // Narrow the viewport: a fit-width page must shrink to keep filling the width.
    await page.setViewportSize({ width: 800, height: 720 });
    await expect.poll(() => pageWidth(page)).toBeLessThan(wide);
  });
});
