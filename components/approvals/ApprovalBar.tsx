'use client';

/**
 * The approval bar — approve/reject overlaid on the artifact's REAL product
 * surface (PUX-062). One component for every surface; each route renders it when
 * `resolveApprovalContext` returns non-null.
 *
 * Three constraints are load-bearing, not cosmetic:
 *
 *   1. **It holds no token.** The credential stays in the httpOnly cookie and
 *      decisions go through /api/approve/decision. A token in these props would
 *      be readable by a site page's author-controlled `customJs`, which would
 *      let an author self-approve their own draft.
 *   2. **It does not capture the surface's keys.** A deck is driven by arrow
 *      keys; swallowing them would break the thing being reviewed. Only the
 *      modal stops propagation, and only while it is open.
 *   3. **It resists the page it sits on.** Styling is inline on an `all: initial`
 *      host at max z-index, so a tenant stylesheet cannot select it away. The
 *      author is the party seeking approval — hiding the reject button is a real
 *      attack, not a theoretical one.
 *
 * `variant` follows the surface: fixed-viewport stages (a deck) auto-hide so the
 * artifact renders at full fidelity, and return on any input. Scrolling surfaces
 * stay persistent — nothing is gained by hiding, and always-visible draft chrome
 * is what keeps a reviewer oriented when a synthetic confirmation screen tells
 * them something was saved that was not.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type ApprovalBarStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalBarProps {
  /** Human label for the artifact kind, e.g. "Pitch deck". */
  entityLabel: string;
  title: string;
  summary?: string | null;
  status: ApprovalBarStatus;
  expiresAt?: string | null;
  reviewerName?: string | null;
  reviewedAt?: string | null;
  /** 'auto-hide' on fixed-viewport stages (deck); 'persistent' on scrolling surfaces. */
  variant?: 'auto-hide' | 'persistent';
  /** Prefill for a signed-in staff reviewer following a public link. */
  defaultReviewer?: { name: string; email: string } | null;
}

const IDLE_MS = 3500;
const Z = 2147483647;

export function ApprovalBar(props: ApprovalBarProps) {
  const variant = props.variant ?? 'persistent';
  const [status, setStatus] = useState<ApprovalBarStatus>(props.status);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [visible, setVisible] = useState(true);
  const [reviewerName, setReviewerName] = useState(props.defaultReviewer?.name ?? '');
  const [reviewNote, setReviewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decidedBy, setDecidedBy] = useState<string | null>(props.reviewerName ?? null);
  // PUX-078: viewing needs only the link; deciding needs a signed-in user with
  // access. The bar cannot know which it is facing, so it asks.
  const [authority, setAuthority] = useState<
    { canDecide: boolean; reason?: string | null; reviewerName?: string | null } | null
  >(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPending = status === 'pending';

  // Auto-hide on idle, and only on a fixed-viewport stage. The modal pins the bar
  // open — a reviewer typing a rejection note must not have it fade out.
  const poke = useCallback(() => {
    if (variant !== 'auto-hide') return;
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    if (decision) return;
    timer.current = setTimeout(() => setVisible(false), IDLE_MS);
  }, [variant, decision]);

  useEffect(() => {
    if (variant !== 'auto-hide') return;
    // Arm the initial hide directly rather than calling poke(), which would
    // setState synchronously inside the effect (react-hooks/set-state-in-effect).
    // `visible` already starts true, so there is nothing to set — only to schedule.
    if (timer.current) clearTimeout(timer.current);
    if (!decision) timer.current = setTimeout(() => setVisible(false), IDLE_MS);
    // Passive listeners so the surface's own scroll/key handling is untouched.
    const opts = { passive: true } as const;
    window.addEventListener('mousemove', poke, opts);
    window.addEventListener('keydown', poke, opts);
    window.addEventListener('scroll', poke, opts);
    window.addEventListener('touchstart', poke, opts);
    return () => {
      window.removeEventListener('mousemove', poke);
      window.removeEventListener('keydown', poke);
      window.removeEventListener('scroll', poke);
      window.removeEventListener('touchstart', poke);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [variant, poke, decision]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/approve/decision')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setAuthority({
            canDecide: !!d?.canDecide,
            reason: d?.reason ?? null,
            reviewerName: d?.reviewerName ?? null,
          });
          if (d?.reviewerName) setReviewerName(d.reviewerName);
        }
      })
      .catch(() => {
        // Treat an unreachable probe as "cannot decide" — the server enforces
        // this anyway, so a failed probe must not render buttons that 401.
        if (!cancelled) setAuthority({ canDecide: false, reason: 'unauthenticated' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    if (!decision) return;
    setSubmitting(true);
    setError(null);
    try {
      // No token in the body — the httpOnly cookie is the credential.
      const res = await fetch('/api/approve/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: decision,
          // Identity is taken from the session server-side (PUX-078).
          reviewNote: reviewNote.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        message?: string;
        data?: { status?: string };
      };
      if (!data.success) {
        setError(data.message ?? 'Failed to record review');
        setSubmitting(false);
        return;
      }
      setStatus(
        (data.data?.status as ApprovalBarStatus | undefined) ??
          (decision === 'approve' ? 'approved' : 'rejected'),
      );
      setDecidedBy(reviewerName.trim());
      setDecision(null);
      setVisible(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  const accent =
    status === 'approved'
      ? '#047857'
      : status === 'rejected'
      ? '#b91c1c'
      : status === 'expired'
      ? '#4b5563'
      : '#b45309';

  return (
    <>
      {/* The bar is position:fixed, so on a scrolling surface it sits on top of
          whatever the page ends with. This spacer occupies real flow space so the
          last element is never hidden behind it. Not needed on an auto-hiding
          fixed stage (a deck), which does not scroll and where the bar disappears
          on idle anyway. */}
      {variant === 'persistent' && <div aria-hidden style={{ height: 120 }} />}
      <div
        data-sd-approval-bar=""
        style={{
          all: 'initial',
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: Z,
          display: 'block',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          pointerEvents: 'none',
        }}
      >
      <div
        style={{
          margin: '0 auto 16px',
          maxWidth: 760,
          background: 'rgba(17,24,39,0.96)',
          color: '#f9fafb',
          borderRadius: 12,
          boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          pointerEvents: 'auto',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(120%)',
          transition: 'opacity 200ms ease, transform 200ms ease',
        }}
      >
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          {/* The artifact's name leads — it is what the reviewer is deciding on.
              Kind, status and expiry are supporting metadata on one demoted line
              rather than three competing rows. */}
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {props.title}
          </div>

          {/* The author's note. Passed in and previously dropped on the floor —
              it is the reviewer's only explanation of why they were sent this. */}
          {props.summary && (
            <div
              style={{
                fontSize: 12,
                color: '#d1d5db',
                marginTop: 3,
                lineHeight: 1.35,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {props.summary}
            </div>
          )}

          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            <span style={{ color: accent, fontWeight: 600 }}>{status}</span>
            {' · '}
            {props.entityLabel.toLowerCase()} draft
            {isPending && props.expiresAt && (
              <> {' · '} expires {new Date(props.expiresAt).toLocaleDateString()}</>
            )}
            {!isPending && decidedBy && <> {' · '} by {decidedBy}</>}
          </div>
        </div>

        {isPending && authority?.canDecide && (
          <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
            <button
              type="button"
              onClick={() => {
                setDecision('reject');
                setError(null);
              }}
              style={btnStyle('#374151', '#f9fafb')}
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => {
                setDecision('approve');
                setError(null);
              }}
              style={btnStyle('#2563eb', '#ffffff')}
            >
              Approve
            </button>
          </div>
        )}

        {/* Viewing is open to anyone with the link; deciding is not (PUX-078).
            An external stakeholder still sees the real artifact — they just get
            told who can sign it off instead of buttons that would 401. */}
        {isPending && authority && !authority.canDecide && (
          <div style={{ flex: '0 0 auto', textAlign: 'right', maxWidth: 260 }}>
            {authority.reason === 'unauthenticated' ? (
              <>
                <a
                  href={`/portal/login?callbackUrl=${encodeURIComponent(
                    typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search,
                  )}`}
                  style={{ ...btnStyle('#2563eb', '#ffffff'), display: 'inline-block', textDecoration: 'none' }}
                >
                  Sign in to approve
                </a>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                  Anyone with this link can review it.
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#d1d5db', lineHeight: 1.4 }}>
                You can review this draft, but approving it needs an account with
                access to this workspace.
              </div>
            )}
          </div>
        )}
      </div>

      {decision && (
        <div
          // Escape and typing belong to the modal while it is open — the surface
          // underneath (a deck's arrow keys) must not also receive them.
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape' && !submitting) {
              setDecision(null);
              setError(null);
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              color: '#111827',
              borderRadius: 12,
              padding: 24,
              width: '100%',
              maxWidth: 440,
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
              {decision === 'approve' ? 'Approve' : 'Reject'} this {props.entityLabel.toLowerCase()}?
            </div>
            <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 16 }}>
              {decision === 'approve'
                ? 'This publishes the draft. It cannot be undone from this link.'
                : 'The draft stays unpublished. Tell the author what needs to change.'}
            </div>

            {/* Identity is the signed-in account (PUX-078) — the old free-text
                name/email fields recorded an unverifiable string in the audit
                trail and are gone. */}
            <div
              style={{
                fontSize: 12,
                color: '#4b5563',
                background: '#f3f4f6',
                borderRadius: 8,
                padding: '8px 10px',
                marginBottom: 12,
              }}
            >
              Signing as <strong style={{ color: '#111827' }}>{reviewerName}</strong>
            </div>

            <label style={labelStyle}>
              {decision === 'approve' ? 'Note (optional)' : 'What needs to change?'}
            </label>
            <textarea
              autoFocus
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />

            {error && (
              <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setDecision(null);
                  setError(null);
                }}
                style={btnStyle('#e5e7eb', '#111827')}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={submit}
                style={btnStyle(decision === 'approve' ? '#2563eb' : '#b91c1c', '#ffffff')}
              >
                {submitting ? 'Saving…' : decision === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

function btnStyle(bg: string, fg: string): React.CSSProperties {
  return {
    background: bg,
    color: fg,
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 14,
  marginBottom: 12,
  fontFamily: 'inherit',
  color: '#111827',
  background: '#ffffff',
};
