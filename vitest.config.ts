import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['html', 'lcov', 'text-summary', 'json'],
      reportsDirectory: 'coverage/vitest',
      include: [
        'app/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.d.ts',
        '**/*.test.*',
        '**/*.spec.*',
        'components/booking-app/**',
        'scripts/**',
        'drizzle/**',
        'app/**/layout.tsx',
        'app/**/loading.tsx',
        'app/**/not-found.tsx',
        'app/**/error.tsx',
      ],
      all: true,
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration-ui',
          environment: 'jsdom',
          include: ['tests/integration/**/*.test.tsx'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration-api',
          environment: 'node',
          include: ['tests/integration/api/**/*.test.ts'],
          setupFiles: ['./tests/setup-api.ts'],
          // Runs exactly once before any worker — sweeps orphan test_e2e_*
          // schemas left by prior crashed runs so disk usage stays bounded.
          globalSetup: ['./tests/helpers/global-setup.ts'],
          pool: 'forks',
          // Parallel forks, BUT capped at 2 concurrent workers. Each worker
          // owns a test_e2e_<id> schema with ~55 tables; the test DB's disk
          // quota can't host all 16 spec files' schemas at once.
          //   setup-api.ts drops the worker's schema in afterAll.
          //   global-setup drops orphans from crashed runs at startup.
          //   scripts/cleanup-test-schemas.ts sweeps manually.
          maxWorkers: 2,
          minWorkers: 1,
          hookTimeout: 120_000,
          testTimeout: 15_000,
        },
      },
    ],
  },
});
