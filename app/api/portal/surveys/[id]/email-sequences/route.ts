/**
 * DIST-01 / DIST-02 — per-survey email follow-up sequences (collection).
 *
 * GET  — list sequences for the survey, oldest delay first.
 * POST — create a new sequence.
 *
 * Tenant-scoped via the survey → client check. Mirrors the webhooks route
 * shape so the UI panel is symmetric.
 *
 * The cron worker at /api/cron/process-survey-email-followups picks rows
 * out of `surveyEmailSequences` independently; this endpoint just shapes
 * the input and validates ownership.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys, surveyEmailSequences } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { parseSequenceInput, type SequenceInput } from '@/lib/surveys/email-sequence-input';

async function loadSurveyForClient(surveyId: number, clientId: number) {
  const [row] = await db.select().from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const surveyId = parseInt(id, 10);
  const survey = await loadSurveyForClient(surveyId, client.id);
  if (!survey) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  // Order by delay ascending so the UI can render them as a "timeline" without
  // sorting client-side; ties broken by id (creation order) for determinism.
  const rows = await db.select().from(surveyEmailSequences)
    .where(eq(surveyEmailSequences.surveyId, surveyId))
    .orderBy(asc(surveyEmailSequences.delayHours), asc(surveyEmailSequences.id));

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const surveyId = parseInt(id, 10);
  const survey = await loadSurveyForClient(surveyId, client.id);
  if (!survey) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as SequenceInput;
  const parsed = parseSequenceInput(body, 'create');
  if (!parsed.ok) return NextResponse.json({ success: false, message: parsed.message }, { status: 400 });

  const [row] = await db.insert(surveyEmailSequences).values({
    surveyId,
    subject: parsed.values.subject as string,
    bodyHtml: parsed.values.bodyHtml as string,
    delayHours: (parsed.values.delayHours as number | undefined) ?? 0,
    conditionField: (parsed.values.conditionField as string | null | undefined) ?? null,
    conditionValue: (parsed.values.conditionValue as string | null | undefined) ?? null,
    enabled: (parsed.values.enabled as boolean | undefined) ?? true,
  }).returning();

  return NextResponse.json({ success: true, data: row }, { status: 201 });
}
