'use client';

// The seven Search tab report sections — grouped here (rather than inline in
// SearchPerformanceTab.tsx) purely to keep that file's line count down; no
// state or fetching lives here, just presentation over reports the parent
// already fetched. Each section is an independent collapsible (unlike
// IssuesTab's single-open accordion — these are distinct report types, not
// mutually exclusive groups of the same thing), and an empty section renders
// as a flat, non-interactive "nothing here" row instead of a pointless
// expand/collapse control.

import { useState } from 'react';
import { pCard } from '@/components/portal/portal-ui';
import { deltaClasses, deltaTone, formatPct, formatPosition, formatSignedNumber } from './format';
import type { PageDelta, QueryDelta, QueryStat, SearchPerformanceReports as Reports } from './types';

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-3 py-2 font-medium text-muted-foreground whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 font-mono whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      {children}
    </td>
  );
}

function QueryStatTable({ rows }: { rows: QueryStat[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border">
        <tr>
          <Th>Query</Th>
          <Th align="right">Clicks</Th>
          <Th align="right">Impressions</Th>
          <Th align="right">CTR</Th>
          <Th align="right">Position</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.query}-${i}`} className="border-b border-border last:border-0 hover:bg-accent/30">
            <td className="px-3 py-2 max-w-xs truncate text-foreground font-normal" title={r.query}>
              {r.query}
            </td>
            <Td align="right" className="text-muted-foreground">
              {r.clicks.toLocaleString()}
            </Td>
            <Td align="right" className="text-muted-foreground">
              {r.impressions.toLocaleString()}
            </Td>
            <Td align="right" className="text-muted-foreground">
              {formatPct(r.ctr)}
            </Td>
            <Td align="right" className="text-muted-foreground">
              {formatPosition(r.position)}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QueryDeltaTable({ rows }: { rows: QueryDelta[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border">
        <tr>
          <Th>Query</Th>
          <Th align="right">Clicks</Th>
          <Th align="right">Δ Clicks</Th>
          <Th align="right">Prev clicks</Th>
          <Th align="right">Position</Th>
          <Th align="right">Prev position</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.query}-${i}`} className="border-b border-border last:border-0 hover:bg-accent/30">
            <td className="px-3 py-2 max-w-xs truncate text-foreground font-normal" title={r.query}>
              {r.query}
            </td>
            <Td align="right" className="text-muted-foreground">
              {r.clicks.toLocaleString()}
            </Td>
            <Td align="right" className={deltaClasses[deltaTone(r.deltaClicks)]}>
              {formatSignedNumber(r.deltaClicks)}
            </Td>
            <Td align="right" className="text-muted-foreground">
              {r.prevClicks.toLocaleString()}
            </Td>
            <Td align="right" className="text-muted-foreground">
              {formatPosition(r.position)}
            </Td>
            <Td align="right" className="text-muted-foreground">
              {formatPosition(r.prevPosition)}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PageDecayTable({ rows }: { rows: PageDelta[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border">
        <tr>
          <Th>Page</Th>
          <Th align="right">Clicks</Th>
          <Th align="right">Prev clicks</Th>
          <Th align="right">Δ Clicks</Th>
          <Th align="right">Decline</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.page}-${i}`} className="border-b border-border last:border-0 hover:bg-accent/30">
            <td className="px-3 py-2 max-w-xs truncate text-foreground font-normal" title={r.page}>
              {r.page}
            </td>
            <Td align="right" className="text-muted-foreground">
              {r.clicks.toLocaleString()}
            </Td>
            <Td align="right" className="text-muted-foreground">
              {r.prevClicks.toLocaleString()}
            </Td>
            <Td align="right" className={deltaClasses[deltaTone(r.deltaClicks)]}>
              {formatSignedNumber(r.deltaClicks)}
            </Td>
            <Td align="right" className="text-red-600 dark:text-red-400">
              -{r.declinePct.toFixed(1)}%
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportSection({
  id,
  icon,
  title,
  count,
  countLabel,
  open,
  onToggle,
  children,
}: {
  id: string;
  icon: string;
  title: string;
  count: number;
  countLabel: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  if (count === 0) {
    return (
      <div className={`${pCard} p-4 flex items-center gap-3`}>
        <span className="material-icons text-muted-foreground/50 text-lg shrink-0">{icon}</span>
        <span className="flex-1 min-w-0 font-medium text-sm text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground shrink-0">Nothing here</span>
      </div>
    );
  }

  return (
    <div className={pCard}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/50 transition-colors rounded-2xl"
        aria-expanded={open}
      >
        <span className="material-icons text-muted-foreground text-lg shrink-0">{icon}</span>
        <span className="flex-1 min-w-0 font-medium text-sm text-foreground truncate">{title}</span>
        <span className="text-xs text-muted-foreground shrink-0">{countLabel}</span>
        <span className="material-icons text-muted-foreground shrink-0">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && <div className="px-4 pb-4 border-t border-border pt-3 overflow-x-auto">{children}</div>}
    </div>
  );
}

export function SearchPerformanceReportsView({ reports }: { reports: Reports }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sections: { id: string; icon: string; title: string; count: number; unit: string; node: React.ReactNode }[] = [
    {
      id: 'ctrOpportunities',
      icon: 'ads_click',
      title: 'CTR opportunities',
      count: reports.ctrOpportunities.length,
      unit: 'query',
      node: <QueryStatTable rows={reports.ctrOpportunities} />,
    },
    {
      id: 'strikingDistance',
      icon: 'my_location',
      title: 'Striking distance',
      count: reports.strikingDistance.length,
      unit: 'query',
      node: <QueryStatTable rows={reports.strikingDistance} />,
    },
    {
      id: 'winners',
      icon: 'trending_up',
      title: 'Winners',
      count: reports.winners.length,
      unit: 'query',
      node: <QueryDeltaTable rows={reports.winners} />,
    },
    {
      id: 'losers',
      icon: 'trending_down',
      title: 'Losers',
      count: reports.losers.length,
      unit: 'query',
      node: <QueryDeltaTable rows={reports.losers} />,
    },
    {
      id: 'pageDecay',
      icon: 'south',
      title: 'Page decay',
      count: reports.pageDecay.length,
      unit: 'page',
      node: <PageDecayTable rows={reports.pageDecay} />,
    },
    {
      id: 'newQueries',
      icon: 'fiber_new',
      title: 'New queries',
      count: reports.newQueries.length,
      unit: 'query',
      node: <QueryStatTable rows={reports.newQueries} />,
    },
    {
      id: 'lostQueries',
      icon: 'remove_circle_outline',
      title: 'Lost queries',
      count: reports.lostQueries.length,
      unit: 'query',
      node: <QueryStatTable rows={reports.lostQueries} />,
    },
  ];

  return (
    <div className="space-y-3">
      {sections.map((s) => (
        <ReportSection
          key={s.id}
          id={s.id}
          icon={s.icon}
          title={s.title}
          count={s.count}
          countLabel={`${s.count} ${s.count === 1 ? s.unit : `${s.unit}s`}`}
          open={open.has(s.id)}
          onToggle={toggle}
        >
          {s.node}
        </ReportSection>
      ))}
    </div>
  );
}
