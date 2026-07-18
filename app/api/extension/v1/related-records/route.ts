/**
 * GET /api/extension/v1/related-records?url={url}
 *
 * "Deal-aware capture": given the URL of the page the extension is open on,
 * find CRM companies whose domain matches that URL's host, and return their
 * open deals + recent contacts. Powers the "On this site" suggestion in the
 * popup so users can attach a capture to an existing deal in one click.
 *
 * `crm_companies.domain` is free-form and historically dirty (some rows are
 * full URLs like `https://acme.com/`, some have a leading `www.`, some are
 * bare). We normalize defensively in SQL with LOWER + REPLACE so the match
 * works across all variants. We also accept subdomains of the host (`*.host`)
 * so deep-linked pages on a known company still match.
 *
 * Tenant-scoped on `clientId` for every query.
 */

import { and, eq, desc, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  crmCompanies,
  crmContacts,
  crmDeals,
  crmPipelineStages,
} from '@/lib/db/schema';
import {
  withExtensionAuth,
  extensionOk,
  extensionError,
} from '@/lib/extension/with-auth';

export const runtime = 'nodejs';

const handler = withExtensionAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const target = url.searchParams.get('url')?.trim();
  if (!target) return extensionError('Missing required `url` query parameter');

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return extensionError('Invalid url', 400);
  }

  const host = (parsed.host || '').replace(/^www\./i, '').toLowerCase();
  if (!host) {
    return extensionOk({ host: null, companies: [], deals: [], contacts: [] });
  }

  // Defensive normalization in SQL: lowercase + strip leading scheme + leading
  // www., then compare/suffix-match against `host`. Bare-host rows match
  // exactly; subdomain rows (e.g. `blog.acme.com`) match the `LIKE '%.host'`
  // suffix branch.
  const normalizedDomain = sql<string>`lower(regexp_replace(coalesce(${crmCompanies.domain}, ''), '^https?://(www\\.)?', ''))`;
  const subdomainPattern = `%.${host}`;

  const companyRows = await db
    .select({
      id: crmCompanies.id,
      name: crmCompanies.name,
      domain: crmCompanies.domain,
      industry: crmCompanies.industry,
      logoUrl: crmCompanies.logoUrl,
    })
    .from(crmCompanies)
    .where(
      and(
        eq(crmCompanies.clientId, ctx.client.id),
        or(
          eq(normalizedDomain, host),
          sql`${normalizedDomain} LIKE ${subdomainPattern}`,
        ),
      ),
    )
    .orderBy(desc(crmCompanies.updatedAt))
    .limit(5);

  if (companyRows.length === 0) {
    return extensionOk({ host, companies: [], deals: [], contacts: [] });
  }

  const companyIds = companyRows.map((c) => c.id);

  // Open deals for the matching companies. Slim shape mirrors
  // `app/api/extension/v1/crm/deals/route.ts` (id, title, status, value,
  // contactId, companyId, stage) so the extension can reuse `SearchDeal`.
  const dealRows = await db
    .select({
      id: crmDeals.id,
      title: crmDeals.title,
      status: crmDeals.status,
      value: crmDeals.value,
      contactId: crmDeals.contactId,
      companyId: crmDeals.companyId,
      stage: crmPipelineStages.name,
    })
    .from(crmDeals)
    .leftJoin(crmPipelineStages, eq(crmDeals.stageId, crmPipelineStages.id))
    .where(
      and(
        eq(crmDeals.clientId, ctx.client.id),
        eq(crmDeals.status, 'open'),
        inArray(crmDeals.companyId, companyIds),
      ),
    )
    .orderBy(desc(crmDeals.updatedAt))
    .limit(10);

  const contactRows = await db
    .select({
      id: crmContacts.id,
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
      email: crmContacts.email,
      title: crmContacts.title,
      companyId: crmContacts.companyId,
    })
    .from(crmContacts)
    .where(
      and(
        eq(crmContacts.clientId, ctx.client.id),
        inArray(crmContacts.companyId, companyIds),
      ),
    )
    .orderBy(desc(crmContacts.createdAt))
    .limit(10);

  return extensionOk({
    host,
    companies: companyRows,
    deals: dealRows,
    contacts: contactRows,
  });
});

export { handler as GET, handler as OPTIONS };
