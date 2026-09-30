import { NextRequest, NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { renderBlocksToEmailHtml, buildCampaignHtml } from '@/lib/email';

export async function POST(req: NextRequest) {
  // role-matrix: email drafts are member+ (this renders the campaign editor's preview).
  // observeRole keeps the raised bar log-only until AUTH_ROLE_ENFORCE=1.
  const authResult = await authorizePortal({ action: 'write', observeRole: true, requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const body = await req.json();
  const { blockContent } = body;

  if (!blockContent?.blocks) {
    return NextResponse.json({ success: false, message: 'blockContent.blocks is required' }, { status: 400 });
  }

  const innerHtml = renderBlocksToEmailHtml(blockContent.blocks);
  const html = buildCampaignHtml(innerHtml, '#', blockContent.previewText);

  return NextResponse.json({ success: true, data: { html } });
}
