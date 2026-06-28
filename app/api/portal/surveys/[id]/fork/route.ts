import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

// POST /api/portal/surveys/[id]/fork — duplicate a survey into a new DRAFT row
// tied to the original via parentSurveyId. Portal-REST mirror of the surveys_fork
// MCP tool. The fork starts in draft (so /s/<slug> refuses responses until it's
// activated) with its own slug and responseCount=0; the parent is untouched.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const sourceId = parseInt(id, 10);
  if (Number.isNaN(sourceId))
    return NextResponse.json({ success: false, message: 'Invalid survey id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const titleSuffix = typeof body.titleSuffix === 'string' ? body.titleSuffix : ' (fork)';

  // Scope to the caller's client → forking another tenant's survey 404s.
  const [source] = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.id, sourceId), eq(surveys.clientId, client.id)))
    .limit(1);
  if (!source) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  const baseSlug = source.slug.replace(/-fork-[a-z0-9]+$/i, '');
  const forkSlug = `${baseSlug}-fork-${Date.now().toString(36)}`;

  const [fork] = await db
    .insert(surveys)
    .values({
      clientId: client.id,
      title: `${source.title}${titleSuffix}`,
      slug: forkSlug,
      description: source.description,
      fields: source.fields,
      pages: source.pages,
      thankYouTitle: source.thankYouTitle,
      thankYouMessage: source.thankYouMessage,
      requireEmail: source.requireEmail,
      allowMultiple: source.allowMultiple,
      redirectUrl: source.redirectUrl,
      color: source.color,
      brandingProfileId: source.brandingProfileId,
      styling: source.styling,
      publishResults: source.publishResults,
      certificateEnabled: source.certificateEnabled,
      consentField: source.consentField,
      notifyOnResponse: source.notifyOnResponse,
      notifyDigest: source.notifyDigest,
      recommendation: source.recommendation,
      scoringConfig: source.scoringConfig,
      status: 'draft',
      responseCount: 0,
      createdBy: userId,
      parentSurveyId: source.id,
    })
    .returning();

  return NextResponse.json({ success: true, data: fork }, { status: 201 });
}
