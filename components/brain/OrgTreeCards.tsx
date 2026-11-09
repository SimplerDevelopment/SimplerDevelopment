'use client';

/**
 * PUX-163 (design doc screen 22): the org tree drawn top-down as nested cards,
 * read-only, beside the People roster. Editing (lead picker, drag, rename,
 * merge) stays on /portal/brain/org-chart — OrgUnitTree.tsx renders its row
 * menu whether or not handlers are wired, so this is a separate small renderer
 * rather than a read-only prop on that component. Studio-only: the caller
 * gates on useFeatureFlag('portal-redesign'); GhostCard fails closed anyway.
 */

import Link from 'next/link';
import type { BrainOrgUnitTreeNode } from '@/lib/brain/org-units';
import { GhostCard } from '@/components/portal/EmptyState';
import { initialsOf } from '@/components/brain/PersonCard';

interface Props {
  tree: BrainOrgUnitTreeNode[];
  /** personId → full name for leads the caller can resolve; an unresolved lead shows the member count only. */
  leadNames: ReadonlyMap<number, string>;
  className?: string;
}

function UnitCard({ node, leadNames }: { node: BrainOrgUnitTreeNode; leadNames: ReadonlyMap<number, string> }) {
  const lead = node.leadPersonId != null ? leadNames.get(node.leadPersonId) : undefined;
  const members = `${node.memberCount} ${node.memberCount === 1 ? 'member' : 'members'}`;
  return (
    <li>
      {node.leadPersonId == null ? (
        // An empty unit is a preview, not a blank row — the ghost links to where the lead gets set.
        <GhostCard icon="group_add" title={node.name} body="No lead set" href="/portal/brain/org-chart" />
      ) : (
        <Link
          href={`/portal/brain/people?orgUnitId=${node.id}`}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-2.5 transition-colors hover:border-[var(--studio-line-strong)]"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
            {initialsOf(lead ?? node.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{node.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{lead ? `${lead} · ${node.memberCount}` : members}</span>
          </span>
        </Link>
      )}
      {node.children.length > 0 && (
        <ul className="ml-4 mt-2 space-y-2 border-l border-border pl-3">
          {node.children.map((c) => <UnitCard key={c.id} node={c} leadNames={leadNames} />)}
        </ul>
      )}
    </li>
  );
}

export default function OrgTreeCards({ tree, leadNames, className = '' }: Props) {
  return (
    <aside className={className} aria-label="Org chart">
      <h2 className="mb-2 flex items-center gap-1.5 font-display text-sm font-semibold text-foreground">
        <span className="material-icons text-base text-muted-foreground">account_tree</span>
        Org chart
        <Link href="/portal/brain/org-chart" className="ml-auto text-xs font-normal text-muted-foreground hover:text-foreground">Edit</Link>
      </h2>
      {tree.length === 0 ? (
        <GhostCard icon="account_tree" title="No org units yet" body="Shape the team on the org chart." href="/portal/brain/org-chart" />
      ) : (
        <ul className="space-y-2">
          {tree.map((n) => <UnitCard key={n.id} node={n} leadNames={leadNames} />)}
        </ul>
      )}
    </aside>
  );
}
