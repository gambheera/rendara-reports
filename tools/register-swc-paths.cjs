/**
 * Preload for developer CLI scripts that import workspace libraries through the
 * `@rendara/*` path aliases (E4-S1). Unlike `report-schema`, the `report-engine`
 * and `report-renderer` source use those aliases internally, so `@swc-node/register`
 * must be told which tsconfig carries `compilerOptions.paths`. Pointing it at the
 * workspace `tsconfig.base.json` enables alias resolution cross-platform without
 * an inline env var (no `cross-env` dependency).
 *
 * Usage: `node -r ./tools/register-swc-paths.cjs <script>.ts`.
 */
const path = require('node:path');

if (!process.env.SWC_NODE_PROJECT) {
  process.env.SWC_NODE_PROJECT = path.join(__dirname, '..', 'tsconfig.base.json');
}

require('@swc-node/register');
