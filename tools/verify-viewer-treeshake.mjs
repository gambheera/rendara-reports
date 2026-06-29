/**
 * Tree-shaking gate for `@rendara/report-viewer` (E9-S2).
 *
 * Acceptance for the story requires the published package to be tree-shakeable —
 * a host must not pay for the viewer unless it actually references it, and the
 * package must carry no eager import-time side effects (which is also what makes
 * it SSR-safe to import). The package is `"sideEffects": false` and ships as a
 * single ESM (FESM2022), so a bundler can drop it entirely when unreferenced.
 *
 * This script proves it by esbuild-bundling two synthetic consumers of the
 * **built** viewer FESM, with Angular/jsonata/ajv/tslib left external (as a real
 * host build would, since Angular is a peer):
 *
 *   * an *unused* consumer that imports the package for its side effect only and
 *     references nothing from it — it must tree-shake away to (near) nothing;
 *   * a *used* consumer that references the `ReportViewer` component — it must
 *     pull the real code in (the `rdr-report-viewer` selector marker present).
 *
 * If the package had eager side effects, the unused import could not be dropped
 * and the gate fails. (Per-*feature* dead-code elimination inside a single
 * Angular FESM — e.g. dropping a component while keeping a leaf helper — is the
 * Angular optimizer/Ivy linker's job during the host's app build, not a plain
 * esbuild pass; so this gate proves the package-level guarantee a bundler can
 * actually deliver here.)
 *
 * Run after the bundle step via `nx run report-viewer:pack`, or directly with
 * `node tools/verify-viewer-treeshake.mjs` (needs a prior `nx run
 * report-viewer:bundle`). Exits non-zero with a readable message on failure.
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const workspaceRoot = join(fileURLToPath(import.meta.url), '..', '..');
const viewerFesm = join(
  workspaceRoot,
  'dist',
  'libs',
  'report-viewer',
  'fesm2022',
  'rendara-report-viewer.mjs',
);

if (!existsSync(viewerFesm)) {
  console.error(
    `No bundled FESM at ${viewerFesm}. Run \`nx run report-viewer:bundle\` first ` +
      '(or use `nx run report-viewer:pack`).',
  );
  process.exit(1);
}

// esbuild needs a POSIX-style absolute import specifier on Windows too.
const importPath = viewerFesm.replace(/\\/g, '/');

// The selector of the `ReportViewer` standalone component — present only when
// that component (and its sizeable template/decorator metadata) is retained.
const COMPONENT_MARKER = 'rdr-report-viewer';

/** Bundle `contents` against the built viewer FESM; return the minified code. */
const bundle = async (contents) => {
  const result = await esbuild.build({
    stdin: { contents, resolveDir: workspaceRoot, sourcefile: 'consumer.mjs', loader: 'js' },
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: true,
    treeShaking: true,
    legalComments: 'none',
    // Angular (peer) + jsonata/ajv/tslib (runtime deps) resolve in the host, not
    // here — exactly how a host app would build against the package.
    packages: 'external',
    logLevel: 'silent',
    write: false,
  });
  return result.outputFiles[0].text;
};

// `globalThis.__keep` defeats esbuild dropping the binding we *do* reference, so
// the "used" measurement reflects real retained code rather than an empty file.
const unused = await bundle(`import '${importPath}';\nglobalThis.__keep = 1;\n`);
const used = await bundle(
  `import { ReportViewer } from '${importPath}';\nglobalThis.__keep = [ReportViewer];\n`,
);

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

// 1. No eager side effects: importing the package without referencing it drops
//    to (near) nothing — the component must not survive.
check(
  !unused.includes(COMPONENT_MARKER) && unused.length < 1024,
  `Package did not tree-shake away when unreferenced (${unused.length} bytes, ` +
    `marker ${unused.includes(COMPONENT_MARKER) ? 'present' : 'absent'}); ` +
    'it may carry an eager import-time side effect. Check `sideEffects: false`.',
);

// 2. Sanity: referencing the component DOES pull real code in, so the drop above
//    is meaningful (we're measuring against a non-empty baseline).
check(
  used.includes(COMPONENT_MARKER) && used.length > 10 * 1024,
  `Expected the "${COMPONENT_MARKER}" component and real code when ReportViewer is used ` +
    `(got ${used.length} bytes, marker ${used.includes(COMPONENT_MARKER) ? 'present' : 'absent'}); ` +
    'the marker may have changed and this gate would be measuring nothing.',
);

if (failures.length > 0) {
  console.error('viewer tree-shake verification FAILED:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(
  'viewer tree-shake verification OK — the package has no eager side effects: an unused ' +
    `import tree-shakes to ${unused.length} B, while using ReportViewer retains ` +
    `${used.length} B of real code. Consumers pay only for what they reference.`,
);
