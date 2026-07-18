'use client';

/**
 * DocumentComplianceCard — partition summary of who's read this doc.
 *
 * Initially renders just the totals (assigned / acknowledged / pending /
 * overdue). Clicking expands to the full report — lists of pending + overdue
 * people, resolved to display names via a single batched name lookup.
 *
 * The parent passes the raw ComplianceReport (already fetched). We do an
 * optional secondary fetch to resolve person ids → names when the user
 * expands, so the unexpanded card stays cheap.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ComplianceReport } from '@/lib/brain/document-acks';

interface Props {
  report: ComplianceReport;
}

interface PersonRef {
  id: number;
  fullName: string;
  title: string | null;
}

export default function DocumentComplianceCard({ report }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [people, setPeople] = useState<Record<number, PersonRef>>({});
  const [loadingPeople, setLoadingPeople] = useState(false);

  const { summary, pendingPersonIds, overduePersonIds } = report;

  // Resolve person names lazily on first expand.
  const resolvePeople = useCallback(async (ids: number[]) => {
    setLoadingPeople(true);
    try {
      const out: Record<number, PersonRef> = {};
      // Use bulk list endpoint with a generous limit. Filter client-side.
      const r = await fetch('/api/portal/brain/people?limit=200');
      const json = await r.json();
      if (r.ok && json.success) {
        const items = (json.data?.items ?? []) as PersonRef[];
        const idSet = new Set(ids);
        for (const p of items) {
          if (idSet.has(p.id)) out[p.id] = p;
        }
      }
      setPeople((prev) => ({ ...prev, ...out }));
    } finally {
      setLoadingPeople(false);
    }
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const want = [...pendingPersonIds, ...overduePersonIds];
    const missing = want.filter((id) => !(id in people));
    if (missing.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resolvePeople defers setState into async IIFE; trigger fires once on expand
    resolvePeople(missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-run on expand
  }, [expanded]);

  const renderPersonName = (id: number) => people[id]?.fullName ?? `Person #${id}`;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <span className="material-icons text-base text-primary">verified</span>
          <h3 className="text-base font-semibold text-foreground">Compliance</h3>
        </div>
        <span className="material-icons text-muted-foreground">
          {expanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        <Stat label="Assigned" value={summary.totalAssigned} tone="default" icon="groups" />
        <Stat label="Acknowledged" value={summary.acknowledged} tone="emerald" icon="check_circle" />
        <Stat label="Pending" value={summary.pending} tone="amber" icon="schedule" />
        <Stat label="Overdue" value={summary.overdue} tone="red" icon="warning" />
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {loadingPeople && (
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <span className="material-icons animate-spin text-sm">progress_activity</span>
              Loading names…
            </div>
          )}

          <section>
            <h4 className="text-[11px] uppercase font-semibold tracking-wide text-red-600 dark:text-red-400 mb-1.5 inline-flex items-center gap-1">
              <span className="material-icons text-[14px]">warning</span>
              Overdue ({overduePersonIds.length})
            </h4>
            {overduePersonIds.length === 0 ? (
              <p className="text-xs text-muted-foreground">No one is overdue.</p>
            ) : (
              <ul className="space-y-1">
                {overduePersonIds.map((id) => (
                  <li key={`o-${id}`} className="text-xs text-foreground flex items-center gap-1.5">
                    <span className="material-icons text-[12px] text-red-500">person</span>
                    {renderPersonName(id)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="text-[11px] uppercase font-semibold tracking-wide text-amber-600 dark:text-amber-400 mb-1.5 inline-flex items-center gap-1">
              <span className="material-icons text-[14px]">schedule</span>
              Pending ({pendingPersonIds.length})
            </h4>
            {pendingPersonIds.length === 0 ? (
              <p className="text-xs text-muted-foreground">No one is pending.</p>
            ) : (
              <ul className="space-y-1">
                {pendingPersonIds.map((id) => (
                  <li key={`p-${id}`} className="text-xs text-foreground flex items-center gap-1.5">
                    <span className="material-icons text-[12px] text-amber-500">person</span>
                    {renderPersonName(id)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: 'default' | 'emerald' | 'amber' | 'red';
  icon: string;
}) {
  const toneClasses = {
    default: 'text-foreground',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    amber: 'text-amber-700 dark:text-amber-300',
    red: 'text-red-700 dark:text-red-300',
  }[tone];
  return (
    <div className="bg-muted/30 border border-border rounded-md p-2">
      <div className="text-[10px] uppercase font-medium tracking-wide text-muted-foreground inline-flex items-center gap-1">
        <span className="material-icons text-[12px]">{icon}</span>
        {label}
      </div>
      <div className={`text-xl font-bold ${toneClasses}`}>{value}</div>
    </div>
  );
}
