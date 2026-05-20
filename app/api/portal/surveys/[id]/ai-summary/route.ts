/**
 * Survey AI summary (AI-01 / AI-02).
 *
 *   GET    — return the cached summary if one exists. Includes a `stale` flag
 *            (true when new responses have arrived since generation).
 *   POST   — generate or regenerate. Returns 409 if already up-to-date unless
 *            `?force=1` is passed. Bills via `recordAiUsage` + plan gate.
 *   DELETE — invalidate the cached row (no-op if none).
 *
 * Persistence: `survey_ai_summaries` is unique on `survey_id`, so each survey
 * gets exactly one cached row. Re-generation upserts via onConflictDoUpdate.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys, surveyResponses, surveyAiSummaries } from '@/lib/db/schema';
import type { SurveyFieldDef } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';
import { generateSurveySummary } from '@/lib/surveys/ai-summary';

async function loadSurveyForClient(surveyId: number, clientId: number) {
  const [row] = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const surveyId = parseId(id);
  if (!surveyId) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const survey = await loadSurveyForClient(surveyId, client.id);
  if (!survey) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  const [row] = await db
    .select()
    .from(surveyAiSummaries)
    .where(eq(surveyAiSummaries.surveyId, surveyId))
    .limit(1);

  if (!row) return NextResponse.json({ success: true, data: null });

  const stale = (row.responseCountAtGeneration ?? 0) < survey.responseCount;
  return NextResponse.json({
    success: true,
    data: {
      summary: row.summary,
      sentiment: row.sentiment,
      themes: row.themes,
      perQuestion: row.perQuestion,
      generatedAt: row.generatedAt,
      responseCountAtGeneration: row.responseCountAtGeneration,
      currentResponseCount: survey.responseCount,
      stale,
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const surveyId = parseId(id);
  if (!surveyId) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const survey = await loadSurveyForClient(surveyId, client.id);
  if (!survey) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  const force = new URL(req.url).searchParams.get('force') === '1';

  // Short-circuit: if a cached summary exists and no new responses have
  // landed, refuse to regenerate (and burn credits) unless force=1.
  const [existing] = await db
    .select()
    .from(surveyAiSummaries)
    .where(eq(surveyAiSummaries.surveyId, surveyId))
    .limit(1);
  if (existing && !force && (existing.responseCountAtGeneration ?? 0) >= survey.responseCount) {
    return NextResponse.json({ success: false, message: 'Summary is up to date', reason: 'fresh' }, { status: 409 });
  }

  const gate = await checkAiPlanGate({ clientId: client.id, provider: 'anthropic' });
  if (!gate.allowed) {
    return NextResponse.json({ success: false, message: gate.message, reason: gate.reason }, { status: 402 });
  }

  const responses = await db
    .select({ answers: surveyResponses.answers })
    .from(surveyResponses)
    .where(eq(surveyResponses.surveyId, surveyId));

  if (responses.length === 0) {
    return NextResponse.json({ success: false, message: 'No responses yet to summarize' }, { status: 400 });
  }

  const resolved = await resolveClientApiKey({ clientId: client.id, provider: 'anthropic' });
  let result;
  try {
    result = await generateSurveySummary({
      fields: (survey.fields ?? []) as SurveyFieldDef[],
      responses,
      apiKey: resolved.key,
    });
  } catch (err) {
    console.error('[POST /api/portal/surveys/[id]/ai-summary]', err);
    return NextResponse.json({ success: false, message: 'AI summary generation failed' }, { status: 502 });
  }

  if (!result) {
    return NextResponse.json(
      { success: false, message: 'No text-type questions with responses — nothing to summarize.' },
      { status: 400 },
    );
  }

  void recordAiUsage({ clientId: client.id, source: resolved.source, tokens: result.tokensUsed });

  const now = new Date();
  await db
    .insert(surveyAiSummaries)
    .values({
      surveyId,
      summary: result.summary,
      sentiment: result.sentiment,
      themes: result.themes,
      perQuestion: result.perQuestion,
      responseCountAtGeneration: survey.responseCount,
      generatedAt: now,
    })
    .onConflictDoUpdate({
      target: surveyAiSummaries.surveyId,
      set: {
        summary: result.summary,
        sentiment: result.sentiment,
        themes: result.themes,
        perQuestion: result.perQuestion,
        responseCountAtGeneration: survey.responseCount,
        generatedAt: now,
      },
    });

  return NextResponse.json({
    success: true,
    data: {
      summary: result.summary,
      sentiment: result.sentiment,
      themes: result.themes,
      perQuestion: result.perQuestion,
      generatedAt: now,
      responseCountAtGeneration: survey.responseCount,
      currentResponseCount: survey.responseCount,
      stale: false,
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const surveyId = parseId(id);
  if (!surveyId) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const survey = await loadSurveyForClient(surveyId, client.id);
  if (!survey) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  await db.delete(surveyAiSummaries).where(eq(surveyAiSummaries.surveyId, surveyId));
  return NextResponse.json({ success: true });
}
