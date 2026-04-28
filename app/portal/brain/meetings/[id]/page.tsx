'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';

interface MeetingParticipant {
  id: number;
  name: string;
  email: string | null;
  roleInMeeting: string | null;
}

interface MeetingAttachment {
  key: string;
  filename: string;
  contentType: string;
  size: number;
  /** Filled in after the meeting is processed — short paragraph from Claude
   *  describing what the file is. */
  analysis?: string;
}

interface MeetingLink {
  url: string;
  finalUrl?: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  error?: string;
}

interface Meeting {
  id: number;
  title: string;
  meetingDate: string | null;
  status: 'draft' | 'processing' | 'needs_review' | 'approved';
  source: string;
  transcript: string | null;
  aiSummary: string | null;
  humanSummary: string | null;
  confidentialityLevel: string;
  reviewedAt: string | null;
  createdAt: string;
  companyId: number | null;
  dealId: number | null;
  participants: MeetingParticipant[];
  /** Set on inbound-email meetings — populated by the worker. */
  sourceMetadata?: {
    from?: string;
    to?: string;
    senderEmail?: string;
    attachments?: MeetingAttachment[];
    links?: MeetingLink[];
  } | null;
  link?: {
    type: 'company' | 'deal';
    id: number;
    name: string;
    overlayId: number | null;
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const STATUS_LABELS: Record<Meeting['status'], { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-muted text-muted-foreground' },
  processing: { label: 'Processing…', tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  needs_review: { label: 'Needs review', tone: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  approved: { label: 'Approved', tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
};

export default function BrainMeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meetingId = parseInt(params.id, 10);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/portal/brain/meetings/${meetingId}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load meeting.');
      } else {
        setMeeting(json.data);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => { if (!Number.isNaN(meetingId)) load(); }, [meetingId, load]);

  const runProcessing = async () => {
    setProcessing(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/meetings/${meetingId}/process`, { method: 'POST' });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Processing failed.');
        await load();
        return;
      }
      router.push(`/portal/brain/meetings/${meetingId}/review`);
    } finally {
      setProcessing(false);
    }
  };

  const deleteMeeting = async () => {
    if (!confirm('Delete this meeting? This cannot be undone.')) return;
    const r = await fetch(`/api/portal/brain/meetings/${meetingId}`, { method: 'DELETE' });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      setError(json.message || 'Failed to delete.');
      return;
    }
    router.push('/portal/brain/meetings');
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading…
      </div>
    );
  }
  if (!meeting) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error || 'Meeting not found.'}
        </div>
      </div>
    );
  }

  const status = STATUS_LABELS[meeting.status];
  const date = meeting.meetingDate ? new Date(meeting.meetingDate) : new Date(meeting.createdAt);

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/portal/brain/meetings" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <span className="material-icons text-sm">arrow_back</span>
            All meetings
          </Link>
          <h1 className="text-2xl font-bold text-foreground mt-2 break-words">{meeting.title}</h1>
          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span>{date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <span>·</span>
            <span>via {meeting.source.replace(/_/g, ' ')}</span>
            <span>·</span>
            <span>{meeting.confidentialityLevel}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.tone}`}>
              {status.label}
            </span>
            {meeting.link && (
              <>
                <span>·</span>
                <Link
                  href={meeting.link.overlayId
                    ? `/portal/brain/relationships/${meeting.link.overlayId}`
                    : meeting.link.type === 'company'
                      ? `/portal/crm/companies/${meeting.link.id}`
                      : `/portal/crm/deals?deal=${meeting.link.id}`
                  }
                  className="hover:text-primary inline-flex items-center gap-0.5"
                >
                  <span className="material-icons text-sm">{meeting.link.type === 'company' ? 'business' : 'handshake'}</span>
                  {meeting.link.name}
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {(meeting.status === 'draft' || (meeting.status === 'needs_review' && !meeting.aiSummary)) && (
            <button
              onClick={runProcessing}
              disabled={processing}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {processing
                ? <><span className="material-icons animate-spin text-base">progress_activity</span>Processing…</>
                : <><span className="material-icons text-base">auto_awesome</span>Process with AI</>
              }
            </button>
          )}
          {(meeting.status === 'needs_review' || meeting.status === 'approved') && (
            <Link
              href={`/portal/brain/meetings/${meetingId}/review`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <span className="material-icons text-base">reviews</span>
              Review queue
            </Link>
          )}
          <button
            onClick={deleteMeeting}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-border text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
            aria-label="Delete meeting"
          >
            <span className="material-icons text-base">delete</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {meeting.aiSummary && (
        <Section title="AI summary" icon="auto_awesome">
          <p className="text-sm text-foreground whitespace-pre-wrap">{meeting.aiSummary}</p>
        </Section>
      )}

      {meeting.participants.length > 0 && (
        <Section title="Participants" icon="group">
          <div className="flex flex-wrap gap-2">
            {meeting.participants.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-muted text-foreground rounded-full px-2.5 py-1">
                <span className="material-icons text-sm">person</span>
                {p.name}{p.email ? ` <${p.email}>` : ''}
              </span>
            ))}
          </div>
        </Section>
      )}

      {(meeting.sourceMetadata?.attachments?.length ?? 0) > 0 && (
        <Section title={`Attachments (${meeting.sourceMetadata!.attachments!.length})`} icon="attach_file">
          <div className="space-y-2">
            {meeting.sourceMetadata!.attachments!.map((a, idx) => (
              <div key={a.key} className="border border-border rounded-md overflow-hidden">
                <a
                  href={`/api/portal/brain/meetings/${meeting.id}/attachments/${idx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors"
                >
                  <span className="material-icons text-base text-muted-foreground">
                    {a.contentType.startsWith('image/') ? 'image' :
                     a.contentType === 'application/pdf' ? 'picture_as_pdf' :
                     a.contentType.startsWith('video/') ? 'videocam' :
                     'description'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{a.filename}</p>
                    <p className="text-xs text-muted-foreground">{a.contentType} · {formatBytes(a.size)}</p>
                  </div>
                  <span className="material-icons text-sm text-muted-foreground">download</span>
                </a>
                {a.analysis && (
                  <div className="px-3 py-2 bg-muted/40 border-t border-border">
                    <div className="flex items-start gap-2">
                      <span className="material-icons text-xs text-primary mt-0.5">auto_awesome</span>
                      <p className="text-xs text-foreground/90 leading-relaxed">{a.analysis}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {(meeting.sourceMetadata?.links?.length ?? 0) > 0 && (
        <Section title={`Links (${meeting.sourceMetadata!.links!.length})`} icon="link">
          <div className="space-y-2">
            {meeting.sourceMetadata!.links!.map((l) => (
              <a
                key={l.url}
                href={l.finalUrl || l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-3 p-3 rounded-md border border-border hover:bg-accent transition-colors group"
              >
                {l.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.image}
                    alt=""
                    className="w-20 h-20 object-cover rounded shrink-0 bg-muted"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-20 h-20 rounded bg-muted flex items-center justify-center shrink-0">
                    <span className="material-icons text-muted-foreground">link</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {l.siteName && (
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 truncate">
                      {l.siteName}
                    </p>
                  )}
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-primary">
                    {l.title || l.url}
                  </p>
                  {l.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                      {l.description}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/70 mt-1 truncate">
                    {l.error ? `[failed: ${l.error}]` : (l.finalUrl || l.url)}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </Section>
      )}

      <Section title="Transcript" icon="description">
        {meeting.transcript ? (
          <pre className="text-xs text-foreground whitespace-pre-wrap font-mono bg-muted/30 border border-border rounded-md p-3 max-h-[600px] overflow-auto">{meeting.transcript}</pre>
        ) : (
          <p className="text-sm text-muted-foreground italic">No transcript captured.</p>
        )}
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-lg p-5">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
        <span className="material-icons text-base text-muted-foreground">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
