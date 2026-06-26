import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from '../../../tools/testing/axe';

/**
 * E6-S8 — Table data binding & aggregates. Exercises the acceptance end-to-end:
 * add a data table, import sample data, bind the table's array **source** and its
 * column **cell** expressions (row scope `$`), and confirm the canvas — the shared
 * renderer in design mode — previews the **repeated rows**. Then toggle a column
 * **footer aggregate** and confirm the **grand total** renders. What is bound is
 * what the viewer will render for the same template + data.
 */
const SAMPLE = JSON.stringify({
  invoice: {
    lineItems: [
      { description: 'Widget', amount: 10 },
      { description: 'Gadget', amount: 20 },
      { description: 'Sprocket', amount: 5 },
    ],
  },
});

/** Imports the sample Data JSON through the Data tab's file input. */
async function importSample(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('tab', { name: 'Data' }).click();
  await page.locator('rdr-data-panel input[type="file"]').setInputFiles({
    name: 'invoice-sample.json',
    mimeType: 'application/json',
    buffer: Buffer.from(SAMPLE),
  });
  await expect(page.getByRole('tree', { name: 'Sample data fields' })).toBeVisible();
}

test.describe('Table data binding', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('binds a table to an array, previews rows, and totals a column', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('rdr-report-document');

    // Add a table (auto-selected) and import the sample data.
    await page.getByRole('button', { name: 'Add Data Table' }).click();
    await importSample(page);

    // Bind the array source; the row-count hint reflects the sample.
    await page.getByLabel('Data source').fill('invoice.lineItems');
    await expect(page.getByText(/3 rows in sample data/i)).toBeVisible();

    // Bind the first column's cell to a row field; detail rows render its values.
    await page.getByLabel('Cell value expression').fill('$.description');
    const detailRows = canvas.locator('.rdr-table-row[data-row-kind="detail"]');
    await expect(detailRows).toHaveCount(3);
    await expect(canvas.getByText('Widget', { exact: true })).toBeVisible();
    await expect(canvas.getByText('Sprocket', { exact: true })).toBeVisible();

    // Bind the second column and add a footer grand total.
    await page.getByRole('button', { name: 'Column 2' }).click();
    await page.getByLabel('Cell value expression').fill('$.amount');
    await page.getByLabel('Show footer aggregate').check();

    // The grand total (10 + 20 + 5) renders in a column-footer row on the canvas.
    const footerRow = canvas.locator('.rdr-table-row[data-row-kind="columnFooter"]');
    await expect(footerRow).toHaveCount(1);
    await expect(footerRow.getByText('35', { exact: true })).toBeVisible();

    await expectNoAxeViolations(page);
  });
});
