import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Pure-TS engine library: framework-agnostic Vitest (no Angular plugin), node
// environment, coverage held to the engine/schema bar (brief §9: >=90%).
export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/report-engine',
  plugins: [tsconfigPaths({ root: '../../' })],
  test: {
    name: 'report-engine',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      provider: 'v8' as const,
      reportsDirectory: '../../coverage/libs/report-engine',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.spec.ts'],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
}));
