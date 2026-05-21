'use client';

/**
 * Decisions — detail view.
 *
 * Shows the full record + supersede chain. Provides three actions:
 *   - Edit       → in-place edit of the allowlisted fields. Rationale,
 *                  decision, and reversibility are deliberately not editable
 *                  here; the user must "Supersede" to change those.
 *   - Supersede  → navigates to /portal/brain/decisions/new?supersedes=<id>
 *                  with the predecessor pre-filled.
 *   - Reject     → soft-reject (DELETE), flips status to 'rejected'. Confirm
 *                  dialog first; on success redirects to the list.
 */
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type {
  BrainDecisionReversibility,
  BrainDecisionStatus,
} from '@/lib/db/schema';
import DecisionForm, {
  type DecisionFormInitial,
  type DecisionFormSubmitPayload,
} from '@/components/brain/DecisionForm';
import DecisionSupersedeChain, {
  type ChainNode,
} from '@/components/brain/DecisionSupersedeChain';
import { relativeDate } from '@/components/brain/DecisionCard';

interface DecisionDetailRow {
  id: number;
  title: string;
  context: string | null;
  decision: string;
  rationale: string;
  alternativesConsidered: string | null;
  reversibility: BrainDecisionReversibility;
  status: BrainDecisionStatus;
  decisionMakerId: number | null;
  decidedAt: string;
  supersededByDecisionId: number | null;
  meetingId: number | null;
  noteId: number | null;
  companyId: number | null;
  dealId: number | null;
  confidentialityLevel: 'standard' | 'restricted' | 'confidential';
  source: string;
}

interface DetailResponse {
  success: boolean;
  data?: {
    decision: DecisionDetailRow;
    ancestors: ChainNode[];
    descendants: ChainNode[];
  };
  message?: string;
}

interface TeamMember {
  userId: number;
  name: string | null;
  email: string;
}

const STATUS_STYLES: Record<BrainDecisionStatus, string> = {
  accepted: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  proposed: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
  superseded: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  rejected: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
};

const STATUS_LABEL: Record<BrainDecisionStatus, string> = {
  accepted: 'Accepted',
  proposed: 'Proposed',
  superseded: 'Superseded',
  rejected: 'Rejected',
};

const REVERSIBILITY_LABEL: Record<BrainDecisionReversibility, string> = {
  one_way: 'One-way door',
  two_way: 'Two-way door',
};

const REVERSIBILITY_ICON: Record<BrainDecisionReversibility, string> = {
  one_way: 'arrow_forward',
  two_way: 'sync_alt',
};

export default function DecisionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = parseInt(params.id, 10);

  const [data, setData] = useState<DetailResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);

  const [editing, setEditing] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editSubmitError, setEditSubmitError] = useState<string | null>(null);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const [collapsedContext, setCollapsedContext] = useState(true);
  const [collapsedAlternatives, setCollapsedAlternatives] = useState(true);

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) {
      setError('Invalid decision id');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/decisions/${id}`);
      const json: DetailResponse = await r.json();
      if (!r.ok || !json.success || !json.data) {
        setError(json.message || `HTTP ${r.status}`);
        setData(null);
      } else {
        setData(json.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-fetch + reload pattern; state updates happen inside load(), gated by the id-keyed useCallback.
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/team')
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res?.success && Array.isArray(res.data)) {
          const rows: TeamMember[] = res.data
            .map((m: { userId?: number; name?: string | null; email?: string }) => ({
              userId: typeof m.userId === 'number' ? m.userId : 0,
              name: m.name ?? null,
              email: m.email ?? '',
            }))
            .filter((m: TeamMember) => m.userId > 0);
          setTeam(rows);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Whenever the underlying decision changes (e.g. after a successful edit
  // PATCH or status flip), recompute the collapsed-section defaults so a
  // suddenly-shorter context auto-expands.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: collapsed-section defaults are derived from server-fetched content and must be re-applied when that content changes. */
  useEffect(() => {
    if (!data?.decision) return;
    setCollapsedContext((data.decision.context?.length ?? 0) > 400);
    setCollapsedAlternatives(Boolean(data.decision.alternativesConsidered?.length));
  }, [data?.decision]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleEditSubmit = useCallback(
    async (payload: DecisionFormSubmitPayload) => {
      setEditSubmitting(true);
      setEditSubmitError(null);
      try {
        const body = {
          title: payload.title,
          context: payload.context,
          decisionMakerId: payload.decisionMakerId,
          anchors: payload.anchors,
          confidentialityLevel: payload.confidentialityLevel,
          alternativesConsidered: payload.alternativesConsidered,
        };
        const r = await fetch(`/api/portal/brain/decisions/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await r.json().catch(() => ({}));
        if (!r.ok || !json?.success) {
          setEditSubmitError(json?.message || `HTTP ${r.status}`);
          setEditSubmitting(false);
          return;
        }
        setEditing(false);
        setEditSubmitting(false);
        await load();
      } catch (err) {
        setEditSubmitError(err instanceof Error ? err.message : 'Network error');
        setEditSubmitting(false);
      }
    },
    [id, load],
  );

  const handleReject = useCallback(async () => {
    setRejecting(true);
    setRejectError(null);
    try {
      const r = await fetch(`/api/portal/brain/decisions/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason || undefined }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json?.success) {
        setRejectError(json?.message || `HTTP ${r.status}`);
        setRejecting(false);
        return;
      }
      router.push('/portal/brain/decisions');
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : 'Network error');
      setRejecting(false);
    }
  }, [id, rejectReason, router]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-12 flex items-center justify-center text-muted-foreground text-sm">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading decision…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto py-12 space-y-4">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium mb-1">
            <span className="material-icons text-base">error_outline</span>
            Couldn&apos;t load decision
          </div>
          <p>{error}</p>
        </div>
        <Link href="/portal/brain/decisions" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
          <span className="material-icons text-base">arrow_back</span>
          Back to decisions
        </Link>
      </div>
    );
  }

  const d = data.decision;
  const decisionMakerName = d.decisionMakerId
    ? team.find((m) => m.userId === d.decisionMakerId)?.name
      ?? team.find((m) => m.userId === d.decisionMakerId)?.email
      ?? `User #${d.decisionMakerId}`
    : 'Unspecified';

  const decidedAtNice = new Date(d.decidedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (editing) {
    const initial: DecisionFormInitial = {
      title: d.title,
      context: d.context,
      decision: d.decision,
      rationale: d.rationale,
      alternativesConsidered: d.alternativesConsidered,
      reversibility: d.reversibility,
      decidedAt: d.decidedAt,
      decisionMakerId: d.decisionMakerId,
      meetingId: d.meetingId,
      noteId: d.noteId,
      companyId: d.companyId,
      dealId: d.dealId,
      confidentialityLevel: d.confidentialityLevel,
    };
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <span className="material-icons text-primary">edit</span>
            Edit decision
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Rationale, decision text, and reversibility are immutable — to change those,{' '}
            <button
              type="button"
              onClick={() => router.push(`/portal/brain/decisions/new?supersedes=${id}`)}
              className="underline hover:text-foreground"
            >
              supersede this decision
            </button>{' '}
            instead.
          </p>
        </div>
        <DecisionForm
          mode="edit"
          initial={initial}
          cancelHref={`/portal/brain/decisions/${id}`}
          submitLabel="Save changes"
          onSubmit={handleEditSubmit}
          submitting={editSubmitting}
          submitError={editSubmitError}
        />
        <div>
          <button
            type="button"
            onClick={() => { setEditing(false); setEditSubmitError(null); }}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <span className="material-icons text-base">close</span>
            Cancel edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Back link */}
      <Link href="/portal/brain/decisions" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <span className="material-icons text-base">arrow_back</span>
        Decisions
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="material-icons text-primary">gavel</span>
            <span className="break-words">{d.title}</span>
          </h1>
          <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_STYLES[d.status]}`}
            >
              {STATUS_LABEL[d.status]}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted/30">
              <span className="material-icons text-[12px] leading-none">{REVERSIBILITY_ICON[d.reversibility]}</span>
              {REVERSIBILITY_LABEL[d.reversibility]}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="material-icons text-[12px] leading-none">event</span>
              {decidedAtNice}
              <span className="text-muted-foreground/70">({relativeDate(d.decidedAt)})</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="material-icons text-[12px] leading-none">person</span>
              {decisionMakerName}
            </span>
            {d.confidentialityLevel !== 'standard' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <span className="material-icons text-[12px] leading-none">lock</span>
                {d.confidentialityLevel}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent"
          >
            <span className="material-icons text-base">edit</span>
            Edit
          </button>
          {d.status === 'accepted' && (
            <button
              type="button"
              onClick={() => router.push(`/portal/brain/decisions/new?supersedes=${id}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <span className="material-icons text-base">history</span>
              Supersede
            </button>
          )}
          {d.status !== 'rejected' && (
            <button
              type="button"
              onClick={() => { setRejectOpen(true); setRejectError(null); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
            >
              <span className="material-icons text-base">cancel</span>
              Reject
            </button>
          )}
        </div>
      </div>

      {/* Reject confirm */}
      {rejectOpen && (
        <div className="bg-rose-500/5 border border-rose-500/30 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-400 font-medium">
            <span className="material-icons text-base">warning</span>
            Reject this decision?
          </div>
          <p className="text-xs text-muted-foreground">
            Soft-rejects the decision (status → rejected). The row stays in history; you can&apos;t hard-delete it.
          </p>
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason (optional)"
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {rejectError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <span className="material-icons text-sm">error_outline</span>
              {rejectError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReject}
              disabled={rejecting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {rejecting && <span className="material-icons animate-spin text-base">progress_activity</span>}
              Confirm reject
            </button>
            <button
              type="button"
              onClick={() => { setRejectOpen(false); setRejectError(null); setRejectReason(''); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Context */}
      {d.context && (
        <Section
          icon="info"
          title="Context"
          collapsible={(d.context.length ?? 0) > 400}
          collapsed={collapsedContext}
          onToggle={() => setCollapsedContext((v) => !v)}
        >
          <p className="text-sm text-foreground whitespace-pre-wrap">{d.context}</p>
        </Section>
      )}

      {/* Decision — most prominent */}
      <section className="bg-primary/5 border border-primary/20 rounded-lg p-5">
        <div className="text-xs font-medium text-primary mb-2 flex items-center gap-1.5 uppercase tracking-wide">
          <span className="material-icons text-base">check_circle</span>
          Decision
        </div>
        <p className="text-base font-medium text-foreground whitespace-pre-wrap">{d.decision}</p>
      </section>

      {/* Rationale */}
      <Section icon="psychology" title="Rationale">
        <p className="text-sm text-foreground whitespace-pre-wrap">{d.rationale}</p>
      </Section>

      {/* Alternatives */}
      {d.alternativesConsidered && (
        <Section
          icon="alt_route"
          title="Alternatives considered"
          collapsible
          collapsed={collapsedAlternatives}
          onToggle={() => setCollapsedAlternatives((v) => !v)}
        >
          <p className="text-sm text-foreground whitespace-pre-wrap">{d.alternativesConsidered}</p>
        </Section>
      )}

      {/* Anchors */}
      <AnchorsRow row={d} />

      {/* Supersede chain */}
      <Section icon="history" title="Supersede chain">
        <DecisionSupersedeChain
          ancestors={data.ancestors}
          current={{ id: d.id, title: d.title, decidedAt: d.decidedAt, status: d.status }}
          descendants={data.descendants}
        />
      </Section>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
  collapsible,
  collapsed,
  onToggle,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <section className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <span className="material-icons text-base text-primary">{icon}</span>
          {title}
        </div>
        {collapsible && (
          <button
            type="button"
            onClick={onToggle}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {collapsed ? (
              <>
                <span className="material-icons text-base">expand_more</span>
                Show
              </>
            ) : (
              <>
                <span className="material-icons text-base">expand_less</span>
                Hide
              </>
            )}
          </button>
        )}
      </div>
      {(!collapsible || !collapsed) && children}
    </section>
  );
}

function AnchorsRow({ row }: { row: DecisionDetailRow }) {
  const anchors: Array<{ icon: string; label: string; href: string | null }> = [];
  if (row.meetingId) anchors.push({ icon: 'event', label: `Meeting #${row.meetingId}`, href: null });
  if (row.noteId) anchors.push({ icon: 'description', label: `Note #${row.noteId}`, href: `/portal/brain/knowledge?id=${row.noteId}` });
  if (row.companyId) anchors.push({ icon: 'business', label: `Company #${row.companyId}`, href: `/portal/crm/companies/${row.companyId}` });
  if (row.dealId) anchors.push({ icon: 'handshake', label: `Deal #${row.dealId}`, href: `/portal/crm/deals/${row.dealId}` });
  if (anchors.length === 0) return null;

  return (
    <Section icon="anchor" title="Anchors">
      <div className="flex items-center gap-2 flex-wrap">
        {anchors.map((a, i) => {
          const inner = (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border bg-muted/30 hover:bg-muted hover:text-foreground transition-colors">
              <span className="material-icons text-[14px] leading-none text-primary">{a.icon}</span>
              {a.label}
            </span>
          );
          return a.href ? (
            <Link key={i} href={a.href}>
              {inner}
            </Link>
          ) : (
            <span key={i}>{inner}</span>
          );
        })}
      </div>
    </Section>
  );
}
