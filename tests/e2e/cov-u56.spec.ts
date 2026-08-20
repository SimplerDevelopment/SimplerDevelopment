/**
 * cov-u56 — Integrations E2E coverage (cards [12..14])
 *
 * Card 12: OAuth tokens GET lists + DELETE revokes
 * Card 13: Unified webhooks console GET aggregates + 401 unauthenticated
 * Card 14: SD OAuth 2.1 discovery — well-known endpoints return valid RFC docs
 */
import { test, expect } from './setup/fixtures';

// ── Card 12: OAuth tokens ──────────────────────────────────────────────────

test.describe('Integrations — OAuth tokens @integrations @oauth-tokens', () => {
  test('GET /api/portal/oauth-tokens segments grants by ownership @critical', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/oauth-tokens');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // Was a flat array of every grant in the client. An OAuth grant is a
    // PERSONAL consent artifact, so the payload is split by ownership: `mine`
    // always, `team` only for owners/admins. `issuedToYou` retired with the
    // split -- the array a grant lands in already says whose it is.
    const data = res.data.data as {
      mine: Array<Record<string, unknown>>;
      team: Array<Record<string, unknown>>;
      canManageTeam: boolean;
    };
    expect(Array.isArray(data.mine)).toBe(true);
    expect(Array.isArray(data.team)).toBe(true);
    expect(typeof data.canManageTeam).toBe('boolean');
    // A member without team authority must never be handed someone else's row.
    if (!data.canManageTeam) expect(data.team).toHaveLength(0);
    for (const row of [...data.mine, ...data.team]) {
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('tokenPreview');
      expect(row).toHaveProperty('clientName');
      expect(row).toHaveProperty('revokedAt');
      expect(row).toHaveProperty('memberName');
    }
  });

  test('GET /api/portal/oauth-tokens returns 401 when unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/oauth-tokens');
    expect(res.status).toBe(401);
  });

  test('DELETE /api/portal/oauth-tokens returns 400 when id is missing', async ({ clientApi }) => {
    const res = await clientApi.delete('/api/portal/oauth-tokens');
    expect(res.status).toBe(400);
  });

  test('DELETE /api/portal/oauth-tokens returns 400 when id is non-numeric', async ({ clientApi }) => {
    const res = await clientApi.delete('/api/portal/oauth-tokens?id=abc');
    expect(res.status).toBe(400);
  });

  test('DELETE /api/portal/oauth-tokens with an unmatched id returns 404', async ({ clientApi }) => {
    // Previously a 200 no-op: the UPDATE matched zero rows and reported success
    // anyway. That is the same path a member hits aiming at a COLLEAGUE's grant
    // (the predicate now also pins `userId` unless you are owner/admin), and
    // answering `{success:true}` rendered as "Revoked" in the UI while nothing
    // had changed -- hiding the authorization boundary rather than reporting it.
    const res = await clientApi.delete('/api/portal/oauth-tokens?id=999999999');
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('DELETE /api/portal/oauth-tokens returns 401 when unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.delete('/api/portal/oauth-tokens?id=1');
    expect(res.status).toBe(401);
  });
});

// ── Card 13: Unified webhooks console ─────────────────────────────────────

test.describe('Integrations — Unified webhooks console @integrations @webhooks', () => {
  test('GET /api/portal/settings/webhooks returns success + data array @critical', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/settings/webhooks');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    // Each row (if any) should have the unified shape
    for (const row of res.data.data as Array<Record<string, unknown>>) {
      expect(row).toHaveProperty('source');
      expect(['project', 'survey', 'site']).toContain(row.source);
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('url');
      expect(row).toHaveProperty('events');
      expect(row).toHaveProperty('enabled');
      expect(row).toHaveProperty('createdAt');
    }
  });

  test('GET /api/portal/settings/webhooks returns 401 when unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/settings/webhooks');
    expect(res.status).toBe(401);
  });
});

// ── Card 14: SD OAuth 2.1 discovery (RFC 8414 + RFC 9728) ─────────────────

test.describe('Integrations — SD OAuth 2.1 discovery @integrations @oauth-discovery', () => {
  test('GET /.well-known/oauth-authorization-server returns valid RFC 8414 document @critical', async ({ unauthApi }) => {
    const res = await unauthApi.get('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    // RFC 8414 required fields
    const doc = res.data as Record<string, unknown>;
    expect(typeof doc.issuer).toBe('string');
    expect(typeof doc.authorization_endpoint).toBe('string');
    expect(typeof doc.token_endpoint).toBe('string');
    expect(Array.isArray(doc.response_types_supported)).toBe(true);
    expect((doc.response_types_supported as string[])).toContain('code');
    // Our implementation adds these
    expect(typeof doc.registration_endpoint).toBe('string');
    expect(Array.isArray(doc.scopes_supported)).toBe(true);
    expect(Array.isArray(doc.grant_types_supported)).toBe(true);
    expect((doc.grant_types_supported as string[])).toContain('authorization_code');
    expect(Array.isArray(doc.code_challenge_methods_supported)).toBe(true);
    expect((doc.code_challenge_methods_supported as string[])).toContain('S256');
  });

  test('GET /.well-known/oauth-protected-resource returns valid RFC 9728 document @critical', async ({ unauthApi }) => {
    const res = await unauthApi.get('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    // RFC 9728 required fields
    const doc = res.data as Record<string, unknown>;
    expect(typeof doc.resource).toBe('string');
    expect((doc.resource as string)).toContain('/api/mcp');
    expect(Array.isArray(doc.authorization_servers)).toBe(true);
    expect((doc.authorization_servers as string[]).length).toBeGreaterThan(0);
    expect(Array.isArray(doc.scopes_supported)).toBe(true);
    // bearer_methods_supported should include header
    expect(Array.isArray(doc.bearer_methods_supported)).toBe(true);
    expect((doc.bearer_methods_supported as string[])).toContain('header');
  });

  test('issuer in oauth-authorization-server matches base URL', async ({ unauthApi }) => {
    const res = await unauthApi.get('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    const doc = res.data as Record<string, unknown>;
    const issuer = doc.issuer as string;
    // issuer must be the origin (no trailing slash, no path)
    expect(issuer).toMatch(/^https?:\/\/[^/]+$/);
    // authorization_endpoint and token_endpoint must be under the same origin
    expect((doc.authorization_endpoint as string).startsWith(issuer)).toBe(true);
    expect((doc.token_endpoint as string).startsWith(issuer)).toBe(true);
  });
});
