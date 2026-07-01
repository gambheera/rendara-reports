/**
 * Clean-room install smoke test for `@rendara/report-viewer` (E9-S7). ⭐
 *
 * Proves the published package works **outside the monorepo** — the story's bar:
 * "creates a fresh Angular app, installs the packed tarball, renders a report".
 *
 * Why this exists on top of the E9-S4 `viewer-demo` integration: the published
 * FESM is Angular *partial-compiled* (`ɵɵngDeclare*`) and only becomes runnable
 * once the Angular **Linker** processes it — and the Linker only runs on files
 * whose real path is under `node_modules` (see ADR 0016). A packaging regression
 * (e.g. the escaped-`ɵ` bug) does **not** fail the build; it throws "JIT compiler
 * unavailable" at **runtime, in a browser**. So this test doesn't just build — it
 * runs the built app in headless Chromium and asserts the report actually paints.
 *
 * Steps (all in a throwaway temp dir OUTSIDE the repo, so npm can't resolve up
 * into the workspace — a genuine clean room):
 *   1. `npm pack` the built `dist/libs/report-viewer` → `report-viewer.tgz`.
 *   2. Copy the checked-in fixture app (tools/clean-room/fixture) beside it.
 *   3. `npm install` — pulls Angular from the registry + the local tarball (with
 *      its bundled engine/renderer/schema and jsonata/ajv/tslib) as a consumer would.
 *   4. `ng build` (production AOT) — the Linker runs on the real node_modules pkg.
 *   5. Serve the build and load it in headless Chromium; assert the report content
 *      (INVOICE, the bound customer, currency totals, `Page 1 of N`) is present and
 *      no uncaught runtime error fired.
 *
 * Run after a bundle via `nx run report-viewer:clean-room` (which depends on
 * `bundle`) or directly with `node tools/clean-room-smoke.mjs`. Needs network
 * (registry) and a Playwright Chromium (`pnpm exec playwright install chromium`).
 * Exits non-zero with a readable message on the first failed check. See ADR 0019.
 */

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  createReadStream,
  existsSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const workspaceRoot = join(fileURLToPath(import.meta.url), '..', '..');
const viewerDist = join(workspaceRoot, 'dist', 'libs', 'report-viewer');
const fixtureDir = join(workspaceRoot, 'tools', 'clean-room', 'fixture');

const die = (message) => {
  console.error(`clean-room smoke test FAILED:\n  ✗ ${message}`);
  process.exit(1);
};

if (!existsSync(join(viewerDist, 'package.json'))) {
  die(
    `No bundled build at ${viewerDist}. Run \`nx run report-viewer:bundle\` first ` +
      '(or use `nx run report-viewer:clean-room`, which depends on it).',
  );
}

// `shell: true` lets Windows resolve `npm`/`ng` → `.cmd` via PATHEXT; quote any
// arg containing whitespace so a temp path with spaces survives the shell.
const q = (a) => (/\s/.test(a) ? `"${a}"` : a);
const runInherit = (cmd, args, cwd) =>
  execFileSync(cmd, args.map(q), { cwd, stdio: 'inherit', shell: true });
const runCapture = (cmd, args, cwd) =>
  execFileSync(cmd, args.map(q), { cwd, encoding: 'utf8', shell: true });

// A truly external clean room: a fresh temp dir under the OS temp root, outside
// the repo, so npm/pnpm cannot walk up and treat it as part of the workspace.
const appDir = mkdtempSync(join(tmpdir(), 'rendara-clean-room-'));

/** Serve a directory over loopback for the browser render check. SPA-fallback to index.html. */
function serveStatic(rootDir) {
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.map': 'application/json',
    '.woff2': 'font/woff2',
  };
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let filePath = resolve(rootDir, `.${urlPath}`);
    // Contain within rootDir, then fall back to index.html for unknown routes.
    if (relative(rootDir, filePath).startsWith('..')) filePath = join(rootDir, 'index.html');
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(rootDir, 'index.html');
    }
    res.writeHead(200, { 'content-type': types[extname(filePath)] ?? 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  });
  return server;
}

let browser;
let server;
try {
  // 1. Pack the built package into the clean room as a stable `report-viewer.tgz`
  //    (the `file:` dependency the fixture's package.json declares).
  console.log('clean-room: packing @rendara/report-viewer …');
  runCapture('npm', ['pack', viewerDist, '--pack-destination', appDir], workspaceRoot);
  const packed = readdirSync(appDir).find((f) => f.endsWith('.tgz'));
  if (!packed) die('npm pack produced no tarball');
  renameSync(join(appDir, packed), join(appDir, 'report-viewer.tgz'));

  // 2. Copy the fixture app beside the tarball (merges into appDir).
  cpSync(fixtureDir, appDir, { recursive: true });

  // 3. Install: fresh Angular from the registry + the local tarball, exactly as a
  //    host's `npm i` would (peer Angular satisfied, engine/renderer/schema bundled in).
  console.log(`clean-room: npm install in ${appDir} …`);
  runInherit('npm', ['install', '--no-audit', '--no-fund'], appDir);

  // 4. Production AOT build — the Angular Linker runs on the installed package.
  console.log('clean-room: ng build (production AOT) …');
  runInherit('npm', ['run', 'build'], appDir);

  const browserDir = join(appDir, 'dist', 'clean-room', 'browser');
  if (!existsSync(join(browserDir, 'index.html'))) {
    die(`Build produced no index.html at ${browserDir}`);
  }

  // 5. Serve + render in a real browser. Only this catches the runtime Linker
  //    failure ("JIT compiler unavailable") a build-only check would miss.
  server = serveStatic(browserDir);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`clean-room: rendering ${url} in headless Chromium …`);

  browser = await chromium.launch().catch((e) => {
    die(
      `could not launch Chromium (${e.message}). ` +
        'Install it with `pnpm exec playwright install chromium`.',
    );
  });
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on('pageerror', (e) => runtimeErrors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') runtimeErrors.push(msg.text());
  });

  await page.goto(url, { waitUntil: 'load' });
  // The report is painted after render; wait for the title text to appear.
  await page
    .getByText('INVOICE', { exact: false })
    .first()
    .waitFor({ timeout: 20000 })
    .catch(() => undefined);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const checks = [
    ['report title "INVOICE"', /INVOICE/.test(bodyText)],
    ['bound customer "Northwind Trading Ltd"', /Northwind Trading Ltd/.test(bodyText)],
    ['a formatted currency total ($…)', /\$[\d,]+\.\d{2}/.test(bodyText)],
    ['resolved page-number footer "Page 1 of N"', /Page 1 of \d+/.test(bodyText)],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([label]) => label);

  if (runtimeErrors.length > 0 || missing.length > 0) {
    console.error('clean-room smoke test FAILED:');
    for (const label of missing) console.error(`  ✗ report did not render: ${label}`);
    for (const err of runtimeErrors) console.error(`  ✗ runtime error: ${err}`);
    if (missing.length > 0) {
      console.error(`  — body text seen (first 400 chars):\n${bodyText.slice(0, 400)}`);
    }
    process.exit(1);
  }

  const pkg = JSON.parse(runCapture('npm', ['pkg', 'get', 'version'], viewerDist).trim());
  console.log(
    `clean-room smoke test OK — @rendara/report-viewer@${pkg} installed from a packed ` +
      'tarball into a fresh external Angular app, AOT-built, and rendered the report ' +
      '(title, bound customer, currency totals, Page 1 of N) with no runtime error.',
  );
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (server) await new Promise((r) => server.close(r));
  // Best-effort cleanup of the throwaway clean room.
  rmSync(appDir, { recursive: true, force: true });
}
