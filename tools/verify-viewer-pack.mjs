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
 *   * the published peer-dependency contract (E9-S2) advertises a **wide**
 *     Angular range — `@angular/core` and `@angular/cdk` peers that admit the
 *     min/max supported majors (20, 21, 22) and reject anything below 20 — so
 *     the package fits a host app's existing Angular version.
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

// A small, dependency-free semver-range evaluator covering the comparator forms
// we publish (`>=20.0.0`, optionally bounded `<23.0.0`, and `^`/`~`). `semver`
// isn't resolvable from the workspace root, and this only needs to answer
// "does the peer range admit this Angular version?".
const toTuple = (v) => v.split('.').map(Number);
const cmp = (a, b) => {
  const [A, B] = [toTuple(a), toTuple(b)];
  for (let i = 0; i < 3; i++) if ((A[i] ?? 0) !== (B[i] ?? 0)) return (A[i] ?? 0) - (B[i] ?? 0);
  return 0;
};
const rangeAdmits = (range, version) =>
  range
    .trim()
    .split(/\s+/)
    .every((token) => {
      const m = /^(>=|<=|>|<|=|\^|~)?(\d+)\.(\d+)\.(\d+)$/.exec(token);
      if (!m) return false;
      const [, op = '=', major, minor, patch] = m;
      const base = `${major}.${minor}.${patch}`;
      switch (op) {
        case '>=':
          return cmp(version, base) >= 0;
        case '>':
          return cmp(version, base) > 0;
        case '<=':
          return cmp(version, base) <= 0;
        case '<':
          return cmp(version, base) < 0;
        case '=':
          return cmp(version, base) === 0;
        case '^':
          return cmp(version, base) >= 0 && cmp(version, `${Number(major) + 1}.0.0`) < 0;
        case '~':
          return cmp(version, base) >= 0 && cmp(version, `${major}.${Number(minor) + 1}.0`) < 0;
        default:
          return false;
      }
    });

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
const pkg = JSON.parse(
  run(['pkg', 'get', 'name', 'module', 'typings', 'exports', 'dependencies', 'peerDependencies']),
);

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

// Peer-dependency / version-tolerance contract (E9-S2): the package must declare
// Angular `@angular/core` + `@angular/cdk` peers over a wide range so it slots
// into a host's existing Angular install. We assert the range admits the
// supported majors (20 min, 22 max) and rejects 19 — the published guarantee.
const peers = pkg.peerDependencies ?? {};
const ADMIT = ['20.0.0', '21.2.9', '22.0.0'];
const REJECT = ['19.2.0'];
for (const peer of ['@angular/core', '@angular/cdk']) {
  const range = peers[peer];
  check(typeof range === 'string', `Emitted package.json has no "${peer}" peer dependency`);
  if (typeof range !== 'string') continue;
  for (const v of ADMIT) {
    check(rangeAdmits(range, v), `Peer "${peer}" range "${range}" should admit Angular ${v}`);
  }
  for (const v of REJECT) {
    check(!rangeAdmits(range, v), `Peer "${peer}" range "${range}" should reject Angular ${v}`);
  }
}

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
    'APF artifacts present; no @rendara/* deps leaked (engine/renderer/schema bundled); ' +
    `Angular peers wide (core "${peers['@angular/core']}", cdk "${peers['@angular/cdk']}").`,
);
