import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys, surveyResponses, SurveyFieldDef } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
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
  const [survey] = await db.select().from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, client.id)));
  if (!survey) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  const responses = await db.select().from(surveyResponses)
    .where(eq(surveyResponses.surveyId, surveyId))
    .orderBy(desc(surveyResponses.createdAt));

  const fields = (survey.fields || []) as SurveyFieldDef[];
  const questionFields = fields.filter(f => f.type !== 'heading' && f.type !== 'page_break');

  // Build CSV header
  const headers = ['#', 'Date', 'Email', 'Name', 'Source', ...questionFields.map(f => f.label)];
  const rows = responses.map((r, i) => {
    const answers = (r.answers || {}) as Record<string, unknown>;
    return [
      String(i + 1),
      r.createdAt ? new Date(r.createdAt).toISOString() : '',
      r.respondentEmail || '',
      r.respondentName || '',
      r.source || 'link',
      ...questionFields.map(f => {
        const val = answers[f.id];
        if (val === undefined || val === null) return '';
        if (Array.isArray(val)) return val.join('; ');
        return String(val);
      }),
    ];
  });

  const csv = [headers.map(escapeCsv).join(','), ...rows.map(row => row.map(escapeCsv).join(','))].join('\n');

  const filename = `${survey.title.replace(/[^a-zA-Z0-9]/g, '_')}_responses.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
