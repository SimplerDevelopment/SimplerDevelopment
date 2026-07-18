'use client';

/**
 * DecisionSupersedeChain — vertical timeline showing a decision's supersede
 * history. Ancestors (older revisions this decision replaces) sit above the
 * current row; descendants (newer revisions that replaced this decision) sit
 * below. Clicking any non-current row navigates to that decision's detail
 * page.
 *
 * `ancestors` ordering matches lib/brain/decisions.ts:DecisionWithChain —
 * oldest → newest, ending with the immediate predecessor. We render them
 * top-down without re-sorting so the visual order matches "time flows down".
 *
 * `descendants` ordering also matches the lib helper — successor chain, head
 * (immediate replacement) first. We render them in array order below the
 * current row.
 */
import Link from 'next/link';
import type { BrainDecisionStatus } from '@/lib/db/schema';
import { relativeDate } from './DecisionCard';

export interface ChainNode {
  id: number;
  title: string;
  decidedAt: string | Date;
  status: BrainDecisionStatus;
}

export interface DecisionSupersedeChainProps {
  ancestors: ChainNode[];
  current: { id: number; title: string; decidedAt: string | Date; status: BrainDecisionStatus };
  descendants: ChainNode[];
}

const STATUS_DOT: Record<BrainDecisionStatus, string> = {
  accepted: 'bg-emerald-500',
  proposed: 'bg-sky-500',
  superseded: 'bg-amber-500',
  rejected: 'bg-rose-500',
};

const STATUS_LABEL: Record<BrainDecisionStatus, string> = {
  accepted: 'Accepted',
  proposed: 'Proposed',
  superseded: 'Superseded',
  rejected: 'Rejected',
};

function Row({
  node,
  highlighted,
  href,
}: {
  node: ChainNode;
  highlighted?: boolean;
  href?: string;
}) {
  const inner = (
    <div
      className={`flex items-start gap-3 py-2 pl-4 pr-3 rounded-md transition-colors ${
        highlighted
          ? 'bg-primary/10 border border-primary/30'
          : 'border border-transparent hover:bg-muted/40 hover:border-border'
      }`}
    >
      <span
        className={`mt-1.5 inline-block h-2.5 w-2.5 rounded-full shrink-0 ${STATUS_DOT[node.status]}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className={`text-sm truncate ${highlighted ? 'font-semibold text-foreground' : 'text-foreground'}`}>
          {node.title}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
          <span>{STATUS_LABEL[node.status]}</span>
          <span aria-hidden>·</span>
          <span>{relativeDate(node.decidedAt)}</span>
        </div>
      </div>
      {highlighted && (
        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary text-primary-foreground">
          current
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

export default function DecisionSupersedeChain({
  ancestors,
  current,
  descendants,
}: DecisionSupersedeChainProps) {
  if (ancestors.length === 0 && descendants.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">
        This decision is the only entry in its chain — no predecessors or successors.
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical timeline rail */}
      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" aria-hidden />
      <ol className="space-y-1 relative">
        {ancestors.map((node) => (
          <li key={`a-${node.id}`}>
            <Row node={node} href={`/portal/brain/decisions/${node.id}`} />
          </li>
        ))}
        <li key={`c-${current.id}`}>
          <Row node={current} highlighted />
        </li>
        {descendants.map((node) => (
          <li key={`d-${node.id}`}>
            <Row node={node} href={`/portal/brain/decisions/${node.id}`} />
          </li>
        ))}
      </ol>
    </div>
  );
}
