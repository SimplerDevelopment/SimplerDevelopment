/**
 * GET /api/extension/v1/crm/deals?status={open|all}&limit={n}
 *
 * Slim deal list for the "attach this note to a deal" dropdown in the
 * extension popup. `status=open` (default) filters to deals where
 * `crm_deals.status = 'open'` — the schema models won/lost as a varchar status
 * column on the deal itself, so we don't have to traverse pipeline stages.
 *
 * Tenant-scoped on `clientId`.
 */

import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { crmDeals, crmPipelineStages, crmCompanies } from '@/lib/db/schema';
import {
  withExtensionAuth,
  extensionOk,
} from '@/lib/extension/with-auth';

export const runtime = 'nodejs';

const handler = withExtensionAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const status = (url.searchParams.get('status') ?? 'open').toLowerCase();
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '25', 10) || 25));

  const conds = [eq(crmDeals.clientId, ctx.client.id)];
  if (status === 'open') {
    // crm_deals.status is a free-form varchar but the schema's documented
    // values are 'open' | 'won' | 'lost'. Filter by 'open' for the default.
    conds.push(eq(crmDeals.status, 'open'));
  }

  const rows = await db.select({
    id: crmDeals.id,
    title: crmDeals.title,
    status: crmDeals.status,
    value: crmDeals.value,
    contactId: crmDeals.contactId,
    companyId: crmDeals.companyId,
    stage: crmPipelineStages.name,
    companyName: crmCompanies.name,
  }).from(crmDeals)
    .leftJoin(crmPipelineStages, eq(crmDeals.stageId, crmPipelineStages.id))
    .leftJoin(crmCompanies, eq(crmDeals.companyId, crmCompanies.id))
    .where(and(...conds))
    .orderBy(desc(crmDeals.updatedAt))
    .limit(limit);

  return extensionOk(rows);
});

export { handler as GET, handler as OPTIONS };
