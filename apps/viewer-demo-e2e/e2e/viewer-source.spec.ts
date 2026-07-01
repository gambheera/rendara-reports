import { expect, test } from '@playwright/test';

/**
 * E8-S5 Download-source e2e. The demo host renders the embedded viewer with its
 * default toolbar, which includes the Download-source action. Clicking it should
 * download the report's source — the validated template — as a `.json` file named
 * from the document title, with a payload that parses back to a template.
 */
test.describe('viewer download source', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the pipeline to render the chrome (status shows once paginated).
    await expect(page.locator('.rdr-viewer-status')).toBeVisible();
  });

  test('downloads the template JSON named from the document title', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download source' }).click();
    const download = await downloadPromise;

    // "Invoice — Acme Corp" → "invoice-acme-corp.json".
    expect(download.suggestedFilename()).toBe('invoice-acme-corp.json');

    // The payload is valid JSON and is the report's template (schema contract).
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    expect(parsed.schemaVersion).toBe('1.0.0');
    expect(parsed.metadata.name).toBe('Invoice — Acme Corp');
  });
});
