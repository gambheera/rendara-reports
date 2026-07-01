import { expect, test } from '@playwright/test';

/**
 * E8-S6 in-report search e2e. The demo host renders the embedded viewer with its
 * default toolbar, which includes the Find action. Opening Find, typing a query
 * should highlight matches across the rendered pages, show a match count, and let
 * the user step through hits with next/previous.
 */
test.describe('viewer in-report search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the pipeline to render the chrome (status shows once paginated).
    await expect(page.locator('.rdr-viewer-status')).toBeVisible();
  });

  test('opens Find, highlights matches and reports a count', async ({ page }) => {
    await page.getByRole('button', { name: 'Find in report' }).click();

    const input = page.getByRole('textbox', { name: 'Find in report' });
    await expect(input).toBeVisible();
    await input.fill('Service');

    // Matches are highlighted on screen (at least one <mark>), and the count reads
    // "1 / N" with the first match active.
    await expect(page.locator('.rdr-viewer-scroll mark.rdr-mark').first()).toBeVisible();
    await expect(page.locator('.rdr-viewer-search-count')).toHaveText(/^1 \/ \d+$/);
    // Exactly one active match is marked.
    await expect(page.locator('mark.rdr-mark--active')).toHaveCount(1);
  });

  test('steps through matches with next/previous', async ({ page }) => {
    await page.getByRole('button', { name: 'Find in report' }).click();
    const input = page.getByRole('textbox', { name: 'Find in report' });
    await input.fill('Service');

    const count = page.locator('.rdr-viewer-search-count');
    await expect(count).toHaveText(/^1 \/ \d+$/);
    const total = Number((await count.textContent())!.split('/')[1].trim());

    if (total > 1) {
      await page.getByRole('button', { name: 'Next match' }).click();
      await expect(count).toHaveText(`2 / ${total}`);
      // Previous from match 2 returns to match 1.
      await page.getByRole('button', { name: 'Previous match' }).click();
      await expect(count).toHaveText(`1 / ${total}`);
      // Previous from match 1 wraps to the last.
      await page.getByRole('button', { name: 'Previous match' }).click();
      await expect(count).toHaveText(`${total} / ${total}`);
    }
  });

  test('reports no matches and clears highlights on close', async ({ page }) => {
    await page.getByRole('button', { name: 'Find in report' }).click();
    const input = page.getByRole('textbox', { name: 'Find in report' });

    await input.fill('zzzznomatch');
    await expect(page.locator('.rdr-viewer-search-count')).toHaveText('0 / 0');
    await expect(page.locator('.rdr-viewer-scroll mark.rdr-mark')).toHaveCount(0);

    // A real query highlights, then closing the bar removes every mark.
    await input.fill('Service');
    await expect(page.locator('.rdr-viewer-scroll mark.rdr-mark').first()).toBeVisible();
    await page.getByRole('button', { name: 'Close find' }).click();
    await expect(page.getByRole('textbox', { name: 'Find in report' })).toBeHidden();
    await expect(page.locator('.rdr-viewer-scroll mark.rdr-mark')).toHaveCount(0);
  });
});
