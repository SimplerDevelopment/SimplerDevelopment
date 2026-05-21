'use client';

import { useState } from 'react';
import { BlockRenderer } from '@/components/blocks/render/BlockRenderer';

export type ApprovalEntityPreview =
  | {
      kind: 'post';
      title: string;
      slug: string;
      published: boolean;
      content: string;
      siteId: number | null;
    }
  | {
      kind: 'block_template';
      title: string;
      slug: string;
      category: string;
      scope: string;
      description: string | null;
      content: string;
      pendingDelete: boolean;
    }
  | {
      kind: 'pitch_deck';
      title: string;
      slug: string;
      status: string;
      slides: Array<{
        id: string;
        label: string | null;
        blocks: unknown;
        pageSettings?: unknown;
        customCss?: string | null;
      }>;
    }
  | {
      kind: 'email_campaign';
      title: string;
      subject: string;
      previewText: string | null;
      fromName: string;
      fromEmail: string;
      htmlContent: string;
      status: string;
    }
  | {
      kind: 'pending_change';
      title: string;
      entityType: string;
      operation: string;
      payloadJson: string;
    }
  | {
      kind: 'survey';
      title: string;
      slug: string;
      description: string | null;
      status: string;
      publicUrl: string;
      fields: Array<{
        id: string;
        type: string;
        label: string;
        required?: boolean;
        order?: number;
        options?: Array<{ id?: string; label: string; value?: string }>;
        showIf?: unknown;
        page?: number;
      }>;
      thankYouTitle: string | null;
      thankYouMessage: string | null;
      requireEmail: boolean;
    }
  | {
      kind: 'booking_page';
      title: string;
      slug: string;
      active: boolean;
      publicUrl: string;
      duration: number;
      price: number;
      priceLabel: string | null;
      timezone: string;
      bookingType: string;
      assignmentMode: string;
      description: string | null;
    }
  | { kind: 'missing'; message: string };

interface Props {
  token: string;
  linkType: 'entity' | 'pending_change';
  entityType: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  summary: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  expiresAt: string | null;
  preview: ApprovalEntityPreview;
}

export function ApprovalReviewer(props: Props) {
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerEmail, setReviewerEmail] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState(props.status);

  const isPending = currentStatus === 'pending';

  async function submit() {
    if (!decision) return;
    if (!reviewerName.trim()) {
      setError('Please enter your name.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/approve/${props.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: decision,
          reviewerName: reviewerName.trim(),
          reviewerEmail: reviewerEmail.trim() || undefined,
          reviewNote: reviewNote.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { success: boolean; message?: string; data?: { status?: string } };
      if (!data.success) {
        setError(data.message ?? 'Failed to record review');
        setSubmitting(false);
        return;
      }
      setCurrentStatus((data.data?.status as typeof currentStatus | undefined) ?? (decision === 'approve' ? 'approved' : 'rejected'));
      setDecision(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <StickyBar
        title={getPreviewTitle(props.preview)}
        summary={props.summary}
        entityType={props.entityType}
        status={currentStatus}
        expiresAt={props.expiresAt}
        reviewerName={props.reviewerName}
        reviewedAt={props.reviewedAt}
        isPending={isPending}
        onApprove={() => {
          setDecision('approve');
          setError(null);
        }}
        onReject={() => {
          setDecision('reject');
          setError(null);
        }}
      />

      <main className="max-w-7xl mx-auto p-4 sm:p-8">
        <PreviewBody preview={props.preview} />
      </main>

      {decision && (
        <DecisionModal
          decision={decision}
          reviewerName={reviewerName}
          reviewerEmail={reviewerEmail}
          reviewNote={reviewNote}
          submitting={submitting}
          error={error}
          onChangeName={setReviewerName}
          onChangeEmail={setReviewerEmail}
          onChangeNote={setReviewNote}
          onCancel={() => {
            setDecision(null);
            setError(null);
          }}
          onConfirm={submit}
        />
      )}
    </div>
  );
}

function getPreviewTitle(p: ApprovalEntityPreview): string {
  switch (p.kind) {
    case 'missing':
      return 'Not found';
    case 'pending_change':
      return p.title;
    default:
      return p.title;
  }
}

function StickyBar(props: {
  title: string;
  summary: string | null;
  entityType: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresAt: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  isPending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const statusColor =
    props.status === 'approved'
      ? 'bg-green-100 text-green-800'
      : props.status === 'rejected'
      ? 'bg-red-100 text-red-800'
      : props.status === 'expired'
      ? 'bg-gray-100 text-gray-700'
      : 'bg-amber-100 text-amber-800';

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {humanEntity(props.entityType)} — Draft review
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
              {props.status.toUpperCase()}
            </span>
          </div>
          <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{props.title}</h1>
          {props.summary && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{props.summary}</p>
          )}
        </div>
        {props.isPending ? (
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={props.onReject}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={props.onApprove}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              Approve
            </button>
          </div>
        ) : (
          <div className="text-xs text-gray-500 shrink-0">
            {props.reviewerName && props.reviewedAt && (
              <>
                {props.status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                <span className="font-medium text-gray-700">{props.reviewerName}</span>
                <br />
                on {new Date(props.reviewedAt).toLocaleString()}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewBody({ preview }: { preview: ApprovalEntityPreview }) {
  switch (preview.kind) {
    case 'missing':
      return (
        <div className="rounded-xl bg-white border border-gray-200 p-12 text-center">
          <p className="text-gray-500">{preview.message}</p>
        </div>
      );
    case 'post':
      return (
        <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="text-xs text-gray-500">
              Slug <code className="text-gray-700">{preview.slug}</code> ·{' '}
              {preview.published ? 'Currently published' : 'Currently a draft'}
            </div>
          </div>
          <div className="p-2 sm:p-4">
            <BlockRenderer content={preview.content} siteId={preview.siteId ?? undefined} />
          </div>
        </div>
      );
    case 'block_template':
      return (
        <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="text-xs text-gray-500">
              {preview.category} · {preview.scope}
              {preview.pendingDelete && (
                <span className="ml-2 px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium">PENDING DELETE</span>
              )}
            </div>
            {preview.description && (
              <p className="text-sm text-gray-700 mt-2">{preview.description}</p>
            )}
          </div>
          {!preview.pendingDelete && (
            <div className="p-2 sm:p-4">
              <BlockRenderer content={preview.content} />
            </div>
          )}
        </div>
      );
    case 'pitch_deck':
      return (
        <div className="space-y-6">
          {preview.slides.length === 0 ? (
            <div className="rounded-xl bg-white border border-gray-200 p-12 text-center text-gray-500">
              This deck has no slides yet.
            </div>
          ) : (
            preview.slides.map((slide, idx) => {
              // Ticket #19: mirror the published renderer — apply
              // pageSettings.backgroundImage / backgroundColor / size /
              // position / repeat as inline styles on the slide card so
              // reviewers see what the author authored. customCss is
              // injected scoped to this slide via [data-slide-id].
              const ps = (slide.pageSettings ?? {}) as {
                backgroundColor?: string;
                backgroundImage?: string;
                backgroundSize?: string;
                backgroundPosition?: string;
                backgroundRepeat?: string;
              };
              const bgStyle: React.CSSProperties = {};
              if (ps.backgroundColor) bgStyle.backgroundColor = ps.backgroundColor;
              if (ps.backgroundImage) {
                const raw = ps.backgroundImage.trim();
                bgStyle.backgroundImage = /^url\(/i.test(raw) ? raw : `url(${raw})`;
                bgStyle.backgroundSize = ps.backgroundSize || 'cover';
                bgStyle.backgroundPosition = ps.backgroundPosition || 'center';
                bgStyle.backgroundRepeat = ps.backgroundRepeat || 'no-repeat';
              }
              return (
                <div
                  key={slide.id}
                  data-slide-id={slide.id}
                  className="rounded-xl bg-white border border-gray-200 overflow-hidden"
                  style={bgStyle}
                >
                  {slide.customCss && (
                    <style dangerouslySetInnerHTML={{ __html: slide.customCss }} />
                  )}
                  <div className="px-6 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-700">
                      Slide {idx + 1}
                      {slide.label && <span className="text-gray-500"> — {slide.label}</span>}
                    </span>
                    <span className="text-xs text-gray-400">{slide.id}</span>
                  </div>
                  <div className="p-2 sm:p-4">
                    <BlockRenderer
                      content={JSON.stringify({ blocks: slide.blocks, version: '1.0' })}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      );
    case 'email_campaign':
      return (
        <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 space-y-1">
            <div className="text-xs text-gray-500">
              From <span className="font-medium text-gray-700">{preview.fromName}</span>{' '}
              &lt;{preview.fromEmail}&gt;
            </div>
            <div className="text-sm font-medium text-gray-900">Subject: {preview.subject}</div>
            {preview.previewText && (
              <div className="text-xs text-gray-600 italic">Preview: {preview.previewText}</div>
            )}
            <div className="text-xs text-gray-500">
              Status: <code className="text-gray-700">{preview.status}</code>
            </div>
          </div>
          <iframe
            title="Email preview"
            srcDoc={preview.htmlContent || '<p style="padding:24px;color:#666">No HTML content yet.</p>'}
            className="w-full"
            style={{ minHeight: '70vh', border: 'none' }}
            sandbox="allow-same-origin"
          />
        </div>
      );
    case 'pending_change':
      return (
        <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
            Staged change: <code className="text-gray-700">{preview.entityType}</code> ·{' '}
            <code className="text-gray-700">{preview.operation}</code>
          </div>
          <pre className="p-6 text-xs overflow-x-auto bg-gray-900 text-gray-100">
            {preview.payloadJson}
          </pre>
        </div>
      );
    case 'survey':
      return (
        <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 space-y-1">
            <div className="text-xs text-gray-500">
              Slug <code className="text-gray-700">{preview.slug}</code> ·{' '}
              Status <code className="text-gray-700">{preview.status}</code>
              {preview.requireEmail && (
                <span className="ml-2 px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">
                  email required
                </span>
              )}
            </div>
            {preview.description && (
              <p className="text-sm text-gray-700 mt-2">{preview.description}</p>
            )}
            <div className="text-xs text-gray-500 mt-1">
              Public URL on approve: <code className="text-gray-700">{preview.publicUrl}</code>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {preview.fields.length === 0 ? (
              <p className="text-sm text-gray-500">No fields yet.</p>
            ) : (
              preview.fields.map((f, idx) => (
                <div key={f.id ?? idx} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-medium text-gray-900">
                      {idx + 1}. {f.label || <span className="italic text-gray-500">(no label)</span>}
                      {f.required && <span className="text-red-600 ml-1" aria-label="required">*</span>}
                    </div>
                    <code className="text-xs text-gray-500">{f.type}</code>
                  </div>
                  {Array.isArray(f.options) && f.options.length > 0 && (
                    <ul className="mt-2 ml-4 text-sm text-gray-700 list-disc">
                      {f.options.map((o, oi) => (
                        <li key={o.id ?? oi}>{o.label}</li>
                      ))}
                    </ul>
                  )}
                  {f.showIf != null && (
                    <div className="mt-2 text-xs text-gray-500">
                      Conditional — <code className="text-gray-700">{JSON.stringify(f.showIf)}</code>
                    </div>
                  )}
                </div>
              ))
            )}
            {(preview.thankYouTitle || preview.thankYouMessage) && (
              <div className="mt-6 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                <div className="text-xs font-medium text-emerald-800 uppercase tracking-wider mb-1">
                  Thank-you screen
                </div>
                {preview.thankYouTitle && (
                  <div className="text-sm font-medium text-emerald-900">{preview.thankYouTitle}</div>
                )}
                {preview.thankYouMessage && (
                  <div className="text-sm text-emerald-800 mt-1">{preview.thankYouMessage}</div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    case 'booking_page':
      return (
        <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 space-y-1">
            <div className="text-xs text-gray-500">
              Slug <code className="text-gray-700">{preview.slug}</code> ·{' '}
              {preview.active ? 'Currently active' : 'Currently inactive'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Public URL on approve: <code className="text-gray-700">{preview.publicUrl}</code>
            </div>
          </div>
          <div className="p-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Duration</div>
              <div className="text-gray-900">{preview.duration} min</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Price</div>
              <div className="text-gray-900">
                {preview.priceLabel ?? (preview.price > 0 ? `$${(preview.price / 100).toFixed(2)}` : 'Free')}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Booking type</div>
              <div className="text-gray-900">{preview.bookingType}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Assignment</div>
              <div className="text-gray-900">{preview.assignmentMode}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Timezone</div>
              <div className="text-gray-900">{preview.timezone}</div>
            </div>
            {preview.description && (
              <div className="col-span-2 mt-2 pt-4 border-t border-gray-100">
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Description</div>
                <p className="text-gray-700">{preview.description}</p>
              </div>
            )}
          </div>
        </div>
      );
  }
}

function DecisionModal(props: {
  decision: 'approve' | 'reject';
  reviewerName: string;
  reviewerEmail: string;
  reviewNote: string;
  submitting: boolean;
  error: string | null;
  onChangeName: (v: string) => void;
  onChangeEmail: (v: string) => void;
  onChangeNote: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isApprove = props.decision === 'approve';
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {isApprove ? 'Approve this draft?' : 'Reject this draft?'}
        </h2>
        <p className="text-sm text-gray-600">
          {isApprove
            ? 'Your name will be recorded with the approval. The change will go live as soon as you confirm.'
            : 'Your name will be recorded with the rejection. The author can revise and re-send for review.'}
        </p>
        {props.error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {props.error}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
          <input
            value={props.reviewerName}
            onChange={(e) => props.onChangeName(e.target.value)}
            placeholder="Full name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="email"
            value={props.reviewerEmail}
            onChange={(e) => props.onChangeEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Note <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={props.reviewNote}
            onChange={(e) => props.onChangeNote(e.target.value)}
            placeholder={isApprove ? 'Anything to tell the author?' : 'What needs to change?'}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={props.onCancel}
            disabled={props.submitting}
            className="px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.submitting}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${
              isApprove ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
            } disabled:opacity-50`}
          >
            {props.submitting
              ? isApprove
                ? 'Approving…'
                : 'Rejecting…'
              : isApprove
              ? 'Approve'
              : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

function humanEntity(entityType: string): string {
  switch (entityType) {
    case 'post':
      return 'Page';
    case 'pitch_deck':
      return 'Pitch deck';
    case 'email_campaign':
      return 'Email';
    case 'block_template':
      return 'Block template';
    case 'survey':
      return 'Survey';
    case 'booking_page':
      return 'Booking page';
    default:
      return entityType.replace(/_/g, ' ');
  }
}
