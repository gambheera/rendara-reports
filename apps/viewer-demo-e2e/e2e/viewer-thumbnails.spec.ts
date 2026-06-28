import { expect, test } from '@playwright/test';

/**
 * E8-S7 optional thumbnail-rail e2e. The demo host renders the embedded viewer
 * with its default toolbar, which includes the Toggle page thumbnails action and
 * shows the rail by default. Clicking the toggle hides the rail from the DOM (and
 * flips its pressed state); clicking again brings it back.
 */
test.describe('viewer optional thumbnail rail', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the pipeline to render the chrome (status shows once paginated).
    await expect(page.getByText(/^Page \d+ of \d+$/)).toBeVisible();
  });

  test('shows the rail and a pressed toggle by default', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: 'Pages' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Toggle page thumbnails' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('toggle hides then re-shows the rail', async ({ page }) => {
    const rail = page.getByRole('navigation', { name: 'Pages' });
    const toggle = page.getByRole('button', { name: 'Toggle page thumbnails' });

    await toggle.click();
    await expect(rail).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    await expect(rail).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });
});
