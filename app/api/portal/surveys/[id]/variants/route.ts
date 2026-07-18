/**
 * Per-survey A/B variants collection.
 *
 * GET  — list variants for the survey (ordered by id ASC for stable display).
 * POST — create a new variant. Body: `{ name, fields?, weight?, enabled? }`.
 *
 * Authorization: portal session + `surveys` service. Tenant-scoped via the
 * survey → client check (the same pattern the webhooks routes use).
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys, surveyVariants } from '@/lib/db/schema';
import type { SurveyFieldDef } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

async function loadSurveyForClient(surveyId: number, clientId: number) {
  const [row] = await db.select().from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

function clampWeight(input: unknown): number {
  const n = typeof input === 'number' ? input : parseInt(String(input ?? ''), 10);
  if (!Number.isFinite(n)) return 50;
  // Postgres integer column tolerates well into the millions, but a sane upper
  // bound keeps the renormalized split readable in the UI.
  return Math.max(1, Math.min(10000, Math.round(n)));
}

function sanitizeFields(input: unknown): SurveyFieldDef[] {
  if (!Array.isArray(input)) return [];
  // Trust the survey field shape — the editor produces it; the validator on
  // the public POST handler enforces required-field semantics at submit time.
  return input as SurveyFieldDef[];
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

  const rows = await db.select().from(surveyVariants)
    .where(eq(surveyVariants.surveyId, surveyId))
    .orderBy(asc(surveyVariants.id));

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

  const body = await req.json().catch(() => ({}));
  const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!rawName) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });
  if (rawName.length > 100) return NextResponse.json({ success: false, message: 'Name must be 100 characters or fewer' }, { status: 400 });

  // When the caller doesn't supply fields, clone the survey's current default
  // field set so the new variant starts as a faithful copy ready to diverge.
  const fields = body?.fields !== undefined
    ? sanitizeFields(body.fields)
    : sanitizeFields(survey.fields);

  const [row] = await db.insert(surveyVariants).values({
    surveyId,
    name: rawName,
    fields,
    weight: clampWeight(body?.weight ?? 50),
    enabled: typeof body?.enabled === 'boolean' ? body.enabled : true,
  }).returning();

  return NextResponse.json({ success: true, data: row }, { status: 201 });
}
