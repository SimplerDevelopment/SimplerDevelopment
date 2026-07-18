/**
 * GET /api/extension/v1/search?q={q}&limit={n}
 *
 * Unified search across Brain notes (semantic + lexical) and CRM contacts /
 * companies / deals (lexical). Used by the extension's "find a record to
 * attach this note to" flow.
 *
 * Tenant-scoped on every query — `clientId` is always the resolved key's
 * client.
 */

import { and, eq, sql, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { crmCompanies, crmContacts, crmDeals } from '@/lib/db/schema';
import {
  withExtensionAuth,
  extensionOk,
  extensionError,
} from '@/lib/extension/with-auth';
import { searchBrain } from '@/lib/brain/search';

export const runtime = 'nodejs';

const handler = withExtensionAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!q) return extensionError('Missing required `q` query parameter');

  const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') ?? '8', 10) || 8));

  const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const clientId = ctx.client.id;

  const [brainResults, contacts, companies, deals] = await Promise.all([
    searchBrain(clientId, q, { types: ['note'], limit }).catch((err) => {
      console.warn('[extension.search] brain search failed', err);
      return { hits: [] as Awaited<ReturnType<typeof searchBrain>>['hits'] };
    }),
    db.select({
      id: crmContacts.id,
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
      email: crmContacts.email,
      title: crmContacts.title,
      companyId: crmContacts.companyId,
    }).from(crmContacts)
      .where(and(
        eq(crmContacts.clientId, clientId),
        sql`(${crmContacts.firstName} ILIKE ${pattern} OR ${crmContacts.lastName} ILIKE ${pattern} OR ${crmContacts.email} ILIKE ${pattern})`,
      ))
      .orderBy(desc(crmContacts.updatedAt))
      .limit(limit),
    db.select({
      id: crmCompanies.id,
      name: crmCompanies.name,
      domain: crmCompanies.domain,
      industry: crmCompanies.industry,
      logoUrl: crmCompanies.logoUrl,
    }).from(crmCompanies)
      .where(and(
        eq(crmCompanies.clientId, clientId),
        sql`(${crmCompanies.name} ILIKE ${pattern} OR ${crmCompanies.domain} ILIKE ${pattern})`,
      ))
      .orderBy(desc(crmCompanies.updatedAt))
      .limit(limit),
    db.select({
      id: crmDeals.id,
      title: crmDeals.title,
      status: crmDeals.status,
      value: crmDeals.value,
      contactId: crmDeals.contactId,
      companyId: crmDeals.companyId,
    }).from(crmDeals)
      .where(and(
        eq(crmDeals.clientId, clientId),
        sql`${crmDeals.title} ILIKE ${pattern}`,
      ))
      .orderBy(desc(crmDeals.updatedAt))
      .limit(limit),
  ]);

  const notes = brainResults.hits
    .filter((h) => h.type === 'note')
    .map((h) => ({
      id: h.id,
      title: h.title,
      snippet: h.snippet,
      url: h.url,
    }));

  return extensionOk({ notes, contacts, companies, deals });
});

export { handler as GET, handler as OPTIONS };
