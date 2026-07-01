import { expect, test } from '@playwright/test';

// Accessibility (axe) scans for the designer live in `designer-a11y.spec.ts`,
// tagged `@a11y` so the dedicated CI gate can select them (E10-S1).

test.describe('Designer shell', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('lays out the four zones at desktop width', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('main', { name: 'Report canvas' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Insert palette' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Properties' })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
    await expect(page.getByText('Drag a control here to begin')).toBeVisible();
  });

  test('collapses and re-expands a side panel', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Collapse insert panel' }).click();
    await expect(page.getByRole('complementary', { name: 'Insert palette' })).toBeHidden();

    await page.getByRole('button', { name: 'Expand insert panel' }).click();
    await expect(page.getByRole('complementary', { name: 'Insert palette' })).toBeVisible();
  });

  test('hosts the shared renderer in design mode and zooms', async ({ page }) => {
    await page.goto('/');

    // The canvas paints with the shared renderer in design mode (E5-S4).
    await expect(page.locator('rdr-report-document')).toBeVisible();
    await expect(page.locator('[data-rdr-mode="design"]').first()).toBeVisible();

    // The status-bar zoom control steps the live percentage.
    await expect(page.getByText('100%')).toBeVisible();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.getByText('110%')).toBeVisible();
  });

  test('switches palette tabs', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('tab', { name: 'Data' }).click();
    await expect(page.getByRole('button', { name: 'Import sample data' })).toBeVisible();
  });

  test('opens page setup and applies an A4 → Letter change', async ({ page }) => {
    await page.goto('/');

    const summary = page.getByRole('button', { name: /Page setup/ });
    await expect(summary).toHaveText('A4 · Portrait · mm');

    await summary.click();
    const dialog = page.getByRole('dialog', { name: 'Page setup' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Paper').selectOption('Letter');
    await dialog.getByRole('button', { name: 'Landscape' }).click();
    await dialog.getByRole('button', { name: 'Apply' }).click();

    await expect(dialog).toBeHidden();
    await expect(summary).toHaveText('Letter · Landscape · mm');

    // The canvas re-paginated live: the rendered sheet now has the Letter-landscape
    // aspect ratio (279.4 × 215.9 mm ≈ 1.294).
    const box = await page.locator('[data-page-number="1"]').first().boundingBox();
    if (box === null) throw new Error('rendered page slot has no bounding box');
    expect(box.width / box.height).toBeCloseTo(279.4 / 215.9, 2);
  });

  test('cancelling page setup leaves the page model unchanged', async ({ page }) => {
    await page.goto('/');

    const summary = page.getByRole('button', { name: /Page setup/ });
    await summary.click();
    await page
      .getByRole('dialog', { name: 'Page setup' })
      .getByLabel('Paper')
      .selectOption('Letter');
    await page
      .getByRole('dialog', { name: 'Page setup' })
      .getByRole('button', { name: 'Cancel' })
      .click();

    await expect(summary).toHaveText('A4 · Portrait · mm');
  });
});
