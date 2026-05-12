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

// AI provider stubs — `resolveClientApiKey` looks up a BYOK row first, then
// falls back to the platform env var for that provider. Without these set,
// every branding/ai-tools, pitch-decks/generate, automations/parse, and
// settings/api-keys-AI test fails on `[resolveClientApiKey] No BYOK row and
// no platform env var for provider=anthropic`. MSW already intercepts
// api.anthropic.com / api.openai.com (see tests/helpers/api-mocks.ts), so
// these stub keys never leave the test process.
process.env.ANTHROPIC_API_KEY ??= 'sk-ant-test-dummy-key-for-integration-tests';
process.env.OPENAI_API_KEY ??= 'sk-test-dummy-key-for-integration-tests';
/** Sentinel any future SDK wrapper can check to short-circuit when MSW
 *  isn't loaded (e.g. E2E hitting a live dev server). */
process.env.TEST_AI_STUB ??= '1';
// Inbound email secret — the route throws at boot if unset or set to the
// placeholder (post-C7 hardening). Tests don't exercise that boot guard.
process.env.INBOUND_EMAIL_SECRET ??= 'test-inbound-secret-do-not-use-in-prod';
// CRON_SECRET — cron unit tests already mock the env-var read per file, but
// integration tests that boot the route module need a non-empty value or
// the boot-time assertion path bails.
process.env.CRON_SECRET ??= 'test-cron-secret';

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
