/**
 * Setup file for the integration-api Vitest project.
 * Boots MSW, prepares a per-worker Postgres schema, and provides teardown hooks.
 *
 * Each vitest worker gets its own schema named `test_e2e_<VITEST_WORKER_ID>` so
 * parallel specs never collide.
 */
// MUST be first — rewrites DATABASE_URL before any @/lib/db import runs.
import './helpers/test-bootstrap';
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { apiMocks } from './helpers/api-mocks';
import { applyTestSchema, truncateTestData } from './helpers/test-db';

export const server = setupServer(...apiMocks);

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  await applyTestSchema();   // idempotent — fast path if schema already migrated
});

beforeEach(async () => {
  server.resetHandlers(...apiMocks);
  await truncateTestData();
});

afterAll(async () => {
  server.close();
  // Intentionally do NOT drop the schema — it persists across test files + runs
  // so subsequent applyTestSchema() takes the fast path. Use reset-e2e-db.ts to
  // force a full rebuild when migration state drifts.
});
