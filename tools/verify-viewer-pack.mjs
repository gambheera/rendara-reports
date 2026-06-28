/**
 * Packaging smoke test for `@rendara/report-viewer` (E9-S1).
 *
 * Runs `npm pack` against the ng-packagr build output in
 * `dist/libs/report-viewer` and asserts the produced tarball is a valid,
 * Angular Package Format (APF) compliant, self-contained npm package:
 *
 *   * APF artifacts are present (FESM2022 bundle, type declarations, the
 *     emitted package.json);
 *   * the emitted package.json carries the APF entry-point fields
 *     (`module`, `typings`, `exports`) and the correct name;
 *   * the engine / renderer / schema workspace libs were **bundled in** — i.e.
 *     no `@rendara/*` entries leak into the package's dependencies — so a
 *     consumer gets everything from a single `npm i @rendara/report-viewer`.
 *
 * Run after a production build via `nx run report-viewer:pack` (which depends on
 * `build`) or directly with `node tools/verify-viewer-pack.mjs`. Exits non-zero
 * with a readable message on the first failed check, so CI fails loudly.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(fileURLToPath(import.meta.url), '..', '..');
const distDir = join(workspaceRoot, 'dist', 'libs', 'report-viewer');

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

if (!existsSync(join(distDir, 'package.json'))) {
  console.error(
    `No build found at ${distDir}. Run \`nx build report-viewer\` first ` +
      '(or use `nx run report-viewer:pack`).',
  );
  process.exit(1);
}

// `npm pack --json --dry-run` reports the exact tarball contents without
// writing a file, so we can inspect entries without cleanup races. `shell: true`
// lets Windows resolve `npm` → `npm.cmd` via PATHEXT.
const run = (args) => execFileSync('npm', args, { cwd: distDir, encoding: 'utf8', shell: true });
const raw = run(['pack', '--json', '--dry-run']);
const [report] = JSON.parse(raw);

const entries = report.files.map((f) => f.path.replace(/\\/g, '/'));
const has = (pattern) => entries.some((p) => pattern.test(p));

// Inspect the emitted (APF) package.json that ng-packagr generated.
const pkg = JSON.parse(run(['pkg', 'get', 'name', 'module', 'typings', 'exports', 'dependencies']));

check(report.name === '@rendara/report-viewer', `Unexpected package name: ${report.name}`);
check(has(/^package\.json$/), 'Tarball is missing package.json');
check(has(/^fesm2022\/.*\.mjs$/), 'Tarball is missing the FESM2022 bundle (APF)');

check(typeof pkg.module === 'string', 'Emitted package.json has no "module" (APF entry) field');
check(typeof pkg.typings === 'string', 'Emitted package.json has no "typings" field');
check(pkg.exports != null, 'Emitted package.json has no "exports" map');

// The type-declarations entry named by `typings` must actually be in the tarball.
const typings = (pkg.typings ?? '').replace(/^\.?\//, '');
check(
  typings.length > 0 && has(new RegExp(`^${typings.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)),
  `Tarball is missing the typings entry "${pkg.typings}"`,
);

const deps = Object.keys(pkg.dependencies ?? {});
const leaked = deps.filter((d) => d.startsWith('@rendara/'));
check(
  leaked.length === 0,
  `Workspace libs leaked as dependencies (should be bundled): ${leaked.join(', ')}`,
);

if (failures.length > 0) {
  console.error('viewer pack verification FAILED:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

// Clean up any tarball a non-dry-run left behind (defensive; dry-run writes none).
for (const name of [`${report.name.replace('@', '').replace('/', '-')}-${report.version}.tgz`]) {
  const tgz = join(distDir, name);
  if (existsSync(tgz)) rmSync(tgz);
}

console.log(
  `viewer pack verification OK — ${report.name}@${report.version} ` +
    `(${entries.length} files, ${report.size} bytes packed). ` +
    'APF artifacts present; no @rendara/* deps leaked (engine/renderer/schema bundled).',
);
