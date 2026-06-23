import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { emitEvent } from '@/lib/automation';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const [survey] = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.id, parseInt(id, 10)), eq(surveys.clientId, client.id)));

  if (!survey) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: survey });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const surveyId = parseInt(id, 10);
  const body = await req.json();

  // Verify ownership
  const [existing] = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, client.id)));
  if (!existing) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.fields !== undefined) updates.fields = body.fields;
  if (body.pages !== undefined) updates.pages = body.pages;
  if (body.status !== undefined) updates.status = body.status;
  if (body.color !== undefined) updates.color = body.color;
  if (body.brandingProfileId !== undefined) updates.brandingProfileId = body.brandingProfileId || null;
  if (body.thankYouTitle !== undefined) updates.thankYouTitle = body.thankYouTitle;
  if (body.thankYouMessage !== undefined) updates.thankYouMessage = body.thankYouMessage;
  if (body.redirectUrl !== undefined) updates.redirectUrl = body.redirectUrl || null;
  if (body.allowMultiple !== undefined) updates.allowMultiple = body.allowMultiple;
  if (body.requireEmail !== undefined) updates.requireEmail = body.requireEmail;
  if (body.publishResults !== undefined) updates.publishResults = !!body.publishResults;
  if (body.certificateEnabled !== undefined) updates.certificateEnabled = !!body.certificateEnabled;
  // DIST-02: opt-in gate field. Accepts null (no consent gate beyond email
  // presence) or a string field id from the survey schema. The cron worker
  // verifies the field actually exists at send time, so we don't reject
  // unknown field ids here — they just result in no sends, which is the
  // safer default.
  if (body.consentField !== undefined) {
    updates.consentField =
      typeof body.consentField === 'string' && body.consentField.trim()
        ? body.consentField.trim().slice(0, 64)
        : null;
  }
  if (body.notifyOnResponse !== undefined) updates.notifyOnResponse = body.notifyOnResponse;
  if (body.notifyDigest !== undefined) updates.notifyDigest = body.notifyDigest;
  if (body.closesAt !== undefined) updates.closesAt = body.closesAt ? new Date(body.closesAt) : null;
  if (body.maxResponses !== undefined) updates.maxResponses = body.maxResponses || null;
  if (body.linkedType !== undefined) updates.linkedType = body.linkedType || null;
  if (body.linkedId !== undefined) updates.linkedId = body.linkedId || null;
  if (body.styling !== undefined) updates.styling = body.styling;
  if (body.recommendation !== undefined) updates.recommendation = body.recommendation;
  // SCORE-02: survey-level scoring config (auto-route-to-CRM rules). Null is
  // allowed (= clear the config). When `autoRouteToCrm.enabled` is true the
  // pipeline/stage IDs and minScore must be numbers — reject otherwise so a
  // misconfigured PATCH can't land an enabled-but-unroutable rule.
  if (body.scoringConfig !== undefined) {
    const sc = body.scoringConfig;
    if (sc === null) {
      updates.scoringConfig = null;
    } else if (typeof sc !== 'object') {
      return NextResponse.json({ success: false, message: 'scoringConfig must be an object or null' }, { status: 400 });
    } else {
      const route = (sc as { autoRouteToCrm?: unknown }).autoRouteToCrm;
      if (route && typeof route === 'object') {
        const r = route as { enabled?: unknown; minScore?: unknown; pipelineId?: unknown; stageId?: unknown };
        if (r.enabled === true) {
          if (typeof r.pipelineId !== 'number' || !Number.isFinite(r.pipelineId)) {
            return NextResponse.json(
              { success: false, message: 'autoRouteToCrm.pipelineId must be a number when enabled' },
              { status: 400 },
            );
          }
          if (typeof r.stageId !== 'number' || !Number.isFinite(r.stageId)) {
            return NextResponse.json(
              { success: false, message: 'autoRouteToCrm.stageId must be a number when enabled' },
              { status: 400 },
            );
          }
          if (typeof r.minScore !== 'number' || !Number.isFinite(r.minScore)) {
            return NextResponse.json(
              { success: false, message: 'autoRouteToCrm.minScore must be a number when enabled' },
              { status: 400 },
            );
          }
        }
      }
      updates.scoringConfig = sc;
    }
  }

  const [updated] = await db
    .update(surveys)
    .set(updates)
    .where(eq(surveys.id, surveyId))
    .returning();

  emitEvent('survey.updated', client.id, userId, { id: updated.id, title: updated.title, status: updated.status });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const surveyId = parseInt(id, 10);
  const [existing] = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, client.id)));
  if (!existing) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  await db.delete(surveys).where(eq(surveys.id, surveyId));

  emitEvent('survey.deleted', client.id, userId, { id: surveyId, title: existing.title });

  return NextResponse.json({ success: true });
}
