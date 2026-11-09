'use client';

// Extracted verbatim from app/portal/crm/contracts/page.tsx (PUX-173) — the page is pinned at its current size; the Proposals & contracts room mounts this body under the flag.

import { pBtnPrimary, pBtnGhost, pCard } from '@/components/portal/portal-ui';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Contract {
  id: number;
  title: string;
  summary: string | null;
  status: string;
  dealId: number | null;
  contactId: number | null;
  companyId: number | null;
  validUntil: string | null;
  sentAt: string | null;
  fullyExecutedAt: string | null;
  createdAt: string;
  contactName: string | null;
  companyName: string | null;
  dealTitle: string | null;
  signers: { total: number; signed: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Real crm_contracts.status enum (lib/db/schema/crm.ts:251):
// 'draft' | 'sent' | 'partially_signed' | 'fully_executed' | 'voided' | 'expired'.
// NOTE: 'signed' / 'executed' are NOT values of this column — those strings only
// appear on the per-signer status (crm_contract_signers.status / esign_status),
// which is a different field. Using them here previously made the "Signed" stat
// and status-filter pill unmatchable against real data (QAD-011).
const STATUS_COLOR: Record<string, string> = {
  draft:            'bg-muted text-muted-foreground',
  sent:              'bg-blue-100 text-blue-700',
  partially_signed:  'bg-amber-100 text-amber-700',
  fully_executed:    'bg-green-100 text-green-700',
  voided:            'bg-red-100 text-red-700',
  expired:           'bg-muted text-muted-foreground',
};

const STATUS_ICON: Record<string, string> = {
  draft:            'edit_note',
  sent:              'send',
  partially_signed:  'pending',
  fully_executed:    'check_circle',
  voided:            'cancel',
  expired:           'schedule',
};

// Humanized labels so the raw snake_case enum never leaks into the UI unformatted.
export const STATUS_LABELS: Record<string, string> = {
  draft:            'Draft',
  sent:              'Sent',
  partially_signed:  'Partially Signed',
  fully_executed:    'Fully Executed',
  voided:            'Voided',
  expired:           'Expired',
};

export function humanizeStatus(status: string): string {
  return STATUS_LABELS[status]
    ?? status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? 'bg-muted text-muted-foreground';
  const icon  = STATUS_ICON[status] ?? 'article';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      <span className="material-icons text-[11px]">{icon}</span>
      {humanizeStatus(status)}
    </span>
  );
}

function SignersBadge({ signers }: { signers: { total: number; signed: number } }) {
  if (signers.total === 0) return <span className="text-muted-foreground text-xs">—</span>;
  const allSigned = signers.signed === signers.total;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${allSigned ? 'text-green-600' : 'text-muted-foreground'}`}>
      <span className="material-icons text-sm">{allSigned ? 'how_to_reg' : 'pending'}</span>
      {signers.signed}/{signers.total}
    </span>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ContractsListBodyProps {
  loading: boolean;
  contracts: Contract[];
  search: string;
  statusFilter: string;
  onCreateFirst: () => void;
  onResetFilters: () => void;
  onOpen: (id: number) => void;
}

export default function ContractsListBody({ loading, contracts, search, statusFilter, onCreateFirst, onResetFilters, onOpen }: ContractsListBodyProps) {
  return (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <span className="material-icons animate-spin mr-2">progress_activity</span>
          Loading contracts...
        </div>
      ) : contracts.length === 0 && !search && !statusFilter ? (
        /* Pristine empty state */
        <div className={`${pCard} p-10 text-center space-y-4`}>
          <span className="material-icons text-5xl text-muted-foreground/40">article</span>
          <h2 className="text-lg font-semibold text-foreground">No contracts yet</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Create your first contract to start collecting e-signatures from clients.
            You can add clauses, link a deal, and send for signing — all in one place.
          </p>
          <button
            onClick={() => onCreateFirst()}
            className={pBtnPrimary}
          >
            <span className="material-icons text-lg">add</span>
            Create Your First Contract
          </button>
        </div>
      ) : contracts.length === 0 ? (
        /* Filtered empty state */
        <div className={`${pCard} p-10 text-center space-y-3`}>
          <span className="material-icons text-4xl text-muted-foreground/40">search_off</span>
          <h2 className="text-base font-semibold text-foreground">No contracts match your filters</h2>
          <p className="text-muted-foreground text-sm">
            {search && <>No contracts contain &ldquo;<span className="font-medium">{search}</span>&rdquo;. </>}
            {statusFilter && <>No <span className="font-medium">{humanizeStatus(statusFilter).toLowerCase()}</span> contracts. </>}
            Adjust your search or status filter above.
          </p>
          <button
            onClick={() => onResetFilters()}
            className={pBtnGhost}
          >
            <span className="material-icons text-sm">refresh</span>
            Reset filters
          </button>
        </div>
      ) : (
        <div className={`${pCard} overflow-hidden`}>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-border bg-accent/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Deal</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Signers</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map(c => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onOpen(c.id)}
                        className="text-foreground font-medium hover:text-primary transition-colors text-left"
                      >
                        {c.title}
                      </button>
                      {c.summary && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.summary}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.contactName?.trim() || '-'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.dealTitle ?? '-'}
                    </td>
                    <td className="px-4 py-3">
                      <SignersBadge signers={c.signers} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onOpen(c.id)}
                          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          title="Open contract"
                        >
                          <span className="material-icons text-base">open_in_new</span>
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
