import { getTestSql, TEST_SCHEMA } from './test-db';

/**
 * Grant a test tenant an active all-in-one `bundle` subscription.
 *
 * `hasServiceAccess` (lib/portal-auth.ts) treats a `bundle` category as access
 * to every service, so this single grant satisfies every `requireService`
 * gate (crm / websites / email / booking / surveys / store / hosting).
 *
 * Opt-in by design: most route tests want an entitled tenant, but
 * entitlement-gate tests (e.g. hosting/pages "no active service → 403") rely on
 * the un-granted default, so callers grant explicitly rather than this being
 * baked into sessionForNewClientUser. Mirrors the per-category seed pattern in
 * tests/integration/api/surveys/crud.test.ts (enableSurveys).
 */
export async function grantBundle(clientId: number): Promise<void> {
  const sql = getTestSql();
  const slug = `bundle-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle)
    VALUES ('All-in-One', ${slug}, 'bundle', 0, 'monthly') RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${clientId}, ${svc.id}, 'active')
  `;
}
