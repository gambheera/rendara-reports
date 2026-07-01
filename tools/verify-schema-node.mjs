/**
 * Node consumption smoke test for `@rendara/report-schema` (E9-S3 QA).
 *
 * Proves the published, framework-agnostic build actually works in a plain Node
 * script — the story's QA bar: "import + validate a golden in a plain Node
 * script". It exercises BOTH module systems against the built `dist`:
 *
 *   * ESM:  dynamic-`import()` the `module` entry (fesm2022/*.mjs);
 *   * CJS:  `require()` the `main` entry (index.cjs);
 *
 * and for each: validates a real golden fixture's template (expects `ok:true`),
 * validates a deliberately malformed template (expects `ok:false` with errors),
 * and confirms the JSON Schema + golden fixtures are exported. It also asserts
 * the ESM bundle contains no Angular import (framework-agnostic guarantee).
 *
 * Run after a build via `nx run report-schema:pack` or directly with
 * `node tools/verify-schema-node.mjs`. Exits non-zero on the first failure.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const workspaceRoot = join(fileURLToPath(import.meta.url), '..', '..');
const distDir = join(workspaceRoot, 'dist', 'libs', 'report-schema');
const require = createRequire(import.meta.url);

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

// A real consumer installs the package with `ajv`/`ajv-formats` resolvable next
// to it. The isolated `dist` tree has no sibling `node_modules`, and pnpm does
// not hoist those deps to the workspace root, so we reproduce a consumer's
// layout by linking the schema lib's own `node_modules` (which pnpm populated
// with exactly its declared deps) beside the built package. A junction is used
// on Windows so no elevated privileges are required.
const distNodeModules = join(distDir, 'node_modules');
if (!existsSync(distNodeModules)) {
  symlinkSync(
    join(workspaceRoot, 'libs', 'report-schema', 'node_modules'),
    distNodeModules,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
}

const pkg = JSON.parse(readFileSync(join(distDir, 'package.json'), 'utf8'));
const esmEntry = join(distDir, pkg.module.replace(/^\.?\//, ''));
const cjsEntry = join(distDir, pkg.main.replace(/^\.?\//, ''));

// Framework-agnostic guarantee: the runtime bundle must not import Angular.
check(
  !/from\s*["']@angular\//.test(readFileSync(esmEntry, 'utf8')),
  'ESM bundle imports an @angular/* package (must be framework-agnostic)',
);

/** Run the shared assertions against one loaded module namespace. */
function exercise(label, mod) {
  const { validate, parse, GOLDEN_FIXTURES, TEMPLATE_JSON_SCHEMA } = mod;

  check(typeof validate === 'function', `[${label}] validate is not exported as a function`);
  check(typeof parse === 'function', `[${label}] parse is not exported as a function`);
  check(
    Array.isArray(GOLDEN_FIXTURES) && GOLDEN_FIXTURES.length > 0,
    `[${label}] GOLDEN_FIXTURES is not a non-empty array`,
  );
  check(
    TEMPLATE_JSON_SCHEMA != null && typeof TEMPLATE_JSON_SCHEMA === 'object',
    `[${label}] TEMPLATE_JSON_SCHEMA is not exported`,
  );
  if (typeof validate !== 'function' || !Array.isArray(GOLDEN_FIXTURES)) return;

  // A real golden template validates cleanly.
  const golden = GOLDEN_FIXTURES.find((f) => f.name === 'invoice') ?? GOLDEN_FIXTURES[0];
  const good = validate(golden.template);
  check(
    good.ok === true,
    `[${label}] golden "${golden.name}" failed validation: ` +
      (good.ok ? '' : JSON.stringify(good.errors)),
  );

  // A malformed template is rejected with errors (never throws).
  const bad = validate({ schemaVersion: '1.0.0', not: 'a template' });
  check(bad.ok === false, `[${label}] malformed template unexpectedly validated`);
  check(
    bad.ok === false && Array.isArray(bad.errors) && bad.errors.length > 0,
    `[${label}] malformed template produced no validation errors`,
  );
}

exercise('esm', await import(pathToFileURL(esmEntry).href));
exercise('cjs', require(cjsEntry));

if (failures.length > 0) {
  console.error('schema Node smoke test FAILED:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(
  `schema Node smoke test OK — ${pkg.name}@${pkg.version} imports and validates a golden ` +
    'in both ESM (import) and CJS (require); malformed templates are rejected; no Angular import.',
);
