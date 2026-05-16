// Per-site tracking-script configuration API.
//
// Pattern follows the sibling website route (`../route.ts`):
//   - NextAuth session check via `auth()`
//   - Tenant resolution via `getPortalClient(userId)`
//   - Site ownership guard against `clientWebsites.clientId === client.id`
//   - Envelope: `{ success, data | message }`
//
// All field-level validation/normalisation is delegated to
// `lib/site-tracking/providers.ts` so the UI, API, and renderer share one
// source of truth. The list of writable columns is derived from PROVIDERS
// keys — no hardcoded allowlist in this file.

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites, siteTracking } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { parseSiteIdParam } from '@/lib/api/parse-params';
import { PROVIDERS, normalizeTrackingValue } from '@/lib/site-tracking/providers';

async function resolveSite(siteIdRaw: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }),
    };
  }

  const parsed = parseSiteIdParam(siteIdRaw);
  if (!parsed.ok) return { ok: false as const, response: parsed.response };

  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parsed.value), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 }),
    };
  }

  return { ok: true as const, site };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const resolved = await resolveSite(siteId);
  if (!resolved.ok) return resolved.response;

  const [row] = await db
    .select()
    .from(siteTracking)
    .where(eq(siteTracking.websiteId, resolved.site.id))
    .limit(1);

  // Don't auto-create — return null when there's no row yet so the UI knows
  // it's working with defaults.
  return NextResponse.json({ success: true, data: row ?? null });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const resolved = await resolveSite(siteId);
  if (!resolved.ok) return resolved.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: 'Body must be a JSON object' }, { status: 400 });
  }

  // Validate + normalise each known provider key present in the body.
  // Drizzle's inferred insert type for `siteTracking` accepts string|null for
  // every nullable column, boolean for `enabled`, and Date for `updatedAt`,
  // so this shape lines up after the spread below.
  type SiteTrackingUpdate = Partial<typeof siteTracking.$inferInsert>;
  const updates: SiteTrackingUpdate = {};
  for (const provider of PROVIDERS) {
    if (!(provider.key in body)) continue;
    const result = normalizeTrackingValue(provider.key, body[provider.key]);
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.error }, { status: 400 });
    }
    (updates as Record<string, string | null>)[provider.key] = result.value;
  }

  // `enabled` is the only non-provider field on the row.
  if ('enabled' in body) {
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        { success: false, message: '`enabled` must be a boolean.' },
        { status: 400 },
      );
    }
    updates.enabled = body.enabled;
  }

  updates.updatedAt = new Date();

  const [existing] = await db
    .select()
    .from(siteTracking)
    .where(eq(siteTracking.websiteId, resolved.site.id))
    .limit(1);

  let finalRow;
  if (!existing) {
    // Insert path — fill in only the keys the caller provided; everything else
    // takes the column default (null for fields, true for `enabled`).
    const [inserted] = await db
      .insert(siteTracking)
      .values({ websiteId: resolved.site.id, ...updates })
      .returning();
    finalRow = inserted;
  } else {
    const [updated] = await db
      .update(siteTracking)
      .set(updates)
      .where(eq(siteTracking.websiteId, resolved.site.id))
      .returning();
    finalRow = updated;
  }

  return NextResponse.json({ success: true, data: finalRow });
}
