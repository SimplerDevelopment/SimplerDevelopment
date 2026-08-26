/**
 * A credential (portal API key or OAuth access token) carries a DEFAULT client
 * (`client_id`) and a consent-time allowlist of every client it may act for
 * (`client_ids`). The connected-apps list and revoke handlers all filtered on
 * the default alone, so a credential with `client_ids = [A, B]` defaulting to A
 * could read and write B while being invisible in B's own list — B's owner
 * could neither see it nor revoke it. PUX-052.
 *
 * These tests pin the predicate's shape and, more importantly, guard the four
 * call sites. The behavioural proof needs a database; what a unit test CAN do
 * is fail loudly if someone reverts a query to the default-only filter, which
 * is the regression that would silently reopen the hole.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { credentialActsForClient } from '@/lib/portal/credential-client-scope';
import { portalApiKeys, oauthAccessTokens } from '@/lib/db/schema';

const ROUTES = [
  ['app/api/portal/oauth-tokens/route.ts', 'oauthAccessTokens'],
  ['app/api/portal/api-keys/route.ts', 'portalApiKeys'],
] as const;

// NOTE ON WHAT IS *NOT* TESTED HERE.
//
// There is no assertion on the generated SQL. Introspecting drizzle's internal
// `SQL` object (queryChunks, StringChunk shapes) tests the library's internals
// rather than our behaviour, and breaks on a drizzle upgrade for no benefit —
// I tried it and threw it away.
//
// The real proof is behavioural — a credential with client_ids=[A,B] appearing
// in B's list and being revocable from B — and that needs a database, so it
// belongs in the integration layer, not here (tests/CLAUDE.md: "if a test needs
// a request, a session, or a DB row, it's NOT a unit test").
//
// What these guards DO catch is the realistic regression: someone reverting a
// query to the default-only filter, or fixing the listing and forgetting the
// revoke. That is how this hole would reopen.

describe('every credential query scopes by the allowlist, not the default alone', () => {
  it.each(ROUTES)('%s routes its credential scoping through the shared helper', (file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8');
    expect(src, `${file} no longer imports credentialActsForClient`).toContain(
      'credentialActsForClient',
    );
  });

  // The exact shape that caused PUX-052. Reintroducing it in either route
  // silently makes cross-client credentials invisible and unrevocable again.
  it.each(ROUTES)('%s does not filter credentials on clientId alone', (file, table) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8');
    const defaultOnly = `eq(${table}.clientId, client.id)`;
    expect(
      src.includes(defaultOnly),
      `${file} filters on the DEFAULT client only (${defaultOnly}). A credential ` +
        `whose client_ids includes this client but defaults to another becomes ` +
        `invisible and unrevocable here. Use credentialActsForClient instead.`,
    ).toBe(false);
  });

  // Guard against fixing the listing and forgetting the revoke, which would be
  // worse than the original bug: showing access with no way to stop it.
  it.each(ROUTES)('%s uses the helper in BOTH the list and the revoke query', (file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8');
    const uses = src.split('credentialActsForClient(').length - 1;
    expect(uses, `${file} calls the helper ${uses}x — expected 2 (list + revoke)`).toBe(2);
  });
});
