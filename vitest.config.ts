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
      // `text` keeps the per-file table in CI logs; `html` is for local debug;
      // `lcov` feeds Codecov / shields.io publishers; `json-summary` is what
      // .github/workflows/sd2026-coverage.yml reads to post the PR diff
      // comment. See tests/CI-GATES.md for the consumer side.
      reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],
      reportsDirectory: 'coverage/vitest',
      // vitest >=2.x defaults `reportOnFailure` to `false` — meaning that if
      // even one test fails, the coverage report is silently suppressed. The
      // sd2026 integration suite is in active development and rarely 100%
      // green, so without this we can't measure coverage at all. Re-enable.
      // See https://vitest.dev/config/#coverage-reportonfailure
      reportOnFailure: true,
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
      // Coverage gates. See tests/CI-GATES.md for context and override knobs.
      //
      // Top-level keys (lines/statements/functions/branches) set the
      // project-wide floor that every PR must clear. Per-glob keys raise the
      // floor for the 12 newly-shipped feature areas — billing, AI, agency,
      // e-sign, chat all run at 70%; lib/crypto holds keys/secrets and runs
      // at 90%. Vitest matches glob keys against file paths relative to the
      // project root and applies the strictest matching threshold per file.
      thresholds: {
        // Project-wide floor (60% pragmatic, 50% branches per
        // user-stated coverage target on 2026-05-07).
        lines: 60,
        statements: 60,
        functions: 60,
        branches: 50,
        // Don't auto-bump thresholds when coverage exceeds them — bumps
        // should be intentional commits, not silent ratchets.
        autoUpdate: false,
        // Per-file overrides for the 12 newly-shipped critical modules.
        'lib/billing/**/*.ts': { lines: 70, statements: 70, functions: 70, branches: 60 },
        'lib/ai/**/*.ts':      { lines: 70, statements: 70, functions: 70, branches: 60 },
        'lib/agency/**/*.ts':  { lines: 70, statements: 70, functions: 70, branches: 60 },
        'lib/esign/**/*.ts':   { lines: 70, statements: 70, functions: 70, branches: 60 },
        'lib/chat/**/*.ts':    { lines: 70, statements: 70, functions: 70, branches: 60 },
        // Crypto holds API-key + secret-encryption primitives — every
        // branch matters.
        'lib/crypto/**/*.ts':  { lines: 90, statements: 90, functions: 90, branches: 80 },
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
          include: [
            'tests/integration/api/**/*.test.ts',
            // BYOK resolver / audit / plan-gate touch live DB rows
            // (client_api_keys, services, client_services, usage_meter_events)
            // and so live alongside the api integration suite, even though they
            // exercise lib/* helpers rather than route handlers.
            'tests/integration/ai/**/*.test.ts',
          ],
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
          // TODO: revisit once integration-api specs grow — current cap is
          // conservative for DB schema isolation. Bumping requires either
          // a larger test-DB disk quota or a thinner per-schema footprint.
          maxWorkers: 2,
          // Vitest 4.x requires a unique `sequence.groupOrder` for projects
          // that override `maxWorkers`; otherwise startup fails with
          // "different 'maxWorkers' but same 'sequence.groupOrder'".
          sequence: { groupOrder: 2 },
          // The FIRST test file in each worker pays the full migration replay
          // (~5 min on a remote staging DB across 107 migrations). Every
          // subsequent file finds the schema populated and runs `applyTestSchema`
          // in milliseconds. 120s was too tight for the first replay and was
          // causing every file to skip with "Hook timed out". 360s covers the
          // worst-case remote-DB replay with margin.
          hookTimeout: 360_000,
          testTimeout: 15_000,
        },
      },
    ],
  },
});
