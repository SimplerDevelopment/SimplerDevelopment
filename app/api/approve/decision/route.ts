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

  const body = (await req.json().catch(() => ({}))) as {
    action?: 'approve' | 'reject';
    reviewerName?: string;
    reviewerEmail?: string;
    reviewNote?: string;
  };

  if (body.action !== 'approve' && body.action !== 'reject') {
    return NextResponse.json(
      { success: false, message: 'action must be "approve" or "reject"' },
      { status: 400 },
    );
  }
  if (!body.reviewerName || !body.reviewerName.trim()) {
    return NextResponse.json(
      { success: false, message: 'reviewerName is required' },
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
    reviewerName: body.reviewerName.trim(),
    reviewerEmail: body.reviewerEmail?.trim() || null,
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
