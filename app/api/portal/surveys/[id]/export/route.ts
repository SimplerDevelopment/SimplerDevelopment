import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys, surveyResponses, SurveyFieldDef } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { buildResponseWhere, parseResponseFilters } from '@/lib/surveys/response-filters';

function escapeCsv(val: string): string {
  let s = val;
  // Neutralize spreadsheet formula injection (Excel, Sheets, Numbers).
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  // Apply the same filter params as GET /responses so the CSV the user
  // downloads matches what they see on screen.
  const filters = parseResponseFilters(new URL(req.url));
  const responses = await db.select().from(surveyResponses)
    .where(buildResponseWhere(surveyId, filters))
    .orderBy(desc(surveyResponses.createdAt));

  const fields = (survey.fields || []) as SurveyFieldDef[];
  const questionFields = fields.filter(f => f.type !== 'heading' && f.type !== 'page_break');

  // Union of every answer key seen across responses that ISN'T covered by the
  // structured field schema — these become extra CSV columns so custom-form
  // submissions still export usefully. Keeps a stable order: structured field
  // columns first, then custom keys in first-seen order.
  const knownIds = new Set(questionFields.map(f => f.id));
  const customKeys: string[] = [];
  const seenCustom = new Set<string>();
  for (const r of responses) {
    const a = (r.answers || {}) as Record<string, unknown>;
    for (const k of Object.keys(a)) {
      if (knownIds.has(k) || seenCustom.has(k)) continue;
      seenCustom.add(k);
      customKeys.push(k);
    }
  }

  // Build CSV header
  const headers = [
    '#', 'Date', 'Form', 'Email', 'Name', 'Source',
    ...questionFields.map(f => f.label),
    ...customKeys,
  ];
  const rows = responses.map((r, i) => {
    const answers = (r.answers || {}) as Record<string, unknown>;
    const formatVal = (val: unknown): string => {
      if (val === undefined || val === null) return '';
      if (Array.isArray(val)) return val.join('; ');
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    };
    return [
      String(i + 1),
      r.createdAt ? new Date(r.createdAt).toISOString() : '',
      r.formName || 'main',
      r.respondentEmail || '',
      r.respondentName || '',
      r.source || 'link',
      ...questionFields.map(f => formatVal(answers[f.id])),
      ...customKeys.map(k => formatVal(answers[k])),
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
