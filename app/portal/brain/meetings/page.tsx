'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';

interface BrainMeetingRow {
  id: number;
  title: string;
  meetingDate: string | null;
  status: 'draft' | 'processing' | 'needs_review' | 'approved';
  source: string;
  createdAt: string;
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
      const r = await fetch('/api/portal/brain/meetings');
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="material-icons text-primary">forum</span>
            Communications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Capture meeting transcripts, emails, and notes. AI extracts decisions, commitments, and tasks for your review.
          </p>
        </div>
        <Link
          href="/portal/brain/meetings/new"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <span className="material-icons text-base">add</span>
          New note
        </Link>
      </div>

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
        <div className="text-center py-12 bg-card border border-border rounded-lg">
          <span className="material-icons text-4xl text-muted-foreground mb-2 block">forum</span>
          <p className="text-foreground text-sm font-medium">No notes yet.</p>
          <p className="text-muted-foreground text-xs mt-1 mb-4">
            Paste your first transcript to see how Brain turns it into reviewable next steps.
          </p>
          <Link
            href="/portal/brain/meetings/new"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span className="material-icons text-base">add</span>
            New meeting
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {meetings.map((m) => {
            const status = STATUS_LABELS[m.status];
            const date = m.meetingDate ? new Date(m.meetingDate) : new Date(m.createdAt);
            return (
              <Link
                key={m.id}
                href={`/portal/brain/meetings/${m.id}`}
                className="flex items-center gap-3 p-4 hover:bg-accent/50 transition-colors"
              >
                <span className="material-icons text-muted-foreground">forum</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{m.title}</div>
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
