/**
 * /api/extension/v1/crm/companies
 *
 *   POST → create a CRM company. If a `domain` is supplied and a row already
 *          exists for that domain (per `findCompanyByDomain`), returns the
 *          existing row with `_existing: true` instead of inserting a dup.
 *   GET  → ILIKE autocomplete for attach-to flows.
 *
 * Tenant-scoped via the API key context.
 */

import { z } from 'zod';
import { and, eq, sql, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { crmCompanies } from '@/lib/db/schema';
import {
  withExtensionAuth,
  extensionOk,
  extensionError,
} from '@/lib/extension/with-auth';
import { findCompanyByDomain } from '@/lib/crm/companies';
import { geocodeAddress } from '@/lib/geocode';

export const runtime = 'nodejs';

const createSchema = z.object({
  name: z.string().trim().min(1).max(255),
  domain: z.string().trim().max(255).optional(),
  industry: z.string().trim().max(100).optional(),
  size: z.string().trim().max(50).optional(),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(2000).optional(),
  website: z.string().trim().max(500).optional(),
  logoUrl: z.string().trim().max(1000).optional(),
});

const POST = withExtensionAuth(async (req, ctx) => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return extensionError('Invalid JSON body');
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return extensionError(`Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  }
  const input = parsed.data;

  // Domain dedupe — if any row for this client matches the domain, return the
  // first (most likely match) with `_existing: true`. Lets the extension
  // surface "you already have a company for this domain — re-use it?".
  if (input.domain) {
    const existing = await findCompanyByDomain({ clientId: ctx.client.id, domain: input.domain });
    if (existing.length > 0) {
      const [full] = await db.select().from(crmCompanies)
        .where(and(eq(crmCompanies.id, existing[0].id), eq(crmCompanies.clientId, ctx.client.id)))
        .limit(1);
      return extensionOk({ ...full, _existing: true });
    }
  }

  // Best-effort geocode when an address is supplied. Failures are logged but
  // never block insert — same posture as the portal route.
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (input.address) {
    try {
      const coords = await geocodeAddress(input.address);
      if (coords) {
        latitude = coords.latitude;
        longitude = coords.longitude;
      }
    } catch (err) {
      console.warn('[extension.crm/companies] geocode failed', err);
    }
  }

  const [row] = await db.insert(crmCompanies).values({
    clientId: ctx.client.id,
    name: input.name,
    domain: input.domain ?? null,
    industry: input.industry ?? null,
    size: input.size ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
    website: input.website ?? null,
    logoUrl: input.logoUrl ?? null,
    latitude: latitude !== null ? String(latitude) : null,
    longitude: longitude !== null ? String(longitude) : null,
  }).returning();

  return extensionOk(row, { status: 201 });
});

const GET = withExtensionAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const search = (url.searchParams.get('search') ?? '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));

  const conds = [eq(crmCompanies.clientId, ctx.client.id)];
  if (search) {
    const pattern = `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(sql`(${crmCompanies.name} ILIKE ${pattern} OR ${crmCompanies.domain} ILIKE ${pattern})`);
  }

  const rows = await db.select({
    id: crmCompanies.id,
    name: crmCompanies.name,
    domain: crmCompanies.domain,
    industry: crmCompanies.industry,
    logoUrl: crmCompanies.logoUrl,
  }).from(crmCompanies)
    .where(and(...conds))
    .orderBy(desc(crmCompanies.updatedAt))
    .limit(limit);

  return extensionOk(rows);
});

export { POST, GET };
export const OPTIONS = POST;
