/**
 * Partial-response capture (RESP-02).
 *
 *   GET  /api/surveys/[slug]/partial?sessionId=<uuid>
 *        Returns the saved in-progress state for this session, or `null` if
 *        nothing has been saved (or the session is already completed).
 *
 *   POST /api/surveys/[slug]/partial
 *        Upserts the partial row for (survey, sessionId). Body:
 *          { sessionId, answers, lastPage, respondentEmail?, source?, sourceId? }
 *
 * Same CORS posture as the parent submit endpoint — sandboxed iframes call
 * this with `Origin: null`, so `Access-Control-Allow-Origin: *` is required.
 * No auth (it's a public form), so the only handle on a partial row is the
 * randomly-generated sessionId.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { surveys, surveyPartialResponses } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function corsJson(body: unknown, init?: ResponseInit) {
  const res = NextResponse.json(body, init);
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

// sessionIds are generated client-side from crypto.randomUUID() (36 chars)
// but we accept anything sane to avoid coupling to a specific format. Cap at
// the DB column width (varchar(64)) and reject empties.
function validateSessionId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length === 0 || s.length > 64) return null;
  // Conservative whitelist — sessionIds shouldn't have anything exotic.
  if (!/^[A-Za-z0-9_.\-]+$/.test(s)) return null;
  return s;
}

async function loadActiveSurvey(slug: string) {
  const [survey] = await db
    .select({ id: surveys.id, status: surveys.status })
    .from(surveys)
    .where(eq(surveys.slug, slug))
    .limit(1);
  return survey ?? null;
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sessionId = validateSessionId(new URL(req.url).searchParams.get('sessionId'));
  if (!sessionId) return corsJson({ success: true, data: null });

  const survey = await loadActiveSurvey(slug);
  if (!survey) return corsJson({ success: false, message: 'Survey not found' }, { status: 404 });

  const [partial] = await db
    .select({
      answers: surveyPartialResponses.answers,
      lastPage: surveyPartialResponses.lastPage,
      respondentEmail: surveyPartialResponses.respondentEmail,
      completed: surveyPartialResponses.completed,
      updatedAt: surveyPartialResponses.updatedAt,
    })
    .from(surveyPartialResponses)
    .where(
      and(
        eq(surveyPartialResponses.surveyId, survey.id),
        eq(surveyPartialResponses.sessionId, sessionId),
      ),
    )
    .limit(1);

  // A completed partial means the visitor already submitted under this
  // session — don't resume; they'd just resubmit. Return null so the client
  // treats it as a fresh start.
  if (!partial || partial.completed) return corsJson({ success: true, data: null });

  return corsJson({
    success: true,
    data: {
      answers: partial.answers,
      lastPage: partial.lastPage,
      respondentEmail: partial.respondentEmail,
      updatedAt: partial.updatedAt,
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return corsJson({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  const sessionId = validateSessionId(body.sessionId);
  if (!sessionId) return corsJson({ success: false, message: 'Invalid sessionId' }, { status: 400 });

  const answers = body.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return corsJson({ success: false, message: 'answers must be an object' }, { status: 400 });
  }

  const lastPageRaw = body.lastPage;
  const lastPage =
    typeof lastPageRaw === 'number' && Number.isFinite(lastPageRaw) && lastPageRaw >= 0
      ? Math.floor(lastPageRaw)
      : 0;

  const survey = await loadActiveSurvey(slug);
  if (!survey) return corsJson({ success: false, message: 'Survey not found' }, { status: 404 });
  // Closed/draft surveys shouldn't accumulate partials — the visitor can't
  // submit anyway, so saving progress is wasted writes.
  if (survey.status !== 'active') {
    return corsJson({ success: false, message: 'Survey is not active' }, { status: 403 });
  }

  const respondentEmail =
    typeof body.respondentEmail === 'string' && body.respondentEmail.trim()
      ? body.respondentEmail.trim().slice(0, 255)
      : null;
  const source = typeof body.source === 'string' ? body.source.slice(0, 30) : 'link';
  const sourceId = typeof body.sourceId === 'string' ? body.sourceId.slice(0, 255) : null;

  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || null;
  const ua = hdrs.get('user-agent')?.slice(0, 1024) || null;

  await db
    .insert(surveyPartialResponses)
    .values({
      surveyId: survey.id,
      sessionId,
      answers: answers as Record<string, unknown>,
      lastPage,
      respondentEmail,
      source,
      sourceId,
      ipAddress: ip,
      userAgent: ua,
    })
    .onConflictDoUpdate({
      target: [surveyPartialResponses.surveyId, surveyPartialResponses.sessionId],
      set: {
        answers: answers as Record<string, unknown>,
        lastPage,
        respondentEmail,
        source,
        sourceId,
        // Refresh client metadata on every save so support can see the latest
        // user-agent if a partial is later flagged for abuse.
        ipAddress: ip,
        userAgent: ua,
        updatedAt: new Date(),
      },
    });

  return corsJson({ success: true });
}
