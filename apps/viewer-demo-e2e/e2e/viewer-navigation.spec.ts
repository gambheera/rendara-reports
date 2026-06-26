import { expect, test } from '@playwright/test';

/**
 * E7-S3 page-navigation e2e. The demo host wires a multi-page sample report into
 * the embedded viewer in single-page mode, so navigating swaps the visible page.
 * These drive the next/prev/goto controls and keyboard navigation and assert the
 * `Page x of y` status tracks the move.
 */

test.describe('viewer page navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the pipeline to render the chrome (status shows once paginated).
    await expect(page.getByText(/^Page \d+ of \d+$/)).toBeVisible();
  });

  test('starts on page 1 with prev disabled and a multi-page document', async ({ page }) => {
    const status = page.getByText(/^Page \d+ of \d+$/);
    await expect(status).toHaveText(/^Page 1 of \d+$/);

    const total = Number((await status.textContent())?.match(/of (\d+)/)?.[1] ?? '0');
    expect(total).toBeGreaterThan(1);

    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  test('next / prev move the visible page', async ({ page }) => {
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText(/^Page \d+ of \d+$/)).toHaveText(/^Page 2 of \d+$/);
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeEnabled();

    await page.getByRole('button', { name: 'Previous page' }).click();
    await expect(page.getByText(/^Page \d+ of \d+$/)).toHaveText(/^Page 1 of \d+$/);
  });

  test('goto input jumps to a typed page', async ({ page }) => {
    const goto = page.locator('#rdr-viewer-goto');
    await goto.fill('3');
    await goto.blur();
    await expect(page.getByText(/^Page \d+ of \d+$/)).toHaveText(/^Page 3 of \d+$/);
  });

  test('keyboard PageDown / PageUp navigate', async ({ page }) => {
    await page.getByRole('region', { name: 'Report pages' }).focus();
    await page.keyboard.press('PageDown');
    await expect(page.getByText(/^Page \d+ of \d+$/)).toHaveText(/^Page 2 of \d+$/);
    await page.keyboard.press('PageUp');
    await expect(page.getByText(/^Page \d+ of \d+$/)).toHaveText(/^Page 1 of \d+$/);
  });

  test('the thumbnail rail navigates and marks the current page', async ({ page }) => {
    await page.getByRole('button', { name: 'Go to page 2' }).click();
    await expect(page.getByText(/^Page \d+ of \d+$/)).toHaveText(/^Page 2 of \d+$/);
    await expect(page.getByRole('button', { name: 'Go to page 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
