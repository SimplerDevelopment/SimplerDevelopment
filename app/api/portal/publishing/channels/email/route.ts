/**
 * Publishing Command Center — email channel adapter API (PUB-9).
 *
 * Routes:
 *   GET    ?available=1                            — list draft/scheduled
 *                                                    campaigns owned by the
 *                                                    active client (for the
 *                                                    artifact-picker).
 *   POST   { cardId, campaignId }                  — link a campaign to a card.
 *                                                    Requires `manage_campaigns`.
 *   DELETE ?cardId=...&campaignId=...              — unlink. Requires
 *                                                    `manage_campaigns`.
 *
 * Envelope: { success: true, data? } / { success: false, message }.
 * Tenancy: every operation is scoped to the caller's active client; the
 * adapter additionally re-verifies tenancy on every campaign read/write.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { checkPublishingPermission } from '@/lib/publishing/permissions';
import {
  linkEmailCampaignToCard,
  unlinkEmailCampaignFromCard,
  getAvailableEmailCampaigns,
} from '@/lib/publishing/channels/email';

const linkSchema = z.object({
  cardId: z.number().int().positive(),
  campaignId: z.number().int().positive(),
});

/** Resolve whether the caller is staff (admin/employee on `users.role`) —
 *  needed by `checkPublishingPermission` so staff get implicit grants for
 *  any client they're acting on. The role on the NextAuth session matches
 *  the value on `users.role`. */
async function isStaffSession(): Promise<boolean> {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  return role === 'admin' || role === 'employee';
}

export async function GET(request: Request) {
  const authed = await authorizePortal({ action: 'read' });
  if (isAuthError(authed)) return authed.response;

  const url = new URL(request.url);
  if (url.searchParams.get('available') === '1') {
    const campaigns = await getAvailableEmailCampaigns(authed.client.id);
    return NextResponse.json({ success: true, data: { campaigns } });
  }

  return NextResponse.json(
    { success: false, message: "Missing required query param 'available=1'." },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  const authed = await authorizePortal({ action: 'write' });
  if (isAuthError(authed)) return authed.response;

  const gate = await checkPublishingPermission(
    {
      userId: authed.userId,
      clientId: authed.client.id,
      isStaff: await isStaffSession(),
    },
    'manage_campaigns',
  );
  if (!gate.granted) {
    return NextResponse.json(
      {
        success: false,
        message: `Permission denied (manage_campaigns): ${gate.reason}.`,
      },
      { status: 403 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = linkSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await linkEmailCampaignToCard(
      parsed.data.cardId,
      parsed.data.campaignId,
      authed.client.id,
      authed.userId,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to link campaign';
    // Cross-tenant / not-found errors should surface as 403 / 404 rather than
    // a generic 500 so the UI can show something useful.
    const isTenancy = /does not belong to client/i.test(message);
    const isNotFound = /not found/i.test(message);
    const status = isTenancy ? 403 : isNotFound ? 404 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const authed = await authorizePortal({ action: 'write' });
  if (isAuthError(authed)) return authed.response;

  const gate = await checkPublishingPermission(
    {
      userId: authed.userId,
      clientId: authed.client.id,
      isStaff: await isStaffSession(),
    },
    'manage_campaigns',
  );
  if (!gate.granted) {
    return NextResponse.json(
      {
        success: false,
        message: `Permission denied (manage_campaigns): ${gate.reason}.`,
      },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const cardId = parseInt(url.searchParams.get('cardId') ?? '', 10);
  const campaignId = parseInt(url.searchParams.get('campaignId') ?? '', 10);
  if (!Number.isFinite(cardId) || cardId <= 0 || !Number.isFinite(campaignId) || campaignId <= 0) {
    return NextResponse.json(
      { success: false, message: 'cardId and campaignId query params are required positive integers' },
      { status: 400 },
    );
  }

  await unlinkEmailCampaignFromCard(cardId, campaignId);
  return NextResponse.json({ success: true });
}
