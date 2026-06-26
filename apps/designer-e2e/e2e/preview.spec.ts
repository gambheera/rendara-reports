import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from '../../../tools/testing/axe';

/**
 * E6-S9 — Live preview mode. Exercises the acceptance end-to-end: bind a text
 * element to sample data, toggle into preview, and confirm the designer swaps its
 * editing chrome for a viewer-style render of the same template + data via the
 * **shared renderer** (no side panels, resolved values painted), then return to the
 * editor. The render path is the very `rdr-report-document` the viewer uses, in
 * view mode — so the preview is what the viewer would produce (story QA).
 */
const SAMPLE = JSON.stringify({
  invoice: { customer: { name: 'Acme Corp' } },
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

test.describe('Live preview', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('previews the bound document with sample data, then returns to the editor', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Add Text' }).click();
    await importSample(page);
    await page.getByLabel('Expression').fill('invoice.customer.name');

    // Enter preview from the top bar.
    await page.getByRole('button', { name: 'Preview' }).click();

    // Viewer-style chrome: the PREVIEW badge, source hint, and the shared renderer.
    await expect(page.getByText('Preview', { exact: true })).toBeVisible();
    await expect(page.getByText('Rendered with invoice-sample.json')).toBeVisible();
    const doc = page.locator('rdr-preview-mode rdr-report-document');
    await expect(doc.getByText('Acme Corp', { exact: true })).toBeVisible();

    // No editing chrome: the palette and properties panels are gone.
    await expect(page.locator('rdr-palette-panel')).toHaveCount(0);
    await expect(page.locator('rdr-properties-panel')).toHaveCount(0);

    await expectNoAxeViolations(page);

    // Back to editor restores the workspace.
    await page.getByRole('button', { name: 'Back to editor' }).click();
    await expect(page.getByRole('main', { name: 'Report canvas' })).toBeVisible();
    await expect(page.locator('rdr-preview-mode')).toHaveCount(0);
  });
});
