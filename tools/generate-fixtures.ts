/**
 * Generates the committed golden-fixture JSON artifacts (E1-S8) from the single
 * source of truth, {@link GOLDEN_FIXTURES}.
 *
 * For each golden it writes `libs/report-schema/fixtures/<name>/template.json`
 * and `.../data.json`. Run via `pnpm fixtures:generate` (or
 * `nx run report-schema:generate-fixtures`). `fixtures.spec.ts` fails if any
 * committed file drifts from the in-code source, so this only needs re-running
 * when a fixture changes.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { GOLDEN_FIXTURES } from '../libs/report-schema/src/lib/fixtures';

const fixturesRoot = join(__dirname, '..', 'libs', 'report-schema', 'fixtures');

for (const { name, template, data } of GOLDEN_FIXTURES) {
  const dir = join(fixturesRoot, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'template.json'), `${JSON.stringify(template, null, 2)}\n`);
  writeFileSync(join(dir, 'data.json'), `${JSON.stringify(data, null, 2)}\n`);
  // eslint-disable-next-line no-console -- this is a developer CLI script.
  console.log(`Wrote ${join(dir, 'template.json')} and data.json`);
}
