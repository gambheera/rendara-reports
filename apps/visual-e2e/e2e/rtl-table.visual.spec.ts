import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { fixtureDocument } from './fixture-page';

/**
 * RTL (right-to-left) renderer visual-regression snapshot (E10-S2, QA: "RTL visual
 * snapshot"). A compact A4-portrait page authored for an Arabic locale and rendered
 * with `direction: 'rtl'`, so the sheet carries `dir="rtl"`, the un-aligned heading
 * right-aligns and the data-table columns mirror across the table width. Content is
 * Latin so it renders crisply under the harness's Latin fixture font while the
 * *layout* exercises RTL. Rendered through the same engine + shared serializer as
 * the other fixtures and committed to `__fixtures__/rtl-table-page.html`
 * (`golden-page-html.spec.ts` guards it against drift).
 *
 * Two snapshots: the on-screen render and a print-mode render under
 * `emulateMedia({ media: 'print' })`, where {@link fixtureDocument} applies the
 * renderer's genuine print stylesheet. Canonical baselines are Linux-only and
 * CI-generated (docs/testing/visual-regression.md).
 */
const pageHtml = readFileSync(join(__dirname, '__fixtures__', 'rtl-table-page.html'), 'utf8');

const FIXTURE_HTML = fixtureDocument(pageHtml, 'rtl-table-page');

test.describe('Renderer RTL visual regression (E10-S2)', () => {
  test('renders a right-to-left page with mirrored table columns on screen', async ({ page }) => {
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('rtl-table-page')).toHaveScreenshot('rtl-table-page.png');
  });

  test('renders the RTL page under the print stylesheet', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('rtl-table-page')).toHaveScreenshot('rtl-table-page-print.png');
  });
});
