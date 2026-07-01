import { expect, test } from '@playwright/test';

/**
 * E9-S4 integration e2e. The demo host consumes the BUILT `@rendara/report-viewer`
 * package (not workspace source) and wires its public outputs (brief §8). These
 * tests prove the end-to-end integration story: the report renders, the
 * `rendered` / `pageChange` / `error` outputs reach the host, and the toolbar's
 * Print and Export actions are wired.
 */

test.describe('viewer-demo real integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // The status appears only once the pipeline validated + paginated the sample.
    await expect(page.locator('.rdr-viewer-status')).toBeVisible();
  });

  // `toHaveText` does not normalise whitespace when matching a RegExp, and the
  // host's interpolation leaves a single space around each value, so the value
  // patterns allow surrounding whitespace.
  test('surfaces the (rendered) output with a multi-page count', async ({ page }) => {
    const rendered = page.getByTestId('evt-rendered');
    await expect(rendered).toHaveText(/^\s*pageCount \d+\s*$/);
    const count = Number((await rendered.textContent())?.match(/pageCount (\d+)/)?.[1] ?? '0');
    expect(count).toBeGreaterThan(1);
  });

  test('surfaces the (pageChange) output as the visible page moves', async ({ page }) => {
    await expect(page.getByTestId('evt-pagechange')).toHaveText(/^\s*current 1 of \d+\s*$/);

    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByTestId('evt-pagechange')).toHaveText(/^\s*current 2 of \d+\s*$/);
  });

  test('surfaces the (error) output for an invalid template and recovers', async ({ page }) => {
    await page.getByRole('button', { name: 'Load invalid template' }).click();

    // The viewer surfaces a validation error (never throws) and shows its error UI.
    await expect(page.getByTestId('evt-error')).toHaveText(/validation: Template failed/);
    await expect(page.getByRole('alert')).toContainText("Couldn't render this report");

    // Restoring the valid sample re-renders and clears the error.
    await page.getByRole('button', { name: 'Load sample' }).click();
    await expect(page.locator('.rdr-viewer-status')).toBeVisible();
    await expect(page.getByTestId('evt-error')).toHaveText('—');
    await expect(page.getByTestId('evt-rendered')).toHaveText(/^\s*pageCount \d+\s*$/);
  });

  test('the Print action is wired to the browser print', async ({ page }) => {
    // Stub window.print so headless Chromium does not open a real dialog, and
    // assert the toolbar Print button invokes it.
    await page.evaluate(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => {
        (window as unknown as { __printed: number }).__printed += 1;
      };
    });

    await page.getByRole('button', { name: 'Print' }).click();

    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed))
      .toBe(1);
  });

  test('the Export action opens the wired Export PDF dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'Export PDF' }).click();

    // The export flow is wired through to the (swappable) exporter; assert the
    // dialog opens with its confirm action. Actual PDF generation is covered by
    // the viewer lib's own component tests.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
  });
});
