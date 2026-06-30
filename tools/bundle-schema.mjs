/**
 * Framework-agnostic publishable build for `@rendara/report-schema` (E9-S3).
 *
 * The schema lib is pure TypeScript (types + JSON Schema + ajv validator +
 * migrations + golden fixtures) with **no Angular**, so it must not be built
 * with the Angular toolchain. ng-packagr emits an ESM-only, `prepublishOnly`-
 * blocked package that a plain Node backend can neither `require()` nor publish.
 *
 * This script replaces that with a small, framework-agnostic build using the
 * same tools the viewer bundle already relies on (esbuild + rollup-plugin-dts,
 * see ADR 0013/0015):
 *
 *   1. `tsc --emitDeclarationOnly` → a temp tree, then rollup-plugin-dts flattens
 *      it into a single `types/rendara-report-schema.d.ts`.
 *   2. esbuild bundles `src/index.ts` to BOTH an ESM entry
 *      (`fesm2022/rendara-report-schema.mjs`) and a CJS entry (`index.cjs`), so
 *      the package works in ESM (`import`) and CommonJS (`require`) Node hosts.
 *      `ajv`/`ajv-formats` stay external (declared runtime deps); everything
 *      else (the lib's own source) is inlined.
 *   3. A clean, publishable `package.json` is written (dual `main`/`module`/
 *      `types`/`exports`, `sideEffects:false`, deps = ajv/ajv-formats only — no
 *      `tslib`, no ng-packagr `prepublishOnly` guard), and the `README.md` plus
 *      the raw `schema/rendara-template.schema.json` artifact are copied in
 *      (the JSON Schema is exposed as the `./schema.json` subpath for backends).
 *
 * The ESM + flattened-d.ts artifacts keep the exact paths
 * (`fesm2022/rendara-report-schema.mjs`, `types/rendara-report-schema.d.ts`)
 * that `tools/bundle-viewer.mjs` inlines, so the viewer's two-stage build is
 * unaffected.
 *
 * Run via `nx build report-schema` (which invokes this) or directly with
 * `node tools/bundle-schema.mjs`. Verified by `tools/verify-schema-pack.mjs`
 * and `tools/verify-schema-node.mjs` (the QA Node smoke test).
 */

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollup } from 'rollup';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const workspaceRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const projectRoot = resolve(workspaceRoot, 'libs', 'report-schema');
const srcIndex = resolve(projectRoot, 'src', 'index.ts');
const outDir = resolve(workspaceRoot, 'dist', 'libs', 'report-schema');
const tmpDts = resolve(outDir, '.dts-tmp');

const fesm = resolve(outDir, 'fesm2022', 'rendara-report-schema.mjs');
const cjs = resolve(outDir, 'index.cjs');
const dtsOut = resolve(outDir, 'types', 'rendara-report-schema.d.ts');

// Start from a clean output directory so stale artifacts never leak into a pack.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(dirname(fesm), { recursive: true });
mkdirSync(dirname(dtsOut), { recursive: true });

// --- 1. Type declarations: tsc emit → flatten to a single .d.ts -------------
const tsc = require.resolve('typescript/bin/tsc');
execFileSync(
  process.execPath,
  [
    tsc,
    '-p',
    resolve(projectRoot, 'tsconfig.lib.json'),
    '--emitDeclarationOnly',
    '--declaration',
    '--rootDir',
    resolve(projectRoot, 'src'),
    '--outDir',
    tmpDts,
  ],
  { cwd: workspaceRoot, stdio: 'inherit' },
);

const dts = (await import('rollup-plugin-dts')).default;
const dtsBundle = await rollup({
  input: resolve(tmpDts, 'index.d.ts'),
  plugins: [dts({ respectExternal: false })],
});
const { output: dtsOutput } = await dtsBundle.generate({ format: 'es' });
await dtsBundle.close();
writeFileSync(dtsOut, dtsOutput[0].code);
rmSync(tmpDts, { recursive: true, force: true });

// --- 2. JS bundles: ESM + CJS, third-party (ajv/ajv-formats) external -------
// Keep every bare specifier external; only the lib's own relative source is
// inlined. ajv/ajv-formats remain declared runtime dependencies.
const isBareImport = (id) =>
  !id.startsWith('.') && !id.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(id);
const externalize = {
  name: 'rendara-externalize',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) =>
      args.kind !== 'entry-point' && isBareImport(args.path) ? { external: true } : null,
    );
  },
};

const common = {
  entryPoints: [srcIndex],
  bundle: true,
  target: 'es2022',
  legalComments: 'none',
  sourcemap: true,
  plugins: [externalize],
};
await esbuild.build({ ...common, outfile: fesm, format: 'esm' });
await esbuild.build({ ...common, outfile: cjs, format: 'cjs', platform: 'node' });

const esm = readFileSync(fesm, 'utf8');
if (/from\s*["']@(?:rendara|angular)\//.test(esm)) {
  console.error('bundle-schema: FESM unexpectedly imports an @rendara/* or @angular/* package.');
  process.exit(1);
}

// --- 3. Publishable package.json + copied artifacts -------------------------
const src = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
const pkg = {
  name: src.name,
  version: src.version,
  description: src.description,
  license: src.license,
  private: src.private ?? false,
  sideEffects: false,
  type: 'module',
  main: './index.cjs',
  module: './fesm2022/rendara-report-schema.mjs',
  types: './types/rendara-report-schema.d.ts',
  exports: {
    '.': {
      types: './types/rendara-report-schema.d.ts',
      import: './fesm2022/rendara-report-schema.mjs',
      require: './index.cjs',
    },
    './schema.json': './schema/rendara-template.schema.json',
    './package.json': './package.json',
  },
  publishConfig: src.publishConfig ?? { access: 'public' },
  dependencies: src.dependencies ?? {},
};
writeFileSync(resolve(outDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

cpSync(resolve(projectRoot, 'README.md'), resolve(outDir, 'README.md'));
mkdirSync(resolve(outDir, 'schema'), { recursive: true });
cpSync(
  resolve(projectRoot, 'schema', 'rendara-template.schema.json'),
  resolve(outDir, 'schema', 'rendara-template.schema.json'),
);

console.log(
  `bundle-schema: built ${pkg.name}@${pkg.version} (framework-agnostic, no Angular). ` +
    `ESM ${esm.length} bytes, CJS + flattened .d.ts, JSON Schema artifact included. ` +
    `Runtime deps: ${Object.keys(pkg.dependencies).join(', ') || '(none)'}.`,
);
