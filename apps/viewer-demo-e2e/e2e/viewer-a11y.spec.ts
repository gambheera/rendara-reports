import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from '../../../tools/testing/axe';

/**
 * Viewer accessibility gate (E10-S1) — runs `@axe-core/playwright` over the
 * embedded `@rendara/report-viewer` in the demo host, across its interactive
 * surfaces, and asserts **zero** WCAG 2.2 A/AA violations (brief §9). The `@a11y`
 * tag lets the dedicated `.github/workflows/a11y.yml` gate select just these
 * scans (`--grep @a11y`).
 *
 * The scan covers the *rendered* report output — including the ARIA table
 * semantics and per-page group labels this story adds — plus the toolbar, the
 * Export / Watermark dialogs, the Find bar, the surfaced error state, and the
 * themed (dark) chrome, so the `color-contrast` rule (part of the WCAG-AA tag
 * set) checks the accent/text tokens against their real backgrounds. The demo
 * consumes the BUILT package, so this is the same output a host app ships.
 */
test.describe('Viewer accessibility @a11y', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // The status row appears once the pipeline validated + paginated the sample,
    // i.e. the report (and its toolbar + thumbnail rail) is fully painted.
    await expect(page.locator('.rdr-viewer-status')).toBeVisible();
  });

  test('rendered report, toolbar and thumbnail rail have no violations', async ({ page }) => {
    // The rendered body is a real table (role="table"/row/columnheader/cell) and
    // each page is a labelled group; the thumbnail rail's mini renders are hidden
    // from assistive tech so the report text is not read once per thumbnail.
    await expect(page.getByRole('table').first()).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the Export PDF dialog has no violations', async ({ page }) => {
    await page.getByRole('button', { name: 'Export PDF' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the Watermark dialog has no violations', async ({ page }) => {
    await page.getByRole('button', { name: 'Watermark' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the in-report Find bar has no violations', async ({ page }) => {
    await page.getByRole('button', { name: 'Find in report' }).click();
    await expect(page.getByRole('search')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the surfaced error state has no violations', async ({ page }) => {
    await page.getByRole('button', { name: 'Load invalid template' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('.rdr-viewer-state-detail')).toHaveCSS('color', 'rgb(17, 24, 39)');
    await expectNoAxeViolations(page);
  });

  test('the themed (dark) chrome keeps sufficient contrast', async ({ page }) => {
    await page.getByRole('button', { name: /dark theme/ }).click();
    await expect(page.locator('.rdr-viewer-status')).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
