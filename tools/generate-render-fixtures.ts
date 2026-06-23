/**
 * Generates the committed render fixture(s) the visual-regression harness
 * snapshots (E4-S1).
 *
 * e2e/visual projects may not import workspace libs (Nx module boundaries), so
 * the renderer's HTML output is pre-rendered here — from the shared view-model +
 * serializer — into a committed artifact the visual spec loads via `fs`. Run via
 * `pnpm render-fixtures:generate` (or `nx run report-renderer:generate-render-fixtures`).
 * `golden-page-html.spec.ts` fails if the committed file drifts from the in-code
 * source, so this only needs re-running when the renderer output changes.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { renderCertificatePageHtml } from '../libs/report-renderer/src/lib/golden-page-html';

const outFile = join(
  __dirname,
  '..',
  'apps',
  'visual-e2e',
  'e2e',
  '__fixtures__',
  'certificate-page.html',
);

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${renderCertificatePageHtml()}\n`);

// eslint-disable-next-line no-console -- this is a developer CLI script.
console.log(`Wrote ${outFile}`);
