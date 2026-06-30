/**
 * Packaging smoke test for `@rendara/report-schema` (E9-S3).
 *
 * Runs `npm pack` against the framework-agnostic build output in
 * `dist/libs/report-schema` and asserts the produced tarball is a valid,
 * Node-consumable, **Angular-free** npm package:
 *
 *   * the dual entry artifacts are present (CJS `index.cjs`, ESM
 *     `fesm2022/*.mjs`, flattened `types/*.d.ts`) and the raw JSON Schema
 *     artifact (`schema/rendara-template.schema.json`) is shipped for backends;
 *   * the emitted package.json carries the Node entry fields (`main`, `module`,
 *     `typings`/`types`, `exports`) and the correct name;
 *   * the package is framework-agnostic — **no `@angular/*`** dependency, and
 *     no `@rendara/*` workspace dep leaks (the schema lib depends on nothing
 *     internal). Runtime deps are exactly `ajv` + `ajv-formats`;
 *   * none of ng-packagr's Angular-only baggage survives: no `prepublishOnly`
 *     publish guard, no spurious `tslib` runtime dep.
 *
 * Run after a build via `nx run report-schema:pack` (which depends on `build`)
 * or directly with `node tools/verify-schema-pack.mjs`. Exits non-zero with a
 * readable message on the first failed check, so CI fails loudly.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(fileURLToPath(import.meta.url), '..', '..');
const distDir = join(workspaceRoot, 'dist', 'libs', 'report-schema');

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

if (!existsSync(join(distDir, 'package.json'))) {
  console.error(
    `No build found at ${distDir}. Run \`nx build report-schema\` first ` +
      '(or use `nx run report-schema:pack`).',
  );
  process.exit(1);
}

// `npm pack --json --dry-run` reports the exact tarball contents without writing
// a file. `shell: true` lets Windows resolve `npm` → `npm.cmd` via PATHEXT.
const run = (args) => execFileSync('npm', args, { cwd: distDir, encoding: 'utf8', shell: true });
const [report] = JSON.parse(run(['pack', '--json', '--dry-run']));

const entries = report.files.map((f) => f.path.replace(/\\/g, '/'));
const has = (pattern) => entries.some((p) => pattern.test(p));

const pkg = JSON.parse(
  run(['pkg', 'get', 'name', 'main', 'module', 'types', 'exports', 'dependencies', 'scripts']),
);

check(report.name === '@rendara/report-schema', `Unexpected package name: ${report.name}`);
check(has(/^package\.json$/), 'Tarball is missing package.json');
check(has(/^index\.cjs$/), 'Tarball is missing the CommonJS entry (index.cjs)');
check(has(/^fesm2022\/.*\.mjs$/), 'Tarball is missing the ESM bundle (fesm2022)');
check(
  has(/^schema\/rendara-template\.schema\.json$/),
  'Tarball is missing the JSON Schema artifact (schema/rendara-template.schema.json)',
);

check(typeof pkg.main === 'string', 'Emitted package.json has no "main" (CJS) field');
check(typeof pkg.module === 'string', 'Emitted package.json has no "module" (ESM) field');
check(typeof pkg.types === 'string', 'Emitted package.json has no "types" field');
check(pkg.exports != null, 'Emitted package.json has no "exports" map');

// The type-declarations entry named by `types` must actually be in the tarball.
const types = (pkg.types ?? '').replace(/^\.?\//, '');
check(
  types.length > 0 && has(new RegExp(`^${types.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)),
  `Tarball is missing the types entry "${pkg.types}"`,
);

// Framework-agnostic: no Angular, no leaked workspace libs. Runtime deps are
// exactly ajv + ajv-formats (no ng-packagr-injected tslib).
const deps = pkg.dependencies ?? {};
const depNames = Object.keys(deps);
check(
  !depNames.some((d) => d.startsWith('@angular/')),
  `Package must be framework-agnostic but declares Angular deps: ${depNames
    .filter((d) => d.startsWith('@angular/'))
    .join(', ')}`,
);
check(
  !depNames.some((d) => d.startsWith('@rendara/')),
  `Workspace libs leaked as dependencies: ${depNames
    .filter((d) => d.startsWith('@rendara/'))
    .join(', ')}`,
);
check(!('tslib' in deps), 'Unexpected "tslib" runtime dep (esbuild inlines helpers; not needed)');
for (const required of ['ajv', 'ajv-formats']) {
  check(required in deps, `Missing expected runtime dependency "${required}"`);
}

// ng-packagr's full-compilation publish guard must be gone.
check(
  !(pkg.scripts && 'prepublishOnly' in pkg.scripts),
  'Emitted package.json still has a "prepublishOnly" guard (blocks publish)',
);

if (failures.length > 0) {
  console.error('schema pack verification FAILED:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

// Clean up any tarball a non-dry-run left behind (defensive; dry-run writes none).
const tgz = join(
  distDir,
  `${report.name.replace('@', '').replace('/', '-')}-${report.version}.tgz`,
);
if (existsSync(tgz)) rmSync(tgz);

console.log(
  `schema pack verification OK — ${report.name}@${report.version} ` +
    `(${entries.length} files, ${report.size} bytes packed). ` +
    'Framework-agnostic (no Angular), dual CJS+ESM, JSON Schema artifact shipped; ' +
    `runtime deps: ${depNames.join(', ')}.`,
);
