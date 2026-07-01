import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from '../../../tools/testing/axe';

/**
 * E6-S3 — Image control. Exercises the acceptance end-to-end: add an image, set
 * its source by URL and change its fit mode through the Properties panel, and
 * confirm safe-URL handling rejects a dangerous scheme. The canvas is the shared
 * renderer in design mode (an `<img class="rdr-image">` with the sanitised src +
 * object-fit), so what is edited is what the viewer renders.
 */
test.describe('Image properties', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('adds an image, edits its source + fit, and blocks a malicious URL', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('rdr-report-document');

    // Adding an Image auto-selects it; it renders immediately with the placeholder.
    await page.getByRole('button', { name: 'Add Image' }).click();
    const img = canvas.locator('img.rdr-image');
    await expect(img).toHaveCount(1);
    await expect(img).toHaveCSS('object-fit', 'contain');

    // A valid https URL is accepted and repaints the image.
    const url = 'https://upload.wikimedia.org/logo.png';
    await page.getByLabel('Source URL').fill(url);
    await expect(img).toHaveAttribute('src', url);

    // Changing the fit mode re-renders with the new object-fit.
    await page.getByLabel('Fit', { exact: true }).selectOption('cover');
    await expect(img).toHaveCSS('object-fit', 'cover');

    // A dangerous scheme is blocked: the model keeps the previous src and an error shows.
    await page.getByLabel('Source URL').fill('javascript:alert(1)');
    await expect(page.getByRole('alert')).toContainText(/blocked for security/i);
    await expect(img).toHaveAttribute('src', url);

    // The populated Properties form has no accessibility violations.
    await expectNoAxeViolations(page);
  });
});
