import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from '../../../tools/testing/axe';

/**
 * E6-S10 — Export / import Template JSON. Exercises the acceptance end-to-end:
 * export the current document as validated JSON, bring it back in through the
 * Import tab (parse → migrate → validate → load), and confirm **round-trip
 * integrity** — export → import → export yields equivalent JSON (story QA).
 */
test.describe('Export / import template', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  /** Reads the JSON shown in the Export tab's preview. */
  async function readExportedJson(page: import('@playwright/test').Page): Promise<string> {
    const code = page.locator('rdr-export-import-dialog .rdr-eio__code');
    await expect(code).toBeVisible();
    return ((await code.textContent()) ?? '').trim();
  }

  test('exports validated JSON, re-imports it, and round-trips equivalently', async ({ page }) => {
    // Importing over a document with unsaved edits asks the E6-S11 discard guard
    // for confirmation; accept it so the round-trip proceeds.
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/');

    // Author something so the export is non-trivial.
    await page.getByRole('button', { name: 'Add Text' }).click();

    // Export: the dialog shows the validated chip and the template JSON.
    await page.getByRole('button', { name: 'Export' }).click();
    await expect(page.getByText('✓ validated')).toBeVisible();
    const firstExport = await readExportedJson(page);
    expect(firstExport).toContain('"schemaVersion"');

    await expectNoAxeViolations(page);

    // Import the very JSON we just exported.
    await page.getByRole('tab', { name: 'Import' }).click();
    await page.locator('rdr-export-import-dialog input[type="file"]').setInputFiles({
      name: 'round-trip.json',
      mimeType: 'application/json',
      buffer: Buffer.from(firstExport),
    });
    await expect(page.getByText(/validated successfully/)).toBeVisible();
    await page.getByRole('button', { name: 'Import template' }).click();

    // Re-export and confirm the JSON is byte-for-byte equivalent.
    await page.getByRole('button', { name: 'Export' }).click();
    const secondExport = await readExportedJson(page);
    expect(secondExport).toBe(firstExport);
  });

  test('rejects an invalid template file with a clear error', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('tab', { name: 'Import' }).click();

    await page.locator('rdr-export-import-dialog input[type="file"]').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ "schemaVersion": "1.0.0" }'),
    });

    await expect(page.getByText(/couldn't be imported/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import template' })).toBeDisabled();
  });
});
