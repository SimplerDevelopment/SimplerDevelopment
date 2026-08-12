'use client';

// Search tab — Google Search Console data for the project. Unlike the
// Issues/Pages tabs (which key off a crawl run and happily refetch every
// time the tab mounts), this data is project-level and its own fetch is
// comparatively expensive, so the dashboard shell owns the fetched result
// (`data`/`onDataChange`) and only the first tab-open triggers a request —
// see the `data === null` guard below. Reopening the tab after that renders
// straight from the cached prop; only an explicit "Import now" forces a
// refetch.

import { useCallback, useEffect, useState } from 'react';
import { pBtnGhost, pBtnPrimary, pCard, pCardPad } from '@/components/portal/portal-ui';
import { formatPct, formatPosition } from './format';
import { SearchPerformanceChart } from './SearchPerformanceChart';
import { SearchPerformanceReportsView } from './SearchPerformanceReports';
import type { GscImportResult, SearchPerformanceData } from './types';

interface Props {
  projectId: number;
  data: SearchPerformanceData | null;
  onDataChange: (data: SearchPerformanceData) => void;
}

// GscImportResult['skipped'] is a terse enum from lib/seo/gsc.ts, not
// user-facing copy — map it before it hits the screen.
const SKIP_MESSAGES: Record<string, string> = {
  'not-linked': "This project isn't linked to a hosted website, so it can't import from Search Console.",
  'not-connected': "Google isn't connected for this project's hosted website yet.",
  'up-to-date': 'Already up to date — nothing new to import.',
};

export function SearchPerformanceTab({ projectId, data, onDataChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importNote, setImportNote] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/seo/projects/${projectId}/search-performance`);
      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'Failed to load Search Console data.');
        return;
      }
      onDataChange(json.data);
    } catch {
      setError('Network error loading Search Console data.');
    } finally {
      setLoading(false);
    }
  }, [projectId, onDataChange]);

  // Lazy-fetch: only runs while `data` is still null, i.e. the first time
  // this tab is opened. Once the parent has cached a result, remounting on a
  // later tab switch sees a non-null `data` prop and skips the request.
  useEffect(() => {
    if (data === null) fetchData();
  }, [data, fetchData]);

  async function importNow() {
    setImporting(true);
    setImportError('');
    setImportNote('');
    try {
      const res = await fetch(`/api/portal/seo/projects/${projectId}/gsc-import`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setImportError(json.message || 'Failed to import Search Console data.');
        return;
      }
      const result = json.data as GscImportResult;
      if ('skipped' in result) {
        setImportNote(SKIP_MESSAGES[result.skipped] ?? result.skipped);
      } else {
        const { queries, pages } = result.imported;
        setImportNote(
          `Imported ${queries.toLocaleString()} ${queries === 1 ? 'query' : 'queries'} across ${pages.toLocaleString()} ${pages === 1 ? 'page' : 'pages'}.`,
        );
      }
      await fetchData();
    } catch {
      setImportError('Network error starting import.');
    } finally {
      setImporting(false);
    }
  }

  if (data === null) {
    if (error) return <p className="text-sm text-destructive">{error}</p>;
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin text-2xl">progress_activity</span>
      </div>
    );
  }

  if (!data.connected) {
    return (
      <div className={`${pCard} p-10 text-center max-w-xl mx-auto`}>
        <span className="material-icons text-4xl text-muted-foreground/50 mb-2">link_off</span>
        <p className="text-sm text-muted-foreground">
          Search Console insights need this project linked to a hosted website with Google connected, under
          Website settings → Google → Search Console. Projects tracking an external domain that isn&apos;t hosted here
          can&apos;t make that connection today.
        </p>
      </div>
    );
  }

  if (!data.lastDate) {
    return (
      <div className={`${pCard} p-10 text-center max-w-xl mx-auto space-y-4`}>
        <div>
          <span className="material-icons text-4xl text-muted-foreground/50 mb-2">query_stats</span>
          <p className="text-sm text-muted-foreground">
            This project is connected to Search Console{data.siteUrl ? ` (${data.siteUrl})` : ''}, but no data has
            been imported yet.
          </p>
        </div>
        <button type="button" onClick={importNow} disabled={importing} className={`${pBtnPrimary} mx-auto`}>
          {importing ? (
            <>
              <span className="material-icons text-base animate-spin">progress_activity</span>
              Importing…
            </>
          ) : (
            <>
              <span className="material-icons text-base">sync</span>
              Import now
            </>
          )}
        </button>
        {importError && <p className="text-xs text-destructive">{importError}</p>}
        {!importError && importNote && <p className="text-xs text-muted-foreground">{importNote}</p>}
      </div>
    );
  }

  const { overview, reports } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-mono text-muted-foreground truncate" title={data.siteUrl ?? undefined}>
            {data.siteUrl}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Data through {data.lastDate}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button type="button" onClick={importNow} disabled={importing || loading} className={pBtnGhost}>
            {importing ? (
              <>
                <span className="material-icons text-base animate-spin">progress_activity</span>
                Importing…
              </>
            ) : (
              <>
                <span className="material-icons text-base">sync</span>
                Import now
              </>
            )}
          </button>
          {importError && <p className="text-xs text-destructive">{importError}</p>}
          {!importError && importNote && <p className="text-xs text-muted-foreground">{importNote}</p>}
        </div>
      </div>

      {overview && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className={pCardPad}>
              <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">
                {overview.totals.clicks.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Clicks</p>
            </div>
            <div className={pCardPad}>
              <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">
                {overview.totals.impressions.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Impressions</p>
            </div>
            <div className={pCardPad}>
              <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">
                {formatPct(overview.totals.avgCtr)}
              </p>
              <p className="text-xs text-muted-foreground">Avg CTR</p>
            </div>
            <div className={pCardPad}>
              <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">
                {formatPosition(overview.totals.avgPosition)}
              </p>
              <p className="text-xs text-muted-foreground">Avg position</p>
            </div>
          </div>

          {overview.series.length > 0 && (
            <div className={pCardPad}>
              <SearchPerformanceChart series={overview.series} />
            </div>
          )}
        </>
      )}

      {reports && <SearchPerformanceReportsView reports={reports} />}
    </div>
  );
}
