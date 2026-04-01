import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { surveys, surveyResponses } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { emitEvent } from '@/lib/automation';
import { headers } from 'next/headers';

// Public GET — fetch survey for rendering
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [survey] = await db
    .select({
      id: surveys.id,
      title: surveys.title,
      description: surveys.description,
      fields: surveys.fields,
      color: surveys.color,
      status: surveys.status,
      requireEmail: surveys.requireEmail,
      closesAt: surveys.closesAt,
      maxResponses: surveys.maxResponses,
      responseCount: surveys.responseCount,
      thankYouTitle: surveys.thankYouTitle,
      thankYouMessage: surveys.thankYouMessage,
      redirectUrl: surveys.redirectUrl,
    })
    .from(surveys)
    .where(eq(surveys.slug, slug));

  if (!survey) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });
  if (survey.status !== 'active') return NextResponse.json({ success: false, message: 'Survey is not active' }, { status: 403 });
  if (survey.closesAt && new Date(survey.closesAt) < new Date()) return NextResponse.json({ success: false, message: 'Survey is closed' }, { status: 403 });
  if (survey.maxResponses && survey.responseCount >= survey.maxResponses) return NextResponse.json({ success: false, message: 'Survey has reached maximum responses' }, { status: 403 });

  return NextResponse.json({ success: true, data: survey });
}

// Public POST — submit a response
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [survey] = await db.select().from(surveys).where(eq(surveys.slug, slug));
  if (!survey) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });
  if (survey.status !== 'active') return NextResponse.json({ success: false, message: 'Survey is not active' }, { status: 403 });
  if (survey.closesAt && new Date(survey.closesAt) < new Date()) return NextResponse.json({ success: false, message: 'Survey is closed' }, { status: 403 });
  if (survey.maxResponses && survey.responseCount >= survey.maxResponses) return NextResponse.json({ success: false, message: 'Survey has reached maximum responses' }, { status: 403 });

  const { answers, email, name, source, sourceId } = await req.json();
  if (!answers || typeof answers !== 'object') return NextResponse.json({ success: false, message: 'Answers are required' }, { status: 400 });

  if (survey.requireEmail && !email?.trim()) {
    return NextResponse.json({ success: false, message: 'Email is required' }, { status: 400 });
  }

  // Validate required fields
  const fields = (survey.fields || []) as { id: string; required: boolean; label: string; type: string }[];
  for (const field of fields) {
    if (field.required && field.type !== 'heading') {
      const val = answers[field.id];
      if (val === undefined || val === null || val === '') {
        return NextResponse.json({ success: false, message: `${field.label} is required` }, { status: 400 });
      }
    }
  }

  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || null;
  const ua = hdrs.get('user-agent') || null;

  const [response] = await db.insert(surveyResponses).values({
    surveyId: survey.id,
    answers,
    respondentEmail: email?.trim() || null,
    respondentName: name?.trim() || null,
    source: source || 'link',
    sourceId: sourceId || null,
    ipAddress: ip,
    userAgent: ua,
    completedAt: new Date(),
  }).returning();

  // Increment response count
  await db.update(surveys)
    .set({ responseCount: sql`${surveys.responseCount} + 1`, updatedAt: new Date() })
    .where(eq(surveys.id, survey.id));

  emitEvent('survey.response_submitted', survey.clientId, 0, {
    surveyId: survey.id,
    responseId: response.id,
    surveyTitle: survey.title,
    respondentEmail: response.respondentEmail,
    source: response.source,
  });

  return NextResponse.json({
    success: true,
    data: {
      thankYouTitle: survey.thankYouTitle,
      thankYouMessage: survey.thankYouMessage,
      redirectUrl: survey.redirectUrl,
    },
  }, { status: 201 });
}
