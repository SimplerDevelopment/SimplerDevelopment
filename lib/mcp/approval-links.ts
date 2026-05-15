/**
 * Approval-link minting + lookup for MCP-authored draft content.
 *
 * Every MCP create/update tool over reviewable content (posts, pitch decks,
 * email campaigns, block templates) ends with a call to `createApprovalLink`.
 * The result is a token-bearing URL the MCP returns to its caller — that URL
 * opens a public page (`/approve/[token]`) where a non-authenticated reviewer
 * can preview the draft and approve/reject without a portal login.
 *
 * Two link shapes share the table:
 *   - linkType = 'entity'         → direct pointer to a draft entity row.
 *                                   Approve = publish; reject = mark rejected
 *                                   on the link (the entity stays a draft so
 *                                   the author can revise + remint).
 *   - linkType = 'pending_change' → wraps an mcp_pending_changes row staged by
 *                                   a require_cms_approval key. Approve =
 *                                   apply the staged mutation via the existing
 *                                   approvals pipeline.
 *
 * The token (64 hex chars from crypto.randomBytes(32)) is the only credential
 * the reviewer carries. Routes that consume the token MUST scope every
 * subsequent read/write by the `clientId` returned from this lookup.
 */

import crypto from 'crypto';
import { db } from '@/lib/db';
import { mcpApprovalLinks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import type { StageOrApplyResult } from './pending-changes';

export type ApprovableEntityType =
  | 'post'
  | 'pitch_deck'
  | 'email_campaign'
  | 'block_template'
  | 'survey'
  | 'booking_page';

export type ApprovalLinkType = 'entity' | 'pending_change';

export interface CreateApprovalLinkArgs {
  ctx: PortalMcpContext;
  entityType: ApprovableEntityType;
  /** Null when linkType is 'pending_change' and the entity doesn't exist yet. */
  entityId: number | null;
  summary: string;
  linkType?: ApprovalLinkType; // default 'entity'
  pendingChangeId?: number | null;
  expiresInDays?: number | null; // null = never expires
}

export interface ApprovalLinkResult {
  approvalLinkId: number;
  approvalToken: string;
  approvalUrl: string;
  previewUrl: string; // same as approvalUrl for now — single public page handles both
  expiresAt: Date | null;
}

const TOKEN_BYTES = 32; // 64 hex chars

function baseUrl(): string {
  return process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';
}

export function formatApprovalUrl(token: string): string {
  return `${baseUrl()}/approve/${token}`;
}

/**
 * Mint a new approval link row and return its public URL.
 * Caller is responsible for already having created the entity row (or a
 * pending-change row) it points at.
 */
export async function createApprovalLink(args: CreateApprovalLinkArgs): Promise<ApprovalLinkResult> {
  const linkType: ApprovalLinkType = args.linkType ?? 'entity';
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const expiresAt =
    typeof args.expiresInDays === 'number' && args.expiresInDays > 0
      ? new Date(Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const [row] = await db
    .insert(mcpApprovalLinks)
    .values({
      token,
      clientId: args.ctx.client.id,
      linkType,
      entityType: args.entityType,
      entityId: args.entityId,
      pendingChangeId: args.pendingChangeId ?? null,
      summary: args.summary.slice(0, 500),
      createdBy: args.ctx.userId ?? null,
      keyId: args.ctx.keyId ?? null,
      expiresAt,
      status: 'pending',
    })
    .returning({ id: mcpApprovalLinks.id });

  const url = formatApprovalUrl(token);
  return {
    approvalLinkId: row.id,
    approvalToken: token,
    approvalUrl: url,
    previewUrl: url,
    expiresAt,
  };
}

export interface ApprovalLinkRow {
  id: number;
  token: string;
  clientId: number;
  linkType: ApprovalLinkType;
  entityType: ApprovableEntityType;
  entityId: number | null;
  pendingChangeId: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  summary: string | null;
  createdBy: number | null;
  keyId: number | null;
  reviewerName: string | null;
  reviewerEmail: string | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * Look up a link by its public token. Returns null when:
 *   - token isn't 64 hex chars (cheap rejection of obviously bogus inputs)
 *   - no row matches
 *   - link is past its expiresAt (marks it expired on the way out)
 *
 * Does NOT enforce status — the caller decides whether 'approved' / 'rejected'
 * rows are still legible (the public page typically renders them in read-only
 * mode so reviewers can re-share a confirmation link).
 */
export async function lookupApprovalLink(token: string): Promise<ApprovalLinkRow | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;

  const [row] = await db
    .select()
    .from(mcpApprovalLinks)
    .where(eq(mcpApprovalLinks.token, token))
    .limit(1);

  if (!row) return null;

  if (row.expiresAt && row.expiresAt < new Date() && row.status === 'pending') {
    await db
      .update(mcpApprovalLinks)
      .set({ status: 'expired' })
      .where(eq(mcpApprovalLinks.id, row.id));
    return { ...row, status: 'expired' } as ApprovalLinkRow;
  }

  return row as ApprovalLinkRow;
}

export interface RecordReviewArgs {
  token: string;
  decision: 'approved' | 'rejected';
  reviewerName?: string | null;
  reviewerEmail?: string | null;
  reviewNote?: string | null;
}

/**
 * Mark a link as approved/rejected and capture the reviewer's identifying
 * info. The caller is responsible for the side-effect (publishing the entity
 * or applying the pending change) — this helper only updates the link row.
 */
export async function recordReview(args: RecordReviewArgs): Promise<ApprovalLinkRow | null> {
  const existing = await lookupApprovalLink(args.token);
  if (!existing) return null;
  if (existing.status !== 'pending') return existing;

  const [updated] = await db
    .update(mcpApprovalLinks)
    .set({
      status: args.decision,
      reviewerName: args.reviewerName?.slice(0, 255) || null,
      reviewerEmail: args.reviewerEmail?.slice(0, 255) || null,
      reviewNote: args.reviewNote || null,
      reviewedAt: new Date(),
    })
    .where(eq(mcpApprovalLinks.id, existing.id))
    .returning();

  return updated as ApprovalLinkRow;
}

/**
 * Companion helper that turns the result of a `stageOrApply` call into an
 * approval link in one shot. Use from MCP create/update handlers:
 *
 *   const result = await stageOrApply({ ... });
 *   const link = await mintLinkForResult({
 *     ctx,
 *     entityType: 'post',
 *     summary: `Page "${args.title}"`,
 *     result,
 *   });
 *   if (result.pending) return json({ pending: true, ...staged, approval: link });
 *   return json({ ...result.data, approval: link });
 *
 * Returns null only when the applied path returned a row whose `id` field is
 * not a number — in practice that means the caller projected the row in a
 * shape we can't reference, so they should embed an approval link via the
 * fuller `createApprovalLink` helper themselves.
 */
export async function mintLinkForResult(args: {
  ctx: PortalMcpContext;
  entityType: ApprovableEntityType;
  summary: string;
  result: StageOrApplyResult<unknown>;
  expiresInDays?: number | null;
}): Promise<ApprovalLinkResult | null> {
  if (args.result.pending) {
    return createApprovalLink({
      ctx: args.ctx,
      entityType: args.entityType,
      entityId: null,
      summary: args.summary,
      linkType: 'pending_change',
      pendingChangeId: args.result.pendingId,
      expiresInDays: args.expiresInDays,
    });
  }
  const data = args.result.data as { id?: unknown } | null | undefined;
  const id = data?.id;
  if (typeof id !== 'number') return null;
  return createApprovalLink({
    ctx: args.ctx,
    entityType: args.entityType,
    entityId: id,
    summary: args.summary,
    linkType: 'entity',
    expiresInDays: args.expiresInDays,
  });
}

/** Slim shape callers stamp onto their tool envelope. */
export interface ApprovalEnvelope {
  url: string;
  previewUrl: string;
  token: string;
  status: 'pending';
  expiresAt: string | null;
}

/** Format a mintLinkForResult result for inclusion in a tool's JSON output. */
export function approvalEnvelope(link: ApprovalLinkResult | null): ApprovalEnvelope | null {
  if (!link) return null;
  return {
    url: link.approvalUrl,
    previewUrl: link.previewUrl,
    token: link.approvalToken,
    status: 'pending',
    expiresAt: link.expiresAt?.toISOString() ?? null,
  };
}
