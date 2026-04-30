import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clientWebsites, httpRequestLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * POST /api/logs/ingest
 *
 * Public endpoint called by client website middleware to report HTTP request logs.
 * Authenticated by LOG_API_KEY header (per-site secret).
 */
export async function POST(req: Request) {
  const apiKey = req.headers.get('x-log-api-key');
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing x-log-api-key header' }, { status: 401 });
  }

  // Look up the website by API key
  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(eq(clientWebsites.logApiKey, apiKey))
    .limit(1);

  if (!site) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  const body = await req.json();
  const entries: Array<{
    method: string;
    path: string;
    statusCode: number;
    duration: number;
    userAgent?: string;
    referer?: string;
    ip?: string;
    country?: string;
  }> = Array.isArray(body) ? body : body.logs || [body];

  if (entries.length === 0) {
    return NextResponse.json({ ok: true, ingested: 0 });
  }

  // Cap at 100 per batch
  const batch = entries.slice(0, 100);

  await db.insert(httpRequestLogs).values(
    batch.map((e) => ({
      websiteId: site.id,
      method: (e.method || 'GET').substring(0, 10),
      path: (e.path || '/').substring(0, 2000),
      statusCode: e.statusCode || 0,
      duration: e.duration || 0,
      userAgent: e.userAgent?.substring(0, 500) || null,
      referer: e.referer?.substring(0, 500) || null,
      ip: e.ip?.substring(0, 45) || null,
      country: e.country?.substring(0, 2) || null,
    })),
  );

  return NextResponse.json({ ok: true, ingested: batch.length });
}
