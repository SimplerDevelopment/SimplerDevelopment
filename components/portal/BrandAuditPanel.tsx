'use client';

import { useCallback, useState } from 'react';
import type { AuditIssue, AuditReport, AuditSeverity } from '@/lib/branding/audit';

interface Props {
  profileId: number;
}

const SEVERITY_STYLES: Record<AuditSeverity, { bg: string; fg: string; icon: string; label: string }> = {
  error: { bg: 'bg-red-50 border-red-200', fg: 'text-red-700', icon: 'error', label: 'Error' },
  warn: { bg: 'bg-yellow-50 border-yellow-200', fg: 'text-yellow-700', icon: 'warning', label: 'Warning' },
  info: { bg: 'bg-blue-50 border-blue-200', fg: 'text-blue-700', icon: 'info', label: 'Info' },
};

export function BrandAuditPanel({ profileId }: Props) {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/branding/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Audit failed');
      setReport(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Audit failed');
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  return (
    <div className="space-y-3" data-testid="brand-audit-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Brand audit</h4>
          <p className="text-xs text-muted-foreground">Check accessibility, completeness, and consistency.</p>
        </div>
        <button
          type="button"
          onClick={runAudit}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded border border-border bg-background hover:bg-muted disabled:opacity-50 flex items-center gap-1.5"
        >
          <span className="material-icons text-sm">{loading ? 'hourglass_empty' : 'fact_check'}</span>
          {loading ? 'Auditing…' : 'Run audit'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}

      {report && (
        <>
          <AuditSummary counts={report.counts} />
          {report.issues.length === 0 ? (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3 flex items-center gap-2">
              <span className="material-icons text-base">check_circle</span>
              No issues found — profile is in good shape.
            </div>
          ) : (
            <ul className="space-y-2">
              {report.issues.map((issue) => (
                <AuditIssueRow key={issue.id} issue={issue} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function AuditSummary({ counts }: { counts: Record<AuditSeverity, number> }) {
  const items: Array<[AuditSeverity, number]> = [
    ['error', counts.error],
    ['warn', counts.warn],
    ['info', counts.info],
  ];
  return (
    <div className="flex gap-2" data-testid="brand-audit-summary">
      {items.map(([sev, n]) => {
        const s = SEVERITY_STYLES[sev];
        return (
          <div
            key={sev}
            className={`flex-1 px-3 py-2 rounded border text-xs ${s.bg} ${s.fg}`}
            data-severity={sev}
            data-count={n}
          >
            <div className="flex items-center gap-1.5">
              <span className="material-icons text-sm">{s.icon}</span>
              <span className="font-semibold">{n}</span>
              <span className="opacity-80">{s.label}{n === 1 ? '' : 's'}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AuditIssueRow({ issue }: { issue: AuditIssue }) {
  const s = SEVERITY_STYLES[issue.severity];
  return (
    <li
      className={`rounded border p-3 text-sm ${s.bg}`}
      data-issue-id={issue.id}
      data-severity={issue.severity}
    >
      <div className="flex items-start gap-2">
        <span className={`material-icons text-base ${s.fg} flex-shrink-0 mt-0.5`}>{s.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-foreground">{issue.message}</div>
          {issue.suggestion && (
            <div className="text-xs text-muted-foreground mt-1">{issue.suggestion}</div>
          )}
        </div>
        <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${s.fg}`}>
          {issue.category}
        </span>
      </div>
    </li>
  );
}
