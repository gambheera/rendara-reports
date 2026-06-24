import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from '../../../tools/testing/axe';

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

  test('switches palette tabs', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('tab', { name: 'Data' }).click();
    await expect(page.getByText('No data imported')).toBeVisible();
  });

  test('has no detectable accessibility violations', async ({ page }) => {
    await page.goto('/');

    await expectNoAxeViolations(page);
  });
});
