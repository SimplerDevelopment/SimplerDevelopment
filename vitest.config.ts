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
          // Runs exactly once before any worker:
          //   1) sweeps orphan test_e2e_* DBs + same-name schemas from prior
          //      crashed runs so disk usage stays bounded
          //   2) builds simplerdev_test_template by replaying every
          //      drizzle/*.sql ONCE — that's the entire migration cost for
          //      the run. Per-file CREATE DATABASE … TEMPLATE is then
          //      single-digit seconds.
          globalSetup: ['./tests/helpers/global-setup.ts'],
          pool: 'forks',
          // Parallel forks, BUT capped at 2 concurrent workers. Each worker
          // owns a per-worker DB (`test_e2e_w<id>`) created from the
          // template. Two concurrent workers ≤ two extra full-size DB copies
          // on disk at any moment.
          //   setup-api.ts drops the worker's DB in afterAll.
          //   global-setup drops orphans from crashed runs at startup, and
          //   drops the template DB at end of run.
          //   scripts/cleanup-test-schemas.ts sweeps manually.
          maxWorkers: 2,
          // Vitest 4.x requires a unique `sequence.groupOrder` for projects
          // that override `maxWorkers`; otherwise startup fails with
          // "different 'maxWorkers' but same 'sequence.groupOrder'".
          sequence: { groupOrder: 2 },
          // Generous because beforeAll/afterAll issue DROP/CREATE DATABASE
          // against Postgres. The template clone itself is fast; the budget
          // here is mostly for the rare slow filesystem op or a contended
          // server. globalSetup's own ~1-2 min template build has its own
          // implicit timeout (the vitest globalSetup hook).
          hookTimeout: 60_000,
          testTimeout: 15_000,
        },
      },
    ],
  },
});
