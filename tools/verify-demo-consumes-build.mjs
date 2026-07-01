/**
 * Guard for E9-S4: proves `apps/viewer-demo` consumes the BUILT
 * `@rendara/report-viewer` package, not the workspace source.
 *
 * The acceptance criterion is "consumes the built package (not source)". Two
 * structural facts guarantee it, and this script asserts both so a future edit
 * can't silently revert the demo to source consumption:
 *
 *   1. The app build's `tsconfig.app.json` does NOT map `@rendara/report-viewer`
 *      to a workspace `src` path. The base config maps it to
 *      `libs/report-viewer/src` (source, for the rest of the workspace); the app
 *      overrides `paths` to empty so the specifier resolves through node
 *      resolution to the installed, built package instead.
 *   2. The demo's `build` and `serve` targets `dependsOn`
 *      `report-viewer:local-install`, which builds + bundles the package and
 *      installs it into `node_modules/@rendara/report-viewer` before the app
 *      compiles — so the resolved package is the real built artifact.
 *
 * Cheap and deterministic (no build required). Run with
 * `node tools/verify-demo-consumes-build.mjs`; exits non-zero on the first
 * failed check.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(fileURLToPath(import.meta.url), '..', '..');

// tsconfig files are JSONC (comments allowed). Strip `//` and `/* */` comments
// outside of strings before parsing, so the guard reads them like Node/TS do.
function stripJsonComments(text) {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += c;
      }
    } else if (inBlock) {
      if (c === '*' && next === '/') {
        inBlock = false;
        i++;
      }
    } else if (inString) {
      out += c;
      if (c === '\\') {
        out += text[i + 1] ?? '';
        i++;
      } else if (c === '"') {
        inString = false;
      }
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && next === '/') {
      inLine = true;
      i++;
    } else if (c === '/' && next === '*') {
      inBlock = true;
      i++;
    } else {
      out += c;
    }
  }
  return out;
}

const readJson = (rel) =>
  JSON.parse(stripJsonComments(readFileSync(join(workspaceRoot, rel), 'utf8')));

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const SPECIFIER = '@rendara/report-viewer';
const INSTALL_TARGET = 'report-viewer:local-install';

// 1. The app build must not path-map the viewer to workspace source.
const appTsconfig = readJson('apps/viewer-demo/tsconfig.app.json');
const paths = appTsconfig.compilerOptions?.paths ?? {};
const viewerPath = paths[SPECIFIER];
if (viewerPath !== undefined) {
  const targets = Array.isArray(viewerPath) ? viewerPath : [viewerPath];
  check(
    !targets.some((p) => /libs[\\/]report-viewer[\\/]src/.test(p)),
    `tsconfig.app.json maps ${SPECIFIER} to workspace source (${targets.join(', ')}); ` +
      'the demo must consume the built package, not source',
  );
} // undefined/empty is fine: falls back to node resolution → node_modules build.

// The base config is expected to map it to source (for the rest of the workspace);
// this documents the contract the app override intentionally breaks.
const baseTsconfig = readJson('tsconfig.base.json');
check(
  /libs[\\/]report-viewer[\\/]src/.test(
    (baseTsconfig.compilerOptions?.paths?.[SPECIFIER] ?? []).join(','),
  ),
  `Expected tsconfig.base.json to map ${SPECIFIER} to source (the mapping the app override replaces)`,
);

// 2. build + serve must depend on the local-install of the built package.
const demoProject = readJson('apps/viewer-demo/project.json');
for (const target of ['build', 'serve']) {
  const dependsOn = demoProject.targets?.[target]?.dependsOn ?? [];
  check(
    dependsOn.includes(INSTALL_TARGET),
    `viewer-demo "${target}" target must dependsOn "${INSTALL_TARGET}" so the built package is installed first`,
  );
}

// The install target itself must build + bundle before copying into node_modules.
const viewerProject = readJson('libs/report-viewer/project.json');
const localInstall = viewerProject.targets?.['local-install'];
check(localInstall != null, 'report-viewer is missing the "local-install" target');
check(
  (localInstall?.dependsOn ?? []).includes('bundle'),
  'report-viewer "local-install" must dependsOn "bundle" so it installs the freshly bundled package',
);

if (failures.length > 0) {
  console.error('viewer-demo build-consumption guard FAILED:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(
  'viewer-demo build-consumption guard OK — the demo resolves @rendara/report-viewer ' +
    'to the installed built package (not workspace source); build/serve install it first.',
);
