/**
 * Per-survey webhook collection (HOOK-01).
 *
 * GET  — list webhooks for the survey (secrets redacted)
 * POST — create a new webhook; full secret returned once on creation
 *
 * All operations are tenant-scoped via the survey → client check.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys, surveyWebhooks } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { generateWebhookSecret } from '@/lib/survey-webhooks/dispatcher';
import { validateWebhookUrl } from '@/lib/ssrf-guard';

const ALLOWED_EVENTS = ['response.submitted', '*'] as const;
type Allowed = (typeof ALLOWED_EVENTS)[number];

function sanitizeEvents(input: unknown): Allowed[] {
  if (!Array.isArray(input)) return ['response.submitted'];
  const seen = new Set<Allowed>();
  for (const v of input) {
    if (typeof v === 'string' && (ALLOWED_EVENTS as readonly string[]).includes(v)) {
      seen.add(v as Allowed);
    }
  }
  return seen.size > 0 ? Array.from(seen) : ['response.submitted'];
}

function redactSecret<T extends { secret: string | null }>(row: T): T {
  if (!row.secret) return row;
  return { ...row, secret: row.secret.slice(0, 6) + '…' };
}

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

  const rows = await db.select().from(surveyWebhooks)
    .where(eq(surveyWebhooks.surveyId, surveyId))
    .orderBy(desc(surveyWebhooks.createdAt));

  return NextResponse.json({ success: true, data: rows.map(redactSecret) });
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
  const { url, events, enabled } = body as { url?: unknown; events?: unknown; enabled?: unknown };

  if (typeof url !== 'string' || !url.trim()) {
    return NextResponse.json({ success: false, message: 'URL is required' }, { status: 400 });
  }
  const check = validateWebhookUrl(url);
  if (!check.ok) {
    return NextResponse.json({ success: false, message: check.reason }, { status: 400 });
  }

  const secret = generateWebhookSecret();
  const [row] = await db.insert(surveyWebhooks).values({
    surveyId,
    url: url.slice(0, 500),
    secret,
    events: sanitizeEvents(events),
    enabled: typeof enabled === 'boolean' ? enabled : true,
    createdBy: userId,
  }).returning();

  // Return the full secret on creation only — subsequent reads redact it.
  return NextResponse.json({ success: true, data: row }, { status: 201 });
}
