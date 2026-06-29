import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Version-tolerance contract for the published `@rendara/report-viewer` package
 * (E9-S2). The package must declare a **wide** Angular peer range so it slots
 * into a host app's existing Angular install, and stay tree-shakeable.
 *
 * The monorepo is pinned to a single Angular version, so we can't `npm install`
 * real Angular 20/22 trees here — that's the clean-room install's job (E9-S7).
 * Instead this locks the published contract deterministically: the declared peer
 * ranges must admit the supported majors (20 min … 22 max) and reject 19, and
 * `sideEffects` must stay `false`. The emitted-manifest equivalent is asserted
 * against the actual build by `tools/verify-viewer-pack.mjs`.
 */

/** Walks up from `process.cwd()` to the workspace root (the dir holding `nx.json`). */
function workspaceRoot(): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'nx.json'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('workspace root (nx.json) not found');
    dir = parent;
  }
  return dir;
}

const pkg = JSON.parse(
  readFileSync(join(workspaceRoot(), 'libs', 'report-viewer', 'package.json'), 'utf8'),
) as {
  sideEffects?: unknown;
  peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
};

/**
 * Minimal semver-range admittance check for the comparator forms we publish
 * (`>=x.y.z`, optional `<x.y.z`, `^`, `~`). Enough to assert the peer contract
 * without pulling in `semver`.
 */
const cmp = (a: string, b: string): number => {
  const [A, B] = [a.split('.').map(Number), b.split('.').map(Number)];
  for (let i = 0; i < 3; i++) if ((A[i] ?? 0) !== (B[i] ?? 0)) return (A[i] ?? 0) - (B[i] ?? 0);
  return 0;
};
const rangeAdmits = (range: string, version: string): boolean =>
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
        case '^':
          return cmp(version, base) >= 0 && cmp(version, `${Number(major) + 1}.0.0`) < 0;
        case '~':
          return cmp(version, base) >= 0 && cmp(version, `${major}.${Number(minor) + 1}.0`) < 0;
        default:
          return cmp(version, base) === 0;
      }
    });

describe('@rendara/report-viewer peer dependencies (E9-S2)', () => {
  it('declares exactly the Angular peers it imports (core + cdk, no @angular/common)', () => {
    const peers = pkg.peerDependencies ?? {};
    expect(Object.keys(peers).sort()).toEqual(['@angular/cdk', '@angular/core']);
  });

  it.each(['@angular/core', '@angular/cdk'])(
    'advertises a wide range for %s — admits 20, 21, 22; rejects 19',
    (peer) => {
      const range = (pkg.peerDependencies ?? {})[peer];
      expect(range, `${peer} peer range`).toBeTypeOf('string');
      // Min and max supported Angular majors (and the pinned dev version).
      expect(rangeAdmits(range, '20.0.0'), `${range} admits 20.0.0`).toBe(true);
      expect(rangeAdmits(range, '21.2.9'), `${range} admits 21.2.9`).toBe(true);
      expect(rangeAdmits(range, '22.0.0'), `${range} admits 22.0.0`).toBe(true);
      // Below the supported floor.
      expect(rangeAdmits(range, '19.2.0'), `${range} rejects 19.2.0`).toBe(false);
    },
  );

  it('is marked side-effect free so unused features tree-shake out', () => {
    expect(pkg.sideEffects).toBe(false);
  });

  it('keeps Angular out of runtime dependencies (peer only)', () => {
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.filter((d) => d.startsWith('@angular/'))).toEqual([]);
  });
});
