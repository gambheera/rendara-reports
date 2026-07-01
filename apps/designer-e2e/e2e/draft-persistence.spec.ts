import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from '../../../tools/testing/axe';

/**
 * E6-S11 — Draft persistence & file UX. Exercises the acceptance end-to-end:
 * autosave to local storage, a reload that restores the draft, and the
 * unsaved-changes guard that prevents accidental loss (story QA).
 */
test.describe('Draft persistence & file UX', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  /** The local-storage key the designer autosaves the draft under (E6-S11). */
  const DRAFT_KEY = 'rendara.designer.draft.v1';

  test('autosaves an edit and restores the draft after a reload', async ({ page }) => {
    await page.goto('/');

    // Author something and confirm the document is now flagged unsaved.
    await page.getByRole('button', { name: 'Add Text' }).click();
    await expect(page.locator('[data-element-id]')).toHaveCount(1);
    await expect(page.getByText('Unsaved changes')).toBeVisible();

    // The debounced autosave eventually writes the draft to local storage.
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY))
      .not.toBeNull();

    // The new file controls keep the top bar accessible.
    await expectNoAxeViolations(page);

    // Reload: the draft is restored, still flagged as unsaved work.
    await page.reload();
    await expect(page.locator('[data-element-id]')).toHaveCount(1);
    await expect(page.getByText('Unsaved changes')).toBeVisible();
  });

  test('New keeps the document when the discard guard is declined, clears it when accepted', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Text' }).click();
    await expect(page.locator('[data-element-id]')).toHaveCount(1);

    // Decline the unsaved-changes confirmation → the document is preserved.
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'New' }).click();
    await expect(page.locator('[data-element-id]')).toHaveCount(1);

    // Accept it → the document resets to the empty state.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'New' }).click();
    await expect(page.locator('[data-element-id]')).toHaveCount(0);
    await expect(page.getByText('Drag a control here to begin')).toBeVisible();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  });
});
