'use client';

// Client wrapper around the /portal/experiments table. The page is a server
// component so it can do the SSR data fetch, but filter state needs to live
// somewhere reactive — that's this component. Filters are intentionally
// client-side (no query params) so toggling pills doesn't trigger a server
// roundtrip; the list size is bounded per tenant so client-side filtering
// stays cheap.

import { useMemo, useState } from 'react';
import Link from 'next/link';

const STATUS_ICONS: Record<string, string> = {
  draft: 'edit',
  running: 'play_circle',
  completed: 'task_alt',
  archived: 'inventory_2',
};

const TARGET_LABEL: Record<string, { icon: string; label: string }> = {
  post: { icon: 'web', label: 'Page' },
  deck: { icon: 'slideshow', label: 'Pitch deck' },
  survey: { icon: 'poll', label: 'Survey' },
  email: { icon: 'mail', label: 'Email' },
};

export interface ExperimentRow {
  id: number;
  name: string;
  status: string;
  goalMetric: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  targetType: string;
  targetId: number;
  targetTitle: string;
  targetEditHref: string | null;
  targetSubLabel: string | null;
}

type StatusFilter = 'all' | 'running' | 'draft' | 'completed' | 'archived';
type TargetFilter = 'all' | 'post' | 'deck';

const STATUS_OPTIONS: ReadonlyArray<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running' },
  { key: 'draft', label: 'Draft' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived', label: 'Archived' },
];

const TARGET_OPTIONS: ReadonlyArray<{ key: TargetFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'post', label: 'Pages' },
  { key: 'deck', label: 'Pitch decks' },
];

export default function ExperimentsTable({ experiments }: { experiments: ExperimentRow[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [targetFilter, setTargetFilter] = useState<TargetFilter>('all');

  const statusCounts = useMemo<Record<StatusFilter, number>>(() => {
    const counts: Record<StatusFilter, number> = { all: experiments.length, running: 0, draft: 0, completed: 0, archived: 0 };
    for (const e of experiments) {
      if (e.status === 'running' || e.status === 'draft' || e.status === 'completed' || e.status === 'archived') {
        counts[e.status] += 1;
      }
    }
    return counts;
  }, [experiments]);

  const targetCounts = useMemo<Record<TargetFilter, number>>(() => {
    const counts: Record<TargetFilter, number> = { all: experiments.length, post: 0, deck: 0 };
    for (const e of experiments) {
      if (e.targetType === 'post' || e.targetType === 'deck') counts[e.targetType] += 1;
    }
    return counts;
  }, [experiments]);

  const filtered = useMemo(() => {
    return experiments.filter(e => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (targetFilter !== 'all' && e.targetType !== targetFilter) return false;
      return true;
    });
  }, [experiments, statusFilter, targetFilter]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setStatusFilter(opt.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === opt.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {opt.label}
              <span className={`ml-1.5 text-[10px] ${statusFilter === opt.key ? 'opacity-80' : 'opacity-60'}`}>
                {statusCounts[opt.key]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
          {TARGET_OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setTargetFilter(opt.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                targetFilter === opt.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {opt.label}
              <span className={`ml-1.5 text-[10px] ${targetFilter === opt.key ? 'opacity-80' : 'opacity-60'}`}>
                {targetCounts[opt.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-8 py-12 text-center">
          <span className="material-icons text-4xl text-gray-400 mb-2">filter_alt_off</span>
          <h2 className="text-base font-medium mb-1">No experiments match these filters</h2>
          <p className="text-sm text-gray-500">
            Try clearing the status or target filter to see all {experiments.length} experiment{experiments.length === 1 ? '' : 's'}.
          </p>
          <button
            type="button"
            onClick={() => { setStatusFilter('all'); setTargetFilter('all'); }}
            className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-md text-xs font-medium border border-gray-300 hover:bg-gray-50"
          >
            <span className="material-icons text-sm">refresh</span>
            Reset filters
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Experiment</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Goal</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(exp => {
                const meta = TARGET_LABEL[exp.targetType] ?? { icon: 'help', label: exp.targetType };
                return (
                  <tr key={exp.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{exp.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-700">
                        <span className="material-icons text-base">{meta.icon}</span>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {exp.targetEditHref ? (
                        <Link href={exp.targetEditHref} className="text-blue-600 hover:underline">
                          {exp.targetTitle}
                        </Link>
                      ) : (
                        <span>{exp.targetTitle}</span>
                      )}
                      {exp.targetSubLabel ? (
                        <div className="text-xs text-gray-400">{exp.targetSubLabel}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-700">
                        <span className="material-icons text-base">flag</span>
                        {exp.goalMetric}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <span className="material-icons text-base">{STATUS_ICONS[exp.status] || 'help'}</span>
                        {exp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {exp.startedAt ? new Date(exp.startedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/portal/experiments/${exp.id}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
