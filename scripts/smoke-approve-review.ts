/**
 * Smoke test for approveReviewItem on the new CRM types.
 *
 * Usage:
 *   tsx scripts/smoke-approve-review.ts <review_item_id>
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { db } from '@/lib/db';
import { brainAiReviewItems, brainMeetings, crmDeals, crmCompanies, crmContacts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { approveReviewItem } from '@/lib/brain/review';

async function main() {
  const itemId = Number(process.argv[2]);
  if (!Number.isFinite(itemId)) throw new Error('Pass review item id as arg 1');

  const [item] = await db.select().from(brainAiReviewItems).where(eq(brainAiReviewItems.id, itemId)).limit(1);
  if (!item) throw new Error(`No review item id=${itemId}`);
  console.log(`[approve] item id=${item.id} type=${item.proposedType} status=${item.status} clientId=${item.clientId}`);

  try {
    const res = await approveReviewItem({ clientId: item.clientId, itemId, actorId: 1 });
    console.log(`[approve] OK resultEntityType=${res.resultEntityType} resultEntityId=${res.resultEntityId}`);
  } catch (e) {
    console.log(`[approve] FAILED: ${(e as Error).message}`);
    return;
  }

  // Read back
  if (item.sourceType === 'meeting') {
    const [m] = await db.select().from(brainMeetings).where(eq(brainMeetings.id, item.sourceId)).limit(1);
    if (m) console.log(`[approve] meeting ${m.id} companyId=${m.companyId} dealId=${m.dealId}`);
  }
  switch (item.proposedType) {
    case 'crm_deal_create':
    case 'crm_deal_link': {
      const deals = await db.select().from(crmDeals).where(eq(crmDeals.clientId, item.clientId));
      console.log(`[approve] crm_deals (${deals.length}):`);
      for (const d of deals) console.log(`  - id=${d.id} title="${d.title}" stage=${d.stageId} status=${d.status}`);
      break;
    }
    case 'crm_company_create':
    case 'crm_company_link': {
      const cos = await db.select().from(crmCompanies).where(eq(crmCompanies.clientId, item.clientId));
      console.log(`[approve] crm_companies (${cos.length}): last 3:`);
      for (const c of cos.slice(-3)) console.log(`  - id=${c.id} name="${c.name}" domain=${c.domain}`);
      break;
    }
    case 'crm_contact_classify': {
      const [c] = await db.select().from(crmContacts).where(eq(crmContacts.id, (item.proposedPayload as { contactId: number }).contactId)).limit(1);
      if (c) console.log(`[approve] crm_contact: status=${c.status} seniority=${c.seniority} department=${c.department} title=${c.title}`);
      break;
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error('[approve] FAILED:', e); process.exit(1); });
