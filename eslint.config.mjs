import { defineConfig } from 'eslint/config';
import baseConfig from './.config/eslint.config.mjs';

export default defineConfig([
  {
    ignores: [
      '**/logs',
      '**/*.log',
      '**/npm-debug.log*',
      '**/yarn-debug.log*',
      '**/yarn-error.log*',
      '**/node_modules/',
      '**/.DS_Store',
      '**/pids',
      '**/*.pid',
      '**/*.seed',
      '**/*.pid.lock',
      '**/lib-cov',
      '**/coverage',
      '**/dist/',
      '**/artifacts/',
      '**/work/',
      '**/ci/',
      '**/e2e-results/',
      '**/.eslintcache',
      '**/.idea',
      'playwright-report/',
      'playwright/.cache/',
      'playwright/.auth/',
      'test-results/',
    ],
  },
  ...baseConfig,
  {
    rules: {
      'react/prop-types': 'off',
    },
  },
]);
