'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary } from '@/components/portal/portal-ui';

interface BrainMeetingRow {
  id: number;
  title: string;
  meetingDate: string | null;
  status: 'draft' | 'processing' | 'needs_review' | 'approved';
  source: string;
  createdAt: string;
  sourceMetadata?: { gmailThreadId?: string; senderEmail?: string } | null;
}

/**
 * One row per thread for source='gmail-api' messages, one row per individual
 * meeting for everything else. Within a Gmail thread we keep the LATEST message
 * as the visible row (so the row link goes to the most recent activity); the
 * count badge surfaces the size of the thread.
 */
interface ThreadGroup {
  key: string;            // either gmailThreadId or `single:${id}` for ungrouped rows
  latest: BrainMeetingRow;
  count: number;
}

function groupByThread(meetings: BrainMeetingRow[]): ThreadGroup[] {
  const groups = new Map<string, ThreadGroup>();
  for (const m of meetings) {
    const tid = m.source === 'gmail-api' ? m.sourceMetadata?.gmailThreadId : null;
    const key = tid ? `gmail:${tid}` : `single:${m.id}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { key, latest: m, count: 1 });
      continue;
    }
    existing.count += 1;
    // The list arrives ordered by createdAt DESC, but be defensive: pick the
    // latest by meetingDate || createdAt so reordering at the API level doesn't break us.
    const existingTs = new Date(existing.latest.meetingDate ?? existing.latest.createdAt).getTime();
    const candidateTs = new Date(m.meetingDate ?? m.createdAt).getTime();
    if (candidateTs > existingTs) existing.latest = m;
  }
  return [...groups.values()].sort((a, b) => {
    const at = new Date(a.latest.meetingDate ?? a.latest.createdAt).getTime();
    const bt = new Date(b.latest.meetingDate ?? b.latest.createdAt).getTime();
    return bt - at;
  });
}

const STATUS_LABELS: Record<BrainMeetingRow['status'], { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-muted text-muted-foreground' },
  processing: { label: 'Processing…', tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  needs_review: { label: 'Needs review', tone: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  approved: { label: 'Approved', tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
};

export default function BrainMeetingsPage() {
  const [meetings, setMeetings] = useState<BrainMeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/communications');
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load meetings.');
      } else {
        setMeetings(json.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <PortalPageHeader
        eyebrow="Company Brain"
        title={<span className="flex items-center gap-2"><span className="material-icons text-primary">forum</span>Communications</span>}
        subtitle="Capture communication transcripts, emails, and notes. AI extracts decisions, commitments, and tasks for your review."
        actions={
          <Link href="/portal/brain/communications/new" className={pBtnPrimary}>
            <span className="material-icons text-base">add</span>
            New note
          </Link>
        }
      />

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <span className="material-icons animate-spin mr-2">progress_activity</span>
          Loading…
        </div>
      ) : meetings.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-2xl">
          <span className="material-icons text-4xl text-muted-foreground mb-2 block">forum</span>
          <p className="text-foreground text-sm font-medium">No notes yet.</p>
          <p className="text-muted-foreground text-xs mt-1 mb-4">
            Paste your first transcript to see how Brain turns it into reviewable next steps.
          </p>
          <Link
            href="/portal/brain/communications/new"
            className={pBtnPrimary}
          >
            <span className="material-icons text-base">add</span>
            New communication
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl divide-y divide-border">
          {groupByThread(meetings).map((g) => {
            const m = g.latest;
            const status = STATUS_LABELS[m.status];
            const date = m.meetingDate ? new Date(m.meetingDate) : new Date(m.createdAt);
            const isThread = g.count > 1;
            return (
              <Link
                key={g.key}
                href={`/portal/brain/communications/${m.id}`}
                className="flex items-center gap-3 p-4 hover:bg-accent/50 transition-colors"
              >
                <span className="material-icons text-muted-foreground">
                  {isThread ? 'forum' : 'chat'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate flex items-center gap-2">
                    <span className="truncate">{m.title}</span>
                    {isThread && (
                      <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        {g.count} messages
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    {' · '}
                    via {m.source.replace(/_/g, ' ')}
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.tone}`}>
                  {status.label}
                </span>
                <span className="material-icons text-muted-foreground">chevron_right</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
