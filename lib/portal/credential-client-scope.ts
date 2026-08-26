import { eq, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Matches a credential (portal API key or OAuth access token) that can act for
 * `clientId` — whether that is its DEFAULT client or merely one entry in its
 * consent-time allowlist.
 *
 * Both tables carry the same pair: `client_id` is the default company a call
 * acts on when the caller doesn't say, and `client_ids` is every company the
 * credential was consented for. Filtering on `client_id` alone — which the
 * connected-apps list and revoke handlers all did — meant a credential with
 * `client_ids = [A, B]` and default `A` could read and write B while being
 * invisible in B's own list. B's owner could not see it and could not revoke
 * it: the company whose data was reachable had no control over the access.
 * PUX-052.
 *
 * `client_ids` is a `json` column, not `jsonb`, so containment needs the cast.
 * That mirrors the existing `::jsonb` usage in lib/brain/glossary.ts and
 * lib/brain/topics.ts rather than introducing a new idiom.
 *
 * Use this for BOTH listing and revoking. Listing a credential a company cannot
 * then revoke would be worse than hiding it — it would show the access and
 * offer no way to stop it.
 */
export function credentialActsForClient(
  defaultClientIdColumn: PgColumn,
  clientIdsColumn: PgColumn,
  clientId: number,
): SQL {
  return or(
    eq(defaultClientIdColumn, clientId),
    sql`${clientIdsColumn}::jsonb @> ${JSON.stringify([clientId])}::jsonb`,
  ) as SQL;
}
