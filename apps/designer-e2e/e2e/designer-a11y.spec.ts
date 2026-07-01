import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from '../../../tools/testing/axe';

/**
 * Designer accessibility gate (E10-S1) — runs `@axe-core/playwright` over the
 * Report Designer across its main surfaces and asserts **zero** WCAG 2.2 A/AA
 * violations (brief §9). The `@a11y` tag lets the dedicated
 * `.github/workflows/a11y.yml` gate select just these scans (`--grep @a11y`).
 *
 * Coverage: the four-zone shell, each palette tab (Insert / Layers / Data), the
 * Properties panel populated by a selected text element and a selected data table,
 * the Page setup and Export/Import dialogs, and Preview mode (which renders the
 * report through the shared renderer, so the accessible table semantics are
 * exercised end-to-end). The desktop viewport keeps both side panels open.
 */
test.describe('Designer accessibility @a11y', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the empty shell has no violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main', { name: 'Report canvas' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the Layers tab has no violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Layers' }).click();
    await expect(page.getByRole('tabpanel')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the Data tab has no violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Data' }).click();
    await expect(page.getByText('No sample data')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the Properties panel for a selected text element has no violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Text' }).click();
    // The selection overlay confirms the element is selected and the panel populated.
    await expect(page.locator('.rdr-selection__box')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the Properties panel for a selected data table has no violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Data Table' }).click();
    await expect(page.locator('.rdr-selection__box')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the Page setup dialog has no violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Page setup/ }).click();
    await expect(page.getByRole('dialog', { name: 'Page setup' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the Export/Import dialog has no violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Export' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('Preview mode has no violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByRole('button', { name: 'Back to editor' })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
