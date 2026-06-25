import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from '../../../tools/testing/axe';

/**
 * E6-S4 — Data-table control. Exercises the acceptance end-to-end: add a table,
 * then add / remove / resize its columns through the Properties panel. The canvas
 * is the shared renderer in design mode, so a data table renders its column
 * **header row** (a header-only structural preview until data binding in E6-S8) —
 * adding a column adds a header cell, removing one drops it, and resizing a column
 * widens its rendered cell. What is edited is what the viewer renders.
 */
test.describe('Data-table properties', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('adds a table, then adds, removes and resizes its columns', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('rdr-report-document');

    // Adding a Data Table auto-selects it; it renders its header row immediately.
    await page.getByRole('button', { name: 'Add Data Table' }).click();
    const headerCells = canvas.locator('.rdr-table-row[data-row-kind="header"] .rdr-table-cell');
    await expect(headerCells).toHaveCount(2);

    // Add column → a third header cell appears, and the new column is selected.
    await page.getByRole('button', { name: 'Add column' }).click();
    await expect(headerCells).toHaveCount(3);
    await expect(page.getByLabel('Header text')).toHaveValue('Column 3');

    // Resize the (selected) new column → its rendered header cell grows wider.
    const newCell = canvas.locator('.rdr-table-cell[data-column-key="col3"]');
    const before = await newCell.boundingBox();
    await page.getByLabel('Column width').fill('100');
    await expect
      .poll(async () => (await newCell.boundingBox())?.width ?? 0)
      .toBeGreaterThan(before?.width ?? 0);

    // Remove the new column → back to two header cells.
    await page.getByRole('button', { name: 'Remove column Column 3' }).click();
    await expect(headerCells).toHaveCount(2);

    // The populated Properties form has no accessibility violations.
    await expectNoAxeViolations(page);
  });
});
