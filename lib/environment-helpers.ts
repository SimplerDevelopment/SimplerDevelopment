import { db } from '@/lib/db';
import { clientWebsites, websiteEnvironments, websiteEnvVars, websiteBackups, siteBranding, siteNavigation, storeSettings } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

/** Get a site + environment after verifying ownership. */
export async function getEnvironmentForClient(userId: number, siteId: string, envId: string) {
  const client = await getPortalClient(userId);
  if (!client) return null;

  const [site] = await db.select().from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  if (!site) return null;

  const [env] = await db.select().from(websiteEnvironments)
    .where(and(eq(websiteEnvironments.id, parseInt(envId)), eq(websiteEnvironments.websiteId, site.id)))
    .limit(1);
  if (!env) return null;

  return { client, site, env };
}

/** Snapshot the current state of an environment (env vars + settings). */
export async function snapshotEnvironment(environmentId: number, websiteId: number) {
  const envVars = await db.select({ key: websiteEnvVars.key, value: websiteEnvVars.value })
    .from(websiteEnvVars)
    .where(eq(websiteEnvVars.environmentId, environmentId));

  const [branding] = await db.select().from(siteBranding)
    .where(eq(siteBranding.websiteId, websiteId)).limit(1);

  const [navigation] = await db.select().from(siteNavigation)
    .where(eq(siteNavigation.websiteId, websiteId)).limit(1);

  const [store] = await db.select().from(storeSettings)
    .where(eq(storeSettings.websiteId, websiteId)).limit(1);

  return {
    envVars,
    branding: branding ? stripMeta(branding) : null,
    navigation: navigation ? stripMeta(navigation) : null,
    storeSettings: store ? stripMeta(store) : null,
  };
}

/** Remove id/timestamps from a record for clean snapshots. */
function stripMeta(record: Record<string, unknown>): Record<string, unknown> {
  const { id, createdAt, updatedAt, ...rest } = record;
  return rest;
}
