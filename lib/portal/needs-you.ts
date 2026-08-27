// "Needs you" (PUX-145, design doc screen 01): the things only the client can
// do, pulled from every room and sorted by what they want from them. This is
// the I/O half — six tenant-scoped reads, each degrading on its own so a
// failed source costs one bucket, not Home. The shaping lives in
// needs-you-shape.ts so it can be unit-tested without a DB.
//
// What each verb honestly maps to in this schema (the design doc's "Sign" row
// is a proposal the tenant SENT — outbound — so it is "Follow up" here, and
// "Sign" is reserved for a contract that still needs the tenant's side):
//   Approve   mcp_pending_changes.status = 'pending'         → /portal/approvals
//   Sign      crm_contracts.status = 'partially_signed'      → the contract
//   Follow up crm_proposals.status = 'viewed'                → the proposal
//   Reply     support_tickets.status ∈ waiting_on_customer   → the ticket
//   Pay       invoices.status ∈ (sent, overdue)              → the invoice (its page starts checkout)
//   Decide    brain_decisions.status = 'proposed'            → the decision
// "Needs an owner" is not a column anywhere — it is decision_maker_id IS NULL.

import { db } from '@/lib/db';
import {
  brainDecisions, crmContracts, crmProposals, invoices, mcpPendingChanges, supportTickets,
} from '@/lib/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { formatMoney } from '@/lib/utils/money';
import { ago, sortNeedsYou, type NeedsYouRow } from './needs-you-shape';

// ponytail: 25 per source, counted in memory. The total is exact up to 25 per
// bucket, which is already five Homes' worth; swap for count() queries if a
// tenant ever has more than that waiting.
const PER_SOURCE = 25;

async function safe<T>(label: string, p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch (err) {
    console.error(`[needs-you] "${label}" failed — bucket skipped:`, err);
    return [];
  }
}

const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export async function collectNeedsYou(clientId: number, now = new Date()): Promise<{ items: NeedsYouRow[]; total: number }> {
  const [approvals, contracts, proposals, tickets, unpaid, decisions] = await Promise.all([
    safe('approvals', db
      .select({ id: mcpPendingChanges.id, summary: mcpPendingChanges.summary, operation: mcpPendingChanges.operation, entityType: mcpPendingChanges.entityType, at: mcpPendingChanges.createdAt })
      .from(mcpPendingChanges)
      .where(and(eq(mcpPendingChanges.clientId, clientId), eq(mcpPendingChanges.status, 'pending')))
      .orderBy(desc(mcpPendingChanges.createdAt)).limit(PER_SOURCE)),
    safe('contracts', db
      .select({ id: crmContracts.id, title: crmContracts.title, at: crmContracts.updatedAt })
      .from(crmContracts)
      .where(and(eq(crmContracts.clientId, clientId), eq(crmContracts.status, 'partially_signed')))
      .orderBy(desc(crmContracts.updatedAt)).limit(PER_SOURCE)),
    safe('proposals', db
      .select({ id: crmProposals.id, title: crmProposals.title, viewCount: crmProposals.viewCount, sentAt: crmProposals.sentAt, lastViewedAt: crmProposals.lastViewedAt })
      .from(crmProposals)
      .where(and(eq(crmProposals.clientId, clientId), eq(crmProposals.status, 'viewed')))
      .orderBy(desc(crmProposals.lastViewedAt)).limit(PER_SOURCE)),
    safe('tickets', db
      .select({ id: supportTickets.id, number: supportTickets.number, subject: supportTickets.subject, at: supportTickets.updatedAt })
      .from(supportTickets)
      .where(and(eq(supportTickets.clientId, clientId), inArray(supportTickets.status, ['waiting_on_customer', 'waiting'])))
      .orderBy(desc(supportTickets.updatedAt)).limit(PER_SOURCE)),
    safe('invoices', db
      .select({ id: invoices.id, number: invoices.number, total: invoices.total, status: invoices.status, dueDate: invoices.dueDate, createdAt: invoices.createdAt })
      .from(invoices)
      .where(and(eq(invoices.clientId, clientId), inArray(invoices.status, ['sent', 'overdue'])))
      .orderBy(desc(invoices.dueDate)).limit(PER_SOURCE)),
    safe('decisions', db
      .select({ id: brainDecisions.id, title: brainDecisions.title, ownerId: brainDecisions.decisionMakerId, at: brainDecisions.createdAt })
      .from(brainDecisions)
      .where(and(eq(brainDecisions.clientId, clientId), eq(brainDecisions.status, 'proposed')))
      .orderBy(desc(brainDecisions.createdAt)).limit(PER_SOURCE)),
  ]);

  const epoch = new Date(0);
  const rows: NeedsYouRow[] = [
    ...approvals.map((a) => ({
      kind: 'approve' as const, key: `approve:${a.id}`,
      title: a.summary ?? `${a.operation} ${a.entityType}`,
      meta: `Approvals · requested ${ago(a.at, now)}`,
      href: '/portal/approvals', cta: 'Review', at: a.at,
    })),
    ...contracts.map((c) => ({
      kind: 'sign' as const, key: `sign:${c.id}`,
      title: `Contract: ${c.title}`,
      meta: `Grow · Contracts · partly signed · ${ago(c.at, now)}`,
      href: `/portal/crm/contracts/${c.id}`, cta: 'Open', at: c.at,
    })),
    ...proposals.map((p) => ({
      kind: 'follow-up' as const, key: `follow-up:${p.id}`,
      title: `Proposal: ${p.title}`,
      meta: `Grow · Proposals · viewed ${p.viewCount ?? 1}×${p.sentAt ? `, sent ${ago(p.sentAt, now)}` : ''}`,
      href: `/portal/crm/proposals/${p.id}`, cta: 'Open', at: p.lastViewedAt ?? p.sentAt ?? epoch,
    })),
    ...tickets.map((t) => ({
      kind: 'reply' as const, key: `reply:${t.id}`,
      title: `#${t.number} “${t.subject}”`,
      meta: `Work · Tickets · waiting on you · ${ago(t.at, now)}`,
      href: `/portal/tickets/${t.id}`, cta: 'Open', at: t.at,
    })),
    ...unpaid.map((i) => {
      const overdue = i.status === 'overdue' || (!!i.dueDate && i.dueDate < now);
      return {
        kind: 'pay' as const, key: `pay:${i.id}`,
        title: `Invoice ${i.number} — ${formatMoney(i.total)}`,
        meta: `Account · Billing · ${overdue ? 'overdue' : i.dueDate ? `due ${shortDate(i.dueDate)}` : 'due on receipt'}`,
        href: `/portal/invoices/${i.id}`, cta: 'Pay', at: i.dueDate ?? i.createdAt, urgent: overdue,
      };
    }),
    ...decisions.map((d) => ({
      kind: 'decide' as const, key: `decide:${d.id}`,
      title: d.title,
      meta: `Brain · Decisions · ${d.ownerId ? 'proposed' : 'needs an owner'} · ${ago(d.at, now)}`,
      href: `/portal/brain/decisions/${d.id}`, cta: 'Weigh in', at: d.at,
    })),
  ];

  const items = sortNeedsYou(rows);
  return { items, total: items.length };
}
