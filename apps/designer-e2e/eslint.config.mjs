import playwright from 'eslint-plugin-playwright';
import baseConfig from '../../eslint.config.mjs';

export default [
  playwright.configs['flat/recommended'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.js'],
    // The axe wrapper carries its own expect(); teach the rule to count it.
    rules: {
      'playwright/expect-expect': ['error', { assertFunctionNames: ['expectNoAxeViolations'] }],
    },
  },
];
