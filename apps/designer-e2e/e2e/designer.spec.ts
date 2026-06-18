import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from '../../../tools/testing/axe';

test.describe('Designer shell', () => {
  test('renders the designer heading', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Rendara Reports — Designer',
    );
  });

  test('has no detectable accessibility violations', async ({ page }) => {
    await page.goto('/');

    await expectNoAxeViolations(page);
  });
});
