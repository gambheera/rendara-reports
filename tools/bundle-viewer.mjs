/**
 * Self-contained bundling step for `@rendara/report-viewer` (E9-S1).
 *
 * ng-packagr cannot compile another workspace lib's *source* into a package: it
 * pins `rootDir` to the entry lib's own `src`, so cross-lib source trips TS6059.
 * So the build is two stages (see ADR 0013):
 *
 *   1. `nx build` produces APF packages for schema/engine/renderer (to `dist`)
 *      and for the viewer, with the three `@rendara/*` libs left **external**
 *      (the viewer FESM/d.ts still `import ... from '@rendara/report-*'`).
 *   2. THIS script inlines those externals into the viewer's own FESM (via
 *      esbuild) and type declarations (via rollup-plugin-dts), then rewrites the
 *      published `package.json` so the tarball is self-contained: a consumer runs
 *      `npm i @rendara/report-viewer` and gets engine + renderer + schema with
 *      no `@rendara/*` dependencies — only genuine third-party runtime deps.
 *
 * Third-party libraries (Angular, jsonata, ajv, tslib, …) stay external: Angular
 * is a peer; the rest are declared `dependencies` of the published package.
 */

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rollup } from 'rollup';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const distRoot = resolve('dist/libs');
const viewerDist = resolve(distRoot, 'report-viewer');

// The workspace libs to inline → their built APF artifacts in `dist`.
const WORKSPACE_LIBS = {
  '@rendara/report-engine': 'report-engine',
  '@rendara/report-renderer': 'report-renderer',
  '@rendara/report-schema': 'report-schema',
};
const fesmOf = (dir) => resolve(distRoot, dir, `fesm2022/rendara-${dir}.mjs`);
const dtsOf = (dir) => resolve(distRoot, dir, `types/rendara-${dir}.d.ts`);

const isWorkspaceLib = (id) => Object.prototype.hasOwnProperty.call(WORKSPACE_LIBS, id);
const isBareImport = (id) =>
  !id.startsWith('.') && !id.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(id);

const viewerFesm = resolve(viewerDist, 'fesm2022/rendara-report-viewer.mjs');
const viewerDts = resolve(viewerDist, 'types/rendara-report-viewer.d.ts');

// --- 1. Inline workspace FESMs into the viewer FESM (keep third-party external) ---
const inlineJs = {
  name: 'rendara-inline',
  setup(build) {
    build.onResolve({ filter: /^@rendara\// }, (args) => {
      if (isWorkspaceLib(args.path)) return { path: fesmOf(WORKSPACE_LIBS[args.path]) };
      return null;
    });
    // Everything else that is a bare specifier stays external (Angular, jsonata, ajv, tslib…).
    build.onResolve({ filter: /.*/ }, (args) =>
      isBareImport(args.path) && !isWorkspaceLib(args.path) ? { external: true } : null,
    );
  },
};

const jsResult = await esbuild.build({
  entryPoints: [viewerFesm],
  outfile: viewerFesm,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  legalComments: 'none',
  sourcemap: true,
  write: false,
  allowOverwrite: true,
  plugins: [inlineJs],
});

const jsFile = jsResult.outputFiles.find((f) => f.path.endsWith('.mjs'));
const mapFile = jsResult.outputFiles.find((f) => f.path.endsWith('.map'));
const js = jsFile.text;
if (mapFile) writeFileSync(mapFile.path, mapFile.text);
writeFileSync(jsFile.path, js);

if (/from\s*["']@rendara\//.test(js)) {
  console.error('bundle-viewer: FESM still imports a @rendara/* lib after inlining.');
  process.exit(1);
}

// --- 2. Inline workspace type declarations into the viewer's .d.ts ---
const dts = (await import('rollup-plugin-dts')).default;
const inlineDts = {
  name: 'rendara-inline-dts',
  resolveId(source) {
    if (isWorkspaceLib(source)) return { id: dtsOf(WORKSPACE_LIBS[source]) };
    if (isBareImport(source)) return false; // keep third-party type imports external
    return null;
  },
};
const dtsBundle = await rollup({
  input: viewerDts,
  plugins: [inlineDts, dts({ respectExternal: false })],
});
const { output } = await dtsBundle.generate({ format: 'es' });
await dtsBundle.close();
writeFileSync(viewerDts, output[0].code);

// A real `import ... from '@rendara/*'` would survive; comments mentioning the
// package name would not, so assert on import/export statements only.
if (/(?:import|export)[^;]*["']@rendara\//.test(output[0].code)) {
  console.error('bundle-viewer: .d.ts still references a @rendara/* lib after inlining.');
  process.exit(1);
}

// --- 3. Rewrite the published manifest: strip @rendara/*, keep third-party deps ---
const pkgPath = resolve(viewerDist, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.dependencies = Object.fromEntries(
  Object.entries(pkg.dependencies ?? {}).filter(([name]) => !name.startsWith('@rendara/')),
);
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(
  'bundle-viewer: inlined engine/renderer/schema into @rendara/report-viewer ' +
    `(FESM ${js.length} bytes, .d.ts ${output[0].code.length} bytes). ` +
    `Published deps: ${Object.keys(pkg.dependencies).join(', ') || '(none)'}.`,
);
