import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from '../../../tools/testing/axe';

/**
 * E6-S7 — Binding editor (drag-to-bind + expressions). Exercises the acceptance
 * end-to-end: import sample data, bind a text element to a field (by typing an
 * expression and by dragging a field onto the element), and confirm the canvas —
 * the shared renderer in design mode — previews the resolved value. Also covers
 * the inline error for an invalid expression and a format token.
 */
const SAMPLE = JSON.stringify({
  invoice: {
    customer: { name: 'Acme Corp' },
    total: 1234.5,
  },
});

/** Imports the sample Data JSON through the Data tab's file input. */
async function importSample(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('tab', { name: 'Data' }).click();
  await page
    .locator('rdr-data-panel input[type="file"]')
    .setInputFiles({
      name: 'invoice-sample.json',
      mimeType: 'application/json',
      buffer: Buffer.from(SAMPLE),
    });
  await expect(page.getByRole('tree', { name: 'Sample data fields' })).toBeVisible();
}

test.describe('Data binding', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('binds a text element by expression and previews the resolved value', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Add Text' }).click();
    await expect(page.locator('[data-element-id]')).toHaveCount(1);

    await importSample(page);

    // Type an expression in the Data Binding editor; the canvas previews the value.
    await page.getByLabel('Expression').fill('invoice.customer.name');
    const canvas = page.locator('rdr-report-document');
    await expect(canvas.getByText('Acme Corp', { exact: true })).toBeVisible();

    // A format token reformats the preview (currency).
    await page.getByLabel('Expression').fill('invoice.total');
    await page.getByLabel('Format').selectOption('currency:USD');
    await expect(canvas.getByText('$1,234.50', { exact: true })).toBeVisible();

    await expectNoAxeViolations(page);
  });

  test('shows an inline error for an invalid expression', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Text' }).click();
    await importSample(page);

    await page.getByLabel('Expression').fill('invoice.(');
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('binds an element by dragging a field onto it (drag-to-bind)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Text' }).click();
    await importSample(page);

    const grip = page.getByLabel('Drag name to bind an element');
    const target = page.locator('[data-element-id]').first();
    const box = await target.boundingBox();
    expect(box).toBeTruthy();
    const { x, y, width, height } = box as { x: number; y: number; width: number; height: number };
    const tx = x + width / 2;
    const ty = y + height / 2;

    // CDK drag needs intermediate moves to cross its start threshold before drop.
    await grip.hover();
    await page.mouse.down();
    await page.mouse.move(tx - 40, ty - 40, { steps: 8 });
    await page.mouse.move(tx, ty, { steps: 8 });
    await page.mouse.up();

    // The dropped field bound the element; the canvas previews the resolved value.
    const canvas = page.locator('rdr-report-document');
    await expect(canvas.getByText('Acme Corp', { exact: true })).toBeVisible();
  });
});
