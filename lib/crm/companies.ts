import { db } from '@/lib/db';
import { crmCompanies } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { normalizeDomain, domainFromEmail } from '@/lib/crm/parse';

export { normalizeDomain, domainFromEmail };

export interface FindCompanyByDomainArgs {
  clientId: number;
  domain: string;
}

export interface CompanyMatch {
  id: number;
  name: string;
  domain: string | null;
}

/**
 * Look up CRM companies whose domain matches `domain` for this client.
 * Returns *all* matches so the caller can decide:
 *   - 0 matches  → nothing to link (caller may create a `crm_company_create` review item)
 *   - 1 match    → safe to auto-link
 *   - >1 matches → ambiguous; defer to a review item with all candidates
 *
 * Comparison is case-insensitive and ignores a leading "www.". Does not
 * create rows — creation is always a deliberate review-queue action.
 */
export async function findCompanyByDomain(args: FindCompanyByDomainArgs): Promise<CompanyMatch[]> {
  const normalized = normalizeDomain(args.domain);
  if (!normalized) return [];

  const rows = await db.select({
    id: crmCompanies.id,
    name: crmCompanies.name,
    domain: crmCompanies.domain,
  }).from(crmCompanies)
    .where(and(
      eq(crmCompanies.clientId, args.clientId),
      sql`LOWER(REPLACE(${crmCompanies.domain}, 'www.', '')) = ${normalized}`,
    ));
  return rows;
}
