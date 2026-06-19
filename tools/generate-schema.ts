/**
 * Generates the committed JSON Schema artifact for the Template JSON contract
 * (E1-S6) from the single source of truth, {@link TEMPLATE_JSON_SCHEMA}.
 *
 * Run via `pnpm schema:generate` (or `nx run report-schema:generate-schema`).
 * `json-schema.spec.ts` fails if the committed file drifts from the in-code
 * schema, so this only needs re-running when the schema changes.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { TEMPLATE_JSON_SCHEMA } from '../libs/report-schema/src/lib/json-schema';

const outFile = join(
  __dirname,
  '..',
  'libs',
  'report-schema',
  'schema',
  'rendara-template.schema.json',
);

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(TEMPLATE_JSON_SCHEMA, null, 2)}\n`);

// eslint-disable-next-line no-console -- this is a developer CLI script.
console.log(`Wrote ${outFile}`);
