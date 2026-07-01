import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from '../../../tools/testing/axe';

/**
 * E6-S1 — Text control. Exercises the acceptance end-to-end: add a text element,
 * edit its literal content and style through the Properties panel, and confirm the
 * canvas (the shared renderer in design mode) re-renders live — the same renderer
 * the viewer uses, so what is edited is what renders.
 */
test.describe('Text properties', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('edits literal text and weight live via the Properties panel', async ({ page }) => {
    await page.goto('/');

    // Adding a Text control auto-selects it, so Properties shows Layout + Text.
    await page.getByRole('button', { name: 'Add Text' }).click();
    await expect(page.locator('[data-element-id]')).toHaveCount(1);

    // The canvas renders the default literal text.
    const canvas = page.locator('rdr-report-document');
    await expect(canvas.getByText('Text', { exact: true })).toBeVisible();

    // Editing the content re-renders the canvas live with the new string.
    await page.getByLabel('Content').fill('Invoice');
    await expect(canvas.getByText('Invoice', { exact: true })).toBeVisible();

    // The Reg/Bold toggle styles the run; the active state reflects in the control.
    const bold = page.getByRole('button', { name: 'Bold' });
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await bold.click();
    await expect(bold).toHaveAttribute('aria-pressed', 'true');

    // The populated Properties form has no accessibility violations.
    await expectNoAxeViolations(page);
  });
});
