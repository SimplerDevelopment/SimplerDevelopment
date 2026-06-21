/**
 * Integrations E2E Coverage — unit 53
 *
 * Cards covered (indices 0-3 from the "## To Test" backlog):
 *   0. Google OAuth token refresh + revocation (upstream) — needs spec
 *   1. Microsoft OAuth token refresh + revocation (upstream) — needs spec
 *   2. Encrypt refresh tokens at rest — needs spec
 *   3. Public outbound webhook delivery — needs spec
 *
 * Cards 1, 2, and 3 map to known gaps in the codebase (see "Gaps Found" in the
 * audit board). Card 0 is partially implementable: the disconnect endpoint and
 * status endpoint exist and are tested below for the no-connection and
 * unauthenticated paths. Full upstream-revoke testing requires a live Google
 * OAuth token in the DB, which the current E2E seed does not provide.
 */
import { test, expect } from './setup/fixtures';

// ── Card 0: Google OAuth token refresh + revocation (upstream) ──

test.describe('Integrations — Google OAuth disconnect / status @integrations', () => {
  test(
    'GET /api/portal/integrations/google/status returns 401 when unauthenticated',
    async ({ unauthApi }) => {
      const res = await unauthApi.get('/api/portal/integrations/google/status');
      expect(res.status).toBe(401);
    },
  );

  test(
    'GET /api/portal/integrations/google/status returns tier + connection shape when authenticated',
    async ({ clientApi }) => {
      const res = await clientApi.get('/api/portal/integrations/google/status');
      // Status may vary (standard or enterprise) — what matters is the shape is correct
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('tier');
      // connection is either null (not connected) or an object
      expect('connection' in res.data).toBe(true);
    },
  );

  test(
    'POST /api/portal/integrations/google/disconnect returns 401 when unauthenticated',
    async ({ unauthApi }) => {
      const res = await unauthApi.post('/api/portal/integrations/google/disconnect', {});
      expect(res.status).toBe(401);
    },
  );

  test(
    'POST /api/portal/integrations/google/disconnect is idempotent when no connection exists',
    async ({ clientApi }) => {
      // Seed user (client@example.com) has no Google OAuth connection.
      // Disconnect should respond with alreadyDisconnected:true (not error).
      const res = await clientApi.post('/api/portal/integrations/google/disconnect', {});
      // 200 with ok:true is the expected shape for the no-connection path
      expect(res.status).toBe(200);
      expect(res.data.ok).toBe(true);
      expect(res.data.alreadyDisconnected).toBe(true);
    },
  );
});
