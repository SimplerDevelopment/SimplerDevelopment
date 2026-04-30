import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getOrCreateBrainProfile } from '@/lib/brain/profiles';
import { listMeetings, createMeetingFromAdapter } from '@/lib/brain/meetings';
import { listEnabledAdapters } from '@/lib/brain/meeting-sources';

export async function GET(request: Request) {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const { client } = result;
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const meetings = await listMeetings(client.id, {
    status: (status as 'draft' | 'processing' | 'needs_review' | 'approved') ?? undefined,
  });
  return NextResponse.json({ success: true, data: meetings });
}

export async function POST(request: Request) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

  const { client, userId } = result;
  const profile = await getOrCreateBrainProfile(client.id, client.company || 'Company Brain');
  if (!profile.enabled) {
    return NextResponse.json({ success: false, message: 'Company Brain is not enabled for this workspace.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
  }
  const adapterId = typeof body.adapterId === 'string' ? body.adapterId : 'paste';
  const input = body.input;
  if (!input || typeof input !== 'object') {
    return NextResponse.json({ success: false, message: 'Missing adapter input' }, { status: 400 });
  }

  // Adapter must be enabled.
  const adapters = await listEnabledAdapters(profile);
  if (!adapters.some((a) => a.id === adapterId)) {
    return NextResponse.json({ success: false, message: `Adapter "${adapterId}" is not available.` }, { status: 400 });
  }

  // Optional CRM-relationship link at creation time.
  const link: { companyId?: number | null; dealId?: number | null } = {};
  if (typeof body.companyId === 'number') link.companyId = body.companyId;
  if (typeof body.dealId === 'number') link.dealId = body.dealId;
  if (link.companyId != null && link.dealId != null) {
    return NextResponse.json({ success: false, message: 'A communication can link to a company OR a deal, not both.' }, { status: 400 });
  }

  try {
    const meeting = await createMeetingFromAdapter({
      adapterId,
      input,
      ctx: { clientId: client.id, userId, profile },
      link: (link.companyId != null || link.dealId != null) ? link : undefined,
    });
    return NextResponse.json({ success: true, data: meeting });
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: err instanceof Error ? err.message : 'Failed to create communication',
    }, { status: 400 });
  }
}
