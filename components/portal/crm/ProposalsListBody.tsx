'use client';

// Extracted verbatim from app/portal/crm/proposals/page.tsx (PUX-173) — the page is pinned at its current size; the Proposals & contracts room mounts this body under the flag.

import { formatMoney } from '@/lib/utils/money';
import { normalizeLineItems, sumLineItems } from '@/lib/proposals/line-items';
import { pCard } from '@/components/portal/portal-ui';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Proposal {
  id: number;
  title: string;
  status: string;
  contactId: number | null;
  companyId: number | null;
  dealId: number | null;
  lineItems: LineItem[];
  fees: Fee[];
  sentAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  acceptedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail?: string | null;
  companyName: string | null;
  dealTitle: string | null;
}

export interface LineItem {
  id: string;
  description: string;
  details: string;
  quantity: number;
  unitPrice: number;
  optional: boolean;
}

export interface Fee {
  id: string;
  label: string;
  type: 'flat' | 'percent';
  amount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const proposalStatusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-500',
};

export function computeValue(lineItems: LineItem[], fees: Fee[]): number {
  const items = normalizeLineItems(lineItems);
  const feeList = Array.isArray(fees) ? fees : [];
  const subtotal = sumLineItems(items.filter(li => !li.optional));
  const feesTotal = feeList.reduce((sum, f) => {
    if (f.type === 'flat') return sum + (f.amount || 0);
    if (f.type === 'percent') return sum + Math.round(subtotal * (f.amount || 0) / 100);
    return sum;
  }, 0);
  return subtotal + feesTotal;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ProposalsListBodyProps {
  proposalsLoading: boolean;
  proposals: Proposal[];
  onOpen: (id: number) => void;
  onDuplicate: (p: Proposal) => void;
  onOpenSendDialog: (id: number) => void;
}

export default function ProposalsListBody({ proposalsLoading, proposals, onOpen, onDuplicate, onOpenSendDialog }: ProposalsListBodyProps) {
  return (
    <>
      {proposalsLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <span className="material-icons animate-spin mr-2">progress_activity</span>
          Loading proposals...
        </div>
      ) : proposals.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="material-icons text-4xl mb-2 block">description</span>
          <p>No proposals yet. Create your first proposal to get started.</p>
        </div>
      ) : (
        <div className={`${pCard} overflow-hidden`}>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-accent/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Value</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sent</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Viewed</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map(p => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onOpen(p.id)}
                        className="text-foreground font-medium hover:text-primary transition-colors text-left"
                      >
                        {p.title}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.contactFirstName ? `${p.contactFirstName} ${p.contactLastName ?? ''}`.trim() : '-'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.companyName ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {formatMoney(computeValue(p.lineItems, p.fees))}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${proposalStatusColor[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {p.sentAt ? new Date(p.sentAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {p.lastViewedAt ? (
                        <span>
                          {new Date(p.lastViewedAt).toLocaleDateString()}
                          {p.viewCount > 0 && (
                            <span className="ml-1 text-muted-foreground">({p.viewCount}x)</span>
                          )}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onOpen(p.id)}
                          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit"
                        >
                          <span className="material-icons text-base">edit</span>
                        </button>
                        {(p.status === 'draft' || p.status === 'sent') && (
                          <button
                            onClick={() => onOpenSendDialog(p.id)}
                            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-blue-600 transition-colors"
                            title="Send"
                          >
                            <span className="material-icons text-base">send</span>
                          </button>
                        )}
                        <button
                          onClick={() => onDuplicate(p)}
                          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          title="Duplicate"
                        >
                          <span className="material-icons text-base">content_copy</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
