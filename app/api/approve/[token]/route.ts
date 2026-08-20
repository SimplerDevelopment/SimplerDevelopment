/**
 * Public approval API. Accepts a 64-hex token minted by `createApprovalLink`
 * and either returns the link's current status (GET) or records an
 * approve/reject decision (POST).
 *
 * The token is the only credential — we DO NOT require a portal session. All
 * lookups are scoped via the link's `clientId`, captured at mint time, so a
 * leaked token cannot reach into other tenants.
 *
 * The approve side-effects themselves live in `lib/mcp/approval-apply.ts` and
 * are shared with the cookie-based `/api/approve/decision` endpoint that the
 * approval bar calls from a real product surface.
 */

import { NextRequest, NextResponse } from 'next/server';
import { lookupApprovalLink, recordReview } from '@/lib/mcp/approval-links';
import { applyDecision, serializeLink } from '@/lib/mcp/approval-apply';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const link = await lookupApprovalLink(token);
  if (!link) {
    return NextResponse.json({ success: false, message: 'Approval link not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: serializeLink(link) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
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

  return NextResponse.json({
    success: true,
    data: updated ? serializeLink(updated) : null,
  });
}
