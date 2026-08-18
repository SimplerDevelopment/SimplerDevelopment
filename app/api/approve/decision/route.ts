/**
 * Cookie-based approval decision endpoint — what the approval bar calls from a
 * real product surface.
 *
 * Why this exists alongside `/api/approve/[token]`: the bar renders ON the
 * artifact, and on a site page that artifact carries author-controlled
 * `customJs`. If the bar held the raw approval token in its props, the token
 * would sit in the DOM where the author's own script could scrape it and
 * self-approve their own draft. So the bar holds nothing, and the credential
 * stays in the httpOnly cookie that JS cannot read.
 *
 * This is also the ONLY path allowed through the middleware write gate while an
 * approval cookie is present (APPROVAL_SHIMMED_PATHS) — it is the one write a
 * reviewer is meant to make.
 */

import { NextRequest, NextResponse } from 'next/server';
import { recordReview } from '@/lib/mcp/approval-links';
import { applyDecision, serializeLink } from '@/lib/mcp/approval-apply';
import { readApprovalToken } from '@/lib/mcp/approval-mode';
import { lookupApprovalLink } from '@/lib/mcp/approval-links';
import { APPROVAL_COOKIE } from '@/lib/mcp/approval-cookie';
import { resolveApprovalAuthority } from '@/lib/mcp/approval-authority';

/**
 * Capability probe for the bar (PUX-078). Viewing an artifact does not require a
 * session, so the bar has to ask whether THIS viewer may actually decide before
 * it offers Approve/Reject.
 */
export async function GET() {
  const token = await readApprovalToken();
  if (!token) return NextResponse.json({ success: false, canDecide: false }, { status: 401 });
  const link = await lookupApprovalLink(token);
  if (!link) return NextResponse.json({ success: false, canDecide: false }, { status: 404 });

  const authority = await resolveApprovalAuthority(link.clientId);
  return NextResponse.json({
    success: true,
    canDecide: authority.canDecide,
    reason: authority.canDecide ? null : authority.reason,
    reviewerName: authority.canDecide ? authority.reviewerName : null,
  });
}

export async function POST(req: NextRequest) {
  const token = await readApprovalToken();
  if (!token) {
    return NextResponse.json(
      { success: false, message: 'No active approval session. Re-open your approval link.' },
      { status: 401 },
    );
  }

  // The cookie is a pointer; the row is authoritative. Re-read it so a link that
  // was decided or expired since the cookie was minted cannot be decided again.
  const link = await lookupApprovalLink(token);
  if (!link) {
    return NextResponse.json({ success: false, message: 'Approval link not found' }, { status: 404 });
  }
  if (link.status !== 'pending') {
    return NextResponse.json(
      { success: false, message: `This link has already been ${link.status}.` },
      { status: 400 },
    );
  }

  // PUX-078: holding the link is enough to LOOK at the draft, but deciding
  // requires a signed-in user with owner/admin access to the owning client.
  // Checked before the body is read — an unauthorized caller gets no further.
  const authority = await resolveApprovalAuthority(link.clientId);
  if (!authority.canDecide) {
    return NextResponse.json(
      {
        success: false,
        reason: authority.reason,
        message:
          authority.reason === 'unauthenticated'
            ? 'Sign in to approve or reject this draft.'
            : 'Your account does not have permission to approve this.',
      },
      { status: authority.reason === 'unauthenticated' ? 401 : 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: 'approve' | 'reject';
    reviewNote?: string;
  };

  if (body.action !== 'approve' && body.action !== 'reject') {
    return NextResponse.json(
      { success: false, message: 'action must be "approve" or "reject"' },
      { status: 400 },
    );
  }

  const applied = await applyDecision(link, body.action);
  if (!applied.ok) {
    return NextResponse.json(
      { success: false, message: applied.message },
      { status: applied.status },
    );
  }

  const updated = await recordReview({
    token,
    decision: body.action === 'approve' ? 'approved' : 'rejected',
    // Identity comes from the authenticated account, never the request body.
    reviewerName: authority.reviewerName,
    reviewerEmail: authority.reviewerEmail,
    reviewNote: body.reviewNote?.trim() || null,
  });

  const res = NextResponse.json({
    success: true,
    data: updated ? serializeLink(updated) : null,
  });

  // The link is spent — drop the cookie so the reviewer's next request is an
  // ordinary public visit rather than a draft view that resolveApprovalContext
  // would reject anyway.
  res.cookies.delete(APPROVAL_COOKIE);
  return res;
}
