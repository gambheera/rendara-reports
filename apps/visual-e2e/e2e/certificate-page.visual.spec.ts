import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { fixtureDocument } from './fixture-page';

/**
 * Renderer visual-regression snapshots (E4-S1 frame, E4-S2 content; baseline
 * consolidated in E4-S8).
 *
 * The page HTML is real renderer output: `tools/generate-render-fixtures.ts`
 * paginates the certificate golden with the engine and serializes page 1 via the
 * same shared style helpers the Angular component uses, committing the result to
 * `__fixtures__/certificate-page.html` (e2e projects may not import workspace
 * libs — Nx module boundaries — so the artifact is pre-rendered and loaded here
 * via `fs`; `golden-page-html.spec.ts` guards it against drift).
 *
 * Two snapshots make up the protected baseline (E4-S8, QA: "screen + print
 * stylesheet"): the on-screen render, and a **print-mode** render under
 * `emulateMedia({ media: 'print' })`, where the shared {@link fixtureDocument}
 * applies the renderer's genuine `@media print` stylesheet (no page shadow / no
 * printable guide / white sheet). The deterministic-font harness is shared too —
 * canonical baselines stay Linux-only and CI-generated.
 */
const pageHtml = readFileSync(join(__dirname, '__fixtures__', 'certificate-page.html'), 'utf8');

const FIXTURE_HTML = fixtureDocument(pageHtml, 'certificate-page');

test.describe('Renderer certificate visual regression (E4-S2)', () => {
  test('renders the certificate golden page on screen', async ({ page }) => {
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('certificate-page')).toHaveScreenshot('certificate-page.png');
  });

  test('renders the certificate golden page under the print stylesheet', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('certificate-page')).toHaveScreenshot(
      'certificate-page-print.png',
    );
  });
});
