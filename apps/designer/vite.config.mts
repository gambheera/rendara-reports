/// <reference types='vitest' />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import tsconfigPaths from 'vite-tsconfig-paths';

// Angular application: AnalogJS compiles components/templates for Vitest; the
// zoneless TestBed is initialised in src/test-setup.ts. Coverage held to the
// UI bar (brief §9: >=80%); bootstrap/wiring files are excluded.
export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/designer',
  plugins: [angular(), tsconfigPaths({ root: '../../' })],
  test: {
    name: 'designer',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: '../../coverage/apps/designer',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/**/*.config.ts', 'src/test-setup.ts', 'src/**/*.spec.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
}));
