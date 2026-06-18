import { expect, test } from '@playwright/test';

test('renders the viewer demo host heading', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Rendara Reports — Viewer demo host',
  );
});
