/**
 * /api/extension/v1/crm/contacts
 *
 *   POST → create or upsert (by email) a CRM contact from the extension
 *          (e.g. "save this LinkedIn profile as a contact").
 *   GET  → ILIKE autocomplete for attach-to flows.
 *
 * Tenant-scoped on every query.
 */

import { z } from 'zod';
import { and, eq, sql, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { crmContacts, crmCompanies } from '@/lib/db/schema';
import {
  withExtensionAuth,
  extensionOk,
  extensionError,
} from '@/lib/extension/with-auth';
import { upsertContactByEmail } from '@/lib/crm/contacts';

export const runtime = 'nodejs';

const createSchema = z.object({
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  title: z.string().trim().max(150).optional(),
  companyId: z.number().int().positive().optional(),
  displayName: z.string().trim().max(255).optional(),
  source: z.string().trim().max(100).optional(),
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
  const source = input.source ?? 'extension';

  // Email path → upsert. After upsert, fill in phone/title only when the
  // current row's value is null (don't clobber existing data).
  if (input.email) {
    const fallbackName = [input.firstName, input.lastName].filter(Boolean).join(' ').trim();
    const displayName = input.displayName ?? (fallbackName.length > 0 ? fallbackName : undefined);
    const { contactId } = await upsertContactByEmail({
      clientId: ctx.client.id,
      email: input.email,
      displayName,
      source,
      companyId: input.companyId,
    });

    // Conservative enrichment for the just-touched row.
    const [current] = await db.select().from(crmContacts)
      .where(and(eq(crmContacts.id, contactId), eq(crmContacts.clientId, ctx.client.id)))
      .limit(1);
    if (current) {
      const patch: Partial<typeof crmContacts.$inferInsert> = {};
      if (input.phone && !current.phone) patch.phone = input.phone;
      if (input.title && !current.title) patch.title = input.title;
      if (input.companyId && !current.companyId) patch.companyId = input.companyId;
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = new Date();
        await db.update(crmContacts).set(patch)
          .where(and(eq(crmContacts.id, contactId), eq(crmContacts.clientId, ctx.client.id)));
      }
    }

    const [row] = await db.select().from(crmContacts)
      .where(and(eq(crmContacts.id, contactId), eq(crmContacts.clientId, ctx.client.id)))
      .limit(1);
    return extensionOk(row, { status: 201 });
  }

  // No-email path: require at least one of first/last name.
  if (!input.firstName && !input.lastName) {
    return extensionError('Either `email` or `firstName`/`lastName` is required');
  }
  const [row] = await db.insert(crmContacts).values({
    clientId: ctx.client.id,
    firstName: (input.firstName ?? input.lastName ?? '').trim() || 'Unknown',
    lastName: input.lastName ?? null,
    email: null,
    phone: input.phone ?? null,
    title: input.title ?? null,
    companyId: input.companyId ?? null,
    source,
  }).returning();

  return extensionOk(row, { status: 201 });
});

const GET = withExtensionAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const search = (url.searchParams.get('search') ?? '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));

  const conds = [eq(crmContacts.clientId, ctx.client.id)];
  if (search) {
    const pattern = `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(sql`(${crmContacts.firstName} ILIKE ${pattern} OR ${crmContacts.lastName} ILIKE ${pattern} OR ${crmContacts.email} ILIKE ${pattern})`);
  }

  const rows = await db.select({
    id: crmContacts.id,
    firstName: crmContacts.firstName,
    lastName: crmContacts.lastName,
    email: crmContacts.email,
    title: crmContacts.title,
    companyId: crmContacts.companyId,
    companyName: crmCompanies.name,
  }).from(crmContacts)
    .leftJoin(crmCompanies, eq(crmContacts.companyId, crmCompanies.id))
    .where(and(...conds))
    .orderBy(desc(crmContacts.updatedAt))
    .limit(limit);

  return extensionOk(rows);
});

export { POST, GET };
export const OPTIONS = POST;
