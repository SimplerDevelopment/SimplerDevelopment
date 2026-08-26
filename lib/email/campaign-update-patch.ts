/**
 * Single source of truth for the column patch an email-campaign PATCH writes.
 *
 * JUL9-014: two REST handlers — `app/api/portal/email/campaigns/[id]` and
 * `app/api/admin/email/campaigns/[id]` — hand-rolled this `.set({...})` object
 * separately and drifted into the same bug. Most fields were merged with a
 * conditional spread (`...(name && { name })`), but four were assigned
 * UNCONDITIONALLY:
 *
 *     previewText: previewText?.trim() || null,
 *     replyTo:     replyTo?.trim()     || null,
 *     scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
 *     status:      scheduledAt ? 'scheduled' : 'draft',
 *
 * So a partial PATCH silently destroyed data the caller never mentioned. The
 * `status` line is the sharp one: a campaign in `scheduled` state is still
 * editable (only `sent` is refused), so renaming one — or toggling any A/B
 * field — omitted `scheduledAt`, which nulled the send time AND reverted
 * `status` to `draft`. The campaign simply stopped being scheduled, with a
 * 200 and no indication anything had happened.
 *
 * The rule here is ordinary PATCH semantics, and the distinction the old code
 * lost: **omitted means "leave alone", explicit null means "clear"**. Those
 * are different intents and `undefined` vs `null` is exactly how the wire
 * format distinguishes them. `scheduledAt: null` still unschedules; omitting
 * it now does nothing.
 *
 * `lib/mcp/tools/email.ts`'s `email_campaigns_update` already did this
 * correctly (`for (const [k, v] of Object.entries(rest)) if (v !== undefined)`),
 * which is why the MCP path never had the bug — worth knowing before anyone
 * "fixes" that one to match a REST route.
 *
 * Modelled on `lib/mcp/post-update-patch.ts` (PUX-096), where the same
 * two-hand-rolled-copies problem hit posts. Same shape of fix, same reason:
 * one builder, and a test that fails if a call site starts hand-rolling again.
 */

/** Everything a campaign PATCH may carry. Every key is optional; a key that is
 *  absent (or `undefined`) is left untouched on the row. */
export interface CampaignUpdateInput {
  name?: unknown;
  subject?: unknown;
  previewText?: unknown;
  fromName?: unknown;
  fromEmail?: unknown;
  replyTo?: unknown;
  /** Already rendered + sanitized by the caller — the block-rendering and
   *  `sanitizeRichHtml` steps stay in the route, since only the portal route
   *  has block content to render. */
  htmlContent?: unknown;
  blockContent?: unknown;
  contentBlocks?: unknown;
  useBlockEditor?: unknown;
  scheduledAt?: unknown;
  abEnabled?: unknown;
  abSubjectB?: unknown;
  abWinnerMetric?: unknown;
  abTestSizePct?: unknown;
}

/** Trim a string-ish value; `null`/empty become null ("clear this field"). */
function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function buildCampaignUpdatePatch(input: CampaignUpdateInput): Record<string, unknown> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  // Non-clearable text fields: a blank name or subject is not a meaningful
  // value, so an empty string is treated as "not supplied" rather than
  // writing an empty campaign name. This matches the original `...(name && )`
  // behaviour deliberately — it was never the bug.
  if (typeof input.name === 'string' && input.name.trim()) patch.name = input.name.trim();
  if (typeof input.subject === 'string' && input.subject.trim()) patch.subject = input.subject.trim();
  if (typeof input.fromName === 'string' && input.fromName.trim()) patch.fromName = input.fromName.trim();
  if (typeof input.fromEmail === 'string' && input.fromEmail.trim()) patch.fromEmail = input.fromEmail.trim();
  if (typeof input.htmlContent === 'string' && input.htmlContent.trim()) {
    patch.htmlContent = input.htmlContent.trim();
  }

  // Clearable text fields — THE JUL9-014 FIX. Present-and-empty clears;
  // absent leaves the stored value alone.
  if (input.previewText !== undefined) patch.previewText = trimOrNull(input.previewText);
  if (input.replyTo !== undefined) patch.replyTo = trimOrNull(input.replyTo);

  // Structured content.
  if (input.blockContent !== undefined) patch.blockContent = input.blockContent;
  if (input.contentBlocks !== undefined) patch.contentBlocks = input.contentBlocks;
  if (typeof input.useBlockEditor === 'boolean') patch.useBlockEditor = input.useBlockEditor;

  // A/B subject test.
  if (typeof input.abEnabled === 'boolean') patch.abEnabled = input.abEnabled;
  if (input.abSubjectB !== undefined) patch.abSubjectB = trimOrNull(input.abSubjectB);
  if (input.abWinnerMetric === 'open' || input.abWinnerMetric === 'click') {
    patch.abWinnerMetric = input.abWinnerMetric;
  }
  if (typeof input.abTestSizePct === 'number' && input.abTestSizePct >= 5 && input.abTestSizePct <= 50) {
    patch.abTestSizePct = Math.round(input.abTestSizePct);
  }

  // Schedule — THE SHARP ONE. `status` is derived from `scheduledAt`, so it
  // may only be touched when the caller actually sent `scheduledAt`. Deriving
  // it unconditionally is what silently unscheduled campaigns on an unrelated
  // edit. Explicit null still unschedules, which is how the UI's "clear
  // schedule" works.
  if (input.scheduledAt !== undefined) {
    patch.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt as string) : null;
    patch.status = input.scheduledAt ? 'scheduled' : 'draft';
  }

  return patch;
}
