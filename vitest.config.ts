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
    server: {
      deps: {
        // next-auth (v5 beta) ships ESM that imports the `next/server` exports-map
        // subpath; vitest's default externalization can't resolve that subpath from
        // next-auth's own node_modules, so any test that loads the real auth chain
        // (e.g. the MCP SDK adapters) dies with "Cannot find module 'next/server'".
        // Force-transform next-auth + @auth/core through vite, which honors the
        // exports map. Only affects files that actually import next-auth.
        inline: [/next-auth/, /@auth[\\/]core/],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['html', 'lcov', 'text-summary', 'json', 'json-summary'],
      reportsDirectory: 'coverage/vitest',
      // Emit coverage even when some tests fail. Without this (vitest default
      // is false), a single failing/flaky spec suppresses the ENTIRE coverage
      // report — which repeatedly zeroed our measurement runs.
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
      // Line-coverage floors (per tests/CI-GATES.md). Ratchet model: every floor
      // here is at or below the CURRENT measured number (2026-06-24 unit run), so
      // CI fails on a REGRESSION, never on the existing baseline. lib/ai + lib/billing
      // are intentionally set below their 70% target (measured 61.1% / 27.9%) and
      // tracked in the OSS backlog to be raised with real tests — enforcing 70%
      // today would red-CI honest code. Functions/branches/statements stay
      // unenforced (the documented floors are line-based).
      thresholds: {
        lines: 60, // project floor — measured 63.7%
        'lib/crypto/**': { lines: 90 }, // measured 100%
        'lib/agency/**': { lines: 70 }, // measured 100%
        'lib/esign/**': { lines: 70 }, // measured 92.9%
        'lib/chat/**': { lines: 70 }, // measured 93.1%
        'lib/ai/**': { lines: 60 }, // measured 61.1% — backlog: raise to 70
        'lib/billing/**': { lines: 25 }, // measured 27.9% — small domain (333 lines), 25 floor avoids CI noise; backlog: raise to 70
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          // Cold-starting heavy transitive deps (next-auth, drizzle schema) can
          // take 5-8 s on the first dynamic import in a file. Match integration.
          // Under v8 coverage instrumentation everything runs ~2x slower, so a
          // handful of heavy jsdom component specs intermittently blew past a
          // 15s budget (non-deterministic — different specs each run). 30s gives
          // margin so coverage runs don't flake; real hangs still fail, just later.
          testTimeout: 30_000,
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
