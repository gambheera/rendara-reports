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

    // The canvas paper resized live to the new geometry.
    const aspect = await page
      .getByRole('img', { name: 'Report page' })
      .evaluate((el) => getComputedStyle(el).aspectRatio);
    expect(aspect.replace(/\s/g, '')).toBe('279.4/215.9');
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

  test('has no detectable accessibility violations', async ({ page }) => {
    await page.goto('/');

    await expectNoAxeViolations(page);
  });

  test('page setup dialog has no detectable accessibility violations', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /Page setup/ }).click();
    await expect(page.getByRole('dialog', { name: 'Page setup' })).toBeVisible();

    await expectNoAxeViolations(page);
  });
});
