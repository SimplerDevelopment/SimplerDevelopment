/**
 * GET /api/extension/v1/activity/recent?limit={n}&days={d}
 *
 * Recent extension-originated activity for the tenant: notes and contacts
 * created via the extension within the last `days` days, capped at `limit`
 * per list. Used by the extension popup's "what did I just save?" panel.
 *
 * Tenant-scoped on every query.
 *
 * NOTE: `crm_companies` does not currently carry a `source` column (see
 * `lib/db/schema/crm.ts` — only `crm_contacts.source` exists). Companies are
 * therefore omitted from the response. A `companies: []` field is still
 * returned for shape stability so consumers can rely on the keys; once a
 * `source` column is added the implementation can fill it in.
 */

import { z } from 'zod';
import { and, eq, gte, desc, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brainNotes, crmContacts } from '@/lib/db/schema';
import {
  withExtensionAuth,
  extensionOk,
  extensionError,
} from '@/lib/extension/with-auth';

export const runtime = 'nodejs';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  days: z.coerce.number().int().min(1).max(90).default(14),
});

const handler = withExtensionAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    days: url.searchParams.get('days') ?? undefined,
  });
  if (!parsed.success) {
    return extensionError(`Invalid query: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  }
  const { limit, days } = parsed.data;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const clientId = ctx.client.id;

  const [noteRows, contactRows] = await Promise.all([
    db.select({
      id: brainNotes.id,
      title: brainNotes.title,
      body: brainNotes.body,
      sourceUrl: brainNotes.sourceUrl,
      createdAt: brainNotes.createdAt,
    }).from(brainNotes)
      .where(and(
        eq(brainNotes.clientId, clientId),
        eq(brainNotes.source, 'extension'),
        gte(brainNotes.createdAt, since),
        // Soft-delete guard: brainNotes.deletedAt is non-null on trashed rows.
        isNull(brainNotes.deletedAt),
      ))
      .orderBy(desc(brainNotes.createdAt))
      .limit(limit),
    db.select({
      id: crmContacts.id,
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
      email: crmContacts.email,
      createdAt: crmContacts.createdAt,
    }).from(crmContacts)
      .where(and(
        eq(crmContacts.clientId, clientId),
        eq(crmContacts.source, 'extension'),
        gte(crmContacts.createdAt, since),
      ))
      .orderBy(desc(crmContacts.createdAt))
      .limit(limit),
  ]);

  const slimNotes = noteRows.map((n) => ({
    id: n.id,
    title: n.title,
    snippet: (n.body ?? '').slice(0, 160).replace(/\s+/g, ' ').trim(),
    sourceUrl: n.sourceUrl,
    createdAt: n.createdAt,
  }));

  const slimContacts = contactRows.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    createdAt: c.createdAt,
  }));

  return extensionOk({
    notes: slimNotes,
    contacts: slimContacts,
    // Companies: omitted because crm_companies has no `source` column today.
    // Returning an empty array preserves response shape for clients.
    companies: [] as Array<{ id: number; name: string; domain: string | null; createdAt: Date }>,
  });
});

export { handler as GET, handler as OPTIONS };
