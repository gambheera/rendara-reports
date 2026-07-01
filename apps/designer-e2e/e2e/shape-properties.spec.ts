import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from '../../../tools/testing/axe';

/**
 * E6-S2 — Shape controls (line / box / circle). Exercises the acceptance
 * end-to-end: add each shape and edit a shape's stroke + fill through the
 * Properties panel, confirming the canvas (the shared renderer in design mode)
 * re-renders the inline-SVG primitive live — the same renderer the viewer uses,
 * so what is edited is what renders. Per-shape primitive coverage (line / rect /
 * ellipse) backs the "per-shape snapshots" QA alongside the renderer's golden
 * HTML tests.
 */
test.describe('Shape properties', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('adds each shape and edits a rectangle stroke + fill live', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('rdr-report-document');

    // Adding a Rectangle auto-selects it; it renders as an inline SVG rect.
    await page.getByRole('button', { name: 'Add Rectangle' }).click();
    const rect = canvas.locator('svg.rdr-shape rect');
    await expect(rect).toHaveCount(1);
    // Solid by default → no dash pattern.
    await expect(rect).not.toHaveAttribute('stroke-dasharray', /.+/);

    // Switching the stroke style to dashed re-renders the rect with a dash array.
    await page.getByLabel('Stroke style').selectOption('dashed');
    await expect(rect).toHaveAttribute('stroke-dasharray', /\d/);

    // Enabling the interior fill paints the rect (default white fill).
    await expect(page.getByLabel('Fill colour')).toHaveCount(0);
    await page.getByLabel('Fill', { exact: true }).check();
    await expect(rect).toHaveAttribute('fill', '#FFFFFF');
    await expect(page.getByLabel('Fill colour')).toBeVisible();

    // The other two shape primitives render too (per-shape coverage).
    await page.getByRole('button', { name: 'Add Line' }).click();
    await expect(canvas.locator('svg.rdr-shape line')).toHaveCount(1);
    await page.getByRole('button', { name: 'Add Ellipse' }).click();
    await expect(canvas.locator('svg.rdr-shape ellipse')).toHaveCount(1);

    // The populated Properties form has no accessibility violations.
    await expectNoAxeViolations(page);
  });
});
