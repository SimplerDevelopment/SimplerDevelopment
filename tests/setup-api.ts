/**
 * Setup file for the integration-api Vitest project.
 * Boots MSW, prepares a per-worker Postgres schema, and provides teardown hooks.
 *
 * Each vitest worker gets its own schema named `test_e2e_<VITEST_WORKER_ID>` so
 * parallel specs never collide.
 */
// Stub env vars that downstream modules require at load time. `??=` so a real
// env var (CI / .env.test) takes precedence. WORKSPACE_TENANT_SECRETS_KEY is
// validated as 64 hex chars by lib/crypto/secrets.ts; RESEND_API_KEY just has
// to be non-empty to satisfy the Resend client and any presence checks.
process.env.WORKSPACE_TENANT_SECRETS_KEY ??= 'a'.repeat(64);
process.env.RESEND_API_KEY ??= 're_test_dummy_key_for_unit_and_integration_tests';

// MUST be first — rewrites DATABASE_URL before any @/lib/db import runs.
import './helpers/test-bootstrap';
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { apiMocks } from './helpers/api-mocks';
import { applyTestSchema, truncateTestData, dropTestSchema } from './helpers/test-db';

export const server = setupServer(...apiMocks);

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  await applyTestSchema();   // idempotent — skipped if this worker's schema was reused
});

beforeEach(async () => {
  server.resetHandlers(...apiMocks);
  await truncateTestData();
});

afterAll(async () => {
  server.close();
  // Drop this worker's schema on teardown so we don't accumulate across runs.
  // If Vitest is configured with singleFork (preferred), this drops exactly
  // once per integration-api run — the migration replay cost is paid once.
  await dropTestSchema();
});
