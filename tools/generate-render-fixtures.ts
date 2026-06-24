/**
 * Generates the committed render fixtures the visual-regression harness
 * snapshots (E4-S1, content in E4-S2).
 *
 * e2e/visual projects may not import workspace libs (Nx module boundaries), so
 * the renderer's HTML output is pre-rendered here — from the shared view-model +
 * serializer — into committed artifacts the visual specs load via `fs`. Run via
 * `pnpm render-fixtures:generate` (or `nx run report-renderer:generate-render-fixtures`).
 * `golden-page-html.spec.ts` fails if a committed file drifts from the in-code
 * source, so this only needs re-running when the renderer output changes.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  renderCertificatePageHtml,
  renderElementTypesPageHtml,
  renderGroupedTablePageHtml,
  renderPlainTablePageHtml,
} from '../libs/report-renderer/src/lib/golden-page-html';

const fixturesDir = join(__dirname, '..', 'apps', 'visual-e2e', 'e2e', '__fixtures__');

mkdirSync(fixturesDir, { recursive: true });

const artifacts: ReadonlyArray<readonly [string, string]> = [
  ['certificate-page.html', renderCertificatePageHtml()],
  ['element-types-page.html', renderElementTypesPageHtml()],
  ['plain-table-page.html', renderPlainTablePageHtml()],
  ['grouped-table-page.html', renderGroupedTablePageHtml()],
];

for (const [name, html] of artifacts) {
  const path = join(fixturesDir, name);
  writeFileSync(path, `${html}\n`);
  // eslint-disable-next-line no-console -- this is a developer CLI script.
  console.log(`Wrote ${path}`);
}
