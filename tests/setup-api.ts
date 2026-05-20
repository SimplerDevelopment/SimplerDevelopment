/**
 * Setup file for the integration-api Vitest project.
 * Boots MSW, prepares a per-worker Postgres DATABASE, and provides teardown
 * hooks. Vitest 4.x runs setupFiles' beforeAll/afterAll hooks at the test
 * FILE boundary, so each test file gets a fresh DB cloned from the template
 * built once in globalSetup.
 *
 * Each vitest worker gets its own DB named
 * `test_e2e_<worktreeId>_w<VITEST_POOL_ID>` (the worktreeId prefix lets
 * two checkouts of the same repo run integration tests in parallel
 * without racing on the same names; see test-bootstrap.ts). The DB is
 * dropped+recreated from the template in beforeAll (single-digit
 * seconds), then dropped in afterAll.
 */
// MUST be first — rewrites DATABASE_URL before any @/lib/db import runs.
import './helpers/test-bootstrap';
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { apiMocks } from './helpers/api-mocks';
import { applyTestSchema, truncateTestData, dropTestDatabase } from './helpers/test-db';

export const server = setupServer(...apiMocks);

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  // CREATE DATABASE <perWorkerDb> TEMPLATE simplerdev_test_template.
  // Cheap (file-level copy); the migration replay was paid once in
  // globalSetup.
  await applyTestSchema();
});

beforeEach(async () => {
  server.resetHandlers(...apiMocks);
  await truncateTestData();
});

afterAll(async () => {
  server.close();
  // DROP DATABASE so we don't accumulate across files within one run, and
  // close the work-pool first so DROP doesn't have to evict via WITH (FORCE).
  await dropTestDatabase();
});
