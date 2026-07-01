/**
 * Installs the BUILT `@rendara/report-viewer` package into the workspace
 * `node_modules` so `apps/viewer-demo` consumes it exactly as a host app would
 * after `npm i @rendara/report-viewer` (E9-S4).
 *
 * Why a copy (not a symlink/junction): the Angular Linker — which resolves the
 * package's partial-compiled FESM (`ɵɵngDeclare*`) to fully-AOT instructions at
 * the consumer's build — only processes files whose path is under
 * `node_modules`. esbuild resolves symlinks to their real path, so a junction
 * pointing at `dist/` would resolve to `dist/...`, the linker would skip it, and
 * the app would hit "JIT compiler unavailable" at runtime. Copying real files
 * under `node_modules/@rendara/report-viewer` makes the real path live under
 * `node_modules`, so the linker runs — just like a published install.
 *
 * The demo's `tsconfig.app.json` empties `paths` so `@rendara/report-viewer`
 * resolves here via node resolution (not the base-config source mapping), and
 * its `build`/`serve` targets `dependsOn` `report-viewer:local-install`, which
 * runs this after `report-viewer:bundle`. Run directly with
 * `node tools/install-viewer-local.mjs`.
 */

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(fileURLToPath(import.meta.url), '..', '..');
const source = join(workspaceRoot, 'dist', 'libs', 'report-viewer');
const dest = join(workspaceRoot, 'node_modules', '@rendara', 'report-viewer');

if (!existsSync(join(source, 'package.json'))) {
  console.error(
    `No build found at ${source}. Run \`nx run report-viewer:bundle\` first ` +
      '(or use `nx run report-viewer:local-install`, which depends on it).',
  );
  process.exit(1);
}

// Replace any prior copy so a rebuilt package is always reflected.
rmSync(dest, { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
cpSync(source, dest, { recursive: true });

console.log(
  `install-viewer-local: copied the built @rendara/report-viewer into ` +
    `node_modules so apps/viewer-demo consumes it as a real package install.`,
);
