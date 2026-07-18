/**
 * DIST-01 / DIST-02 — per-survey email follow-up sequence (item).
 *
 * PUT    — partial update (subject / bodyHtml / delayHours / condition /
 *           enabled). Updating a sequence does NOT replay sends for already-
 *           submitted responses; new behavior takes effect for future eligible
 *           responses only.
 * DELETE — remove the sequence. Cascade clears its
 *           survey_email_sequence_sends audit rows, which is fine — those
 *           only exist to prevent double-sends, not for analytics.
 *
 * Tenant-scoped via the survey → client check.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys, surveyEmailSequences } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { parseSequenceInput, type SequenceInput } from '@/lib/surveys/email-sequence-input';

async function loadForClient(surveyId: number, sequenceId: number, clientId: number) {
  const [survey] = await db.select().from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, clientId)))
    .limit(1);
  if (!survey) return null;

  const [seq] = await db.select().from(surveyEmailSequences)
    .where(and(eq(surveyEmailSequences.id, sequenceId), eq(surveyEmailSequences.surveyId, surveyId)))
    .limit(1);
  if (!seq) return null;

  return { survey, seq };
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; sequenceId: string }> },
) {
  const { id, sequenceId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const found = await loadForClient(parseInt(id, 10), parseInt(sequenceId, 10), client.id);
  if (!found) return NextResponse.json({ success: false, message: 'Sequence not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as SequenceInput;
  const parsed = parseSequenceInput(body, 'update');
  if (!parsed.ok) return NextResponse.json({ success: false, message: parsed.message }, { status: 400 });

  if (Object.keys(parsed.values).length === 0) {
    return NextResponse.json({ success: false, message: 'No fields to update' }, { status: 400 });
  }

  const [row] = await db.update(surveyEmailSequences)
    .set(parsed.values)
    .where(eq(surveyEmailSequences.id, found.seq.id))
    .returning();

  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; sequenceId: string }> },
) {
  const { id, sequenceId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const found = await loadForClient(parseInt(id, 10), parseInt(sequenceId, 10), client.id);
  if (!found) return NextResponse.json({ success: false, message: 'Sequence not found' }, { status: 404 });

  await db.delete(surveyEmailSequences).where(eq(surveyEmailSequences.id, found.seq.id));

  return NextResponse.json({ success: true });
}
