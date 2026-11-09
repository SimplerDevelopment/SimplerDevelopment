/**
 * Publishing Command Center — LinkedIn channel API (Fase 2).
 *
 *   GET    ?available=1 — drafts del usuario (para el artifact-picker).
 *   POST   { cardId, postId } — link draft a tarjeta. Requiere `manage_campaigns`.
 *   DELETE ?cardId=...&postId=... — unlink. Requiere `manage_campaigns`.
 *
 * Envelope { success, data? } / { success: false, message }.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { checkPublishingPermission } from '@/lib/publishing/permissions';
import {
  getAvailableLinkedinDrafts,
  linkLinkedinDraftToCard,
  unlinkLinkedinDraftFromCard,
} from '@/lib/publishing/channels/linkedin';

const linkSchema = z.object({
  cardId: z.number().int().positive(),
  postId: z.number().int().positive(),
});

async function isStaffSession(): Promise<boolean> {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  return role === 'admin' || role === 'employee';
}

export async function GET(request: Request) {
  const authed = await authorizePortal({ action: 'read', scope: 'linkedin:read' });
  if (isAuthError(authed)) return authed.response;

  const url = new URL(request.url);
  if (url.searchParams.get('available') === '1') {
    const drafts = await getAvailableLinkedinDrafts(authed.client.id, authed.userId);
    return NextResponse.json({ success: true, data: { drafts } });
  }
  return NextResponse.json(
    { success: false, message: "Missing required query param 'available=1'." },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  const authed = await authorizePortal({ action: 'write', scope: 'linkedin:write' });
  if (isAuthError(authed)) return authed.response;

  const gate = await checkPublishingPermission(
    { userId: authed.userId, clientId: authed.client.id, isStaff: await isStaffSession() },
    'manage_campaigns',
  );
  if (!gate.granted) {
    return NextResponse.json(
      { success: false, message: `Permission denied (manage_campaigns): ${gate.reason}.` },
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
    await linkLinkedinDraftToCard(parsed.data.cardId, parsed.data.postId, authed.client.id, authed.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to link draft';
    const isTenancy = /does not belong to client/i.test(message);
    const isNotFound = /not found/i.test(message);
    return NextResponse.json({ success: false, message }, { status: isTenancy ? 403 : isNotFound ? 404 : 400 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const authed = await authorizePortal({ action: 'write', scope: 'linkedin:write' });
  if (isAuthError(authed)) return authed.response;

  const gate = await checkPublishingPermission(
    { userId: authed.userId, clientId: authed.client.id, isStaff: await isStaffSession() },
    'manage_campaigns',
  );
  if (!gate.granted) {
    return NextResponse.json(
      { success: false, message: `Permission denied (manage_campaigns): ${gate.reason}.` },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const cardId = parseInt(url.searchParams.get('cardId') ?? '', 10);
  const postId = parseInt(url.searchParams.get('postId') ?? '', 10);
  if (!Number.isFinite(cardId) || cardId <= 0 || !Number.isFinite(postId) || postId <= 0) {
    return NextResponse.json(
      { success: false, message: 'cardId and postId query params are required positive integers' },
      { status: 400 },
    );
  }
  await unlinkLinkedinDraftFromCard(cardId, postId);
  return NextResponse.json({ success: true });
}
