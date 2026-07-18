// POST /api/public/ab/event — record a goal event from the client tracker.
//
// Body: { experimentId: number, variantKey: string, visitorId: string, kind: 'goal' | 'view' }
//
// Best-effort rate limit: at most one row per (experiment, visitor, kind)
// — we de-duplicate on insert by checking for any existing row with the
// same triple. Real abuse mitigation lives at the edge; this only stops
// dashboard-padding from a single visitor hammering the endpoint.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { abEvents, abExperiments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

const ALLOWED_KINDS = new Set(['goal', 'view']);
const VISITOR_RE = /^[a-zA-Z0-9-]{8,64}$/;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
  }

  const payload = body as {
    experimentId?: unknown;
    variantKey?: unknown;
    visitorId?: unknown;
    kind?: unknown;
  };

  const experimentId = typeof payload.experimentId === 'number' ? payload.experimentId : Number(payload.experimentId);
  const variantKey = typeof payload.variantKey === 'string' ? payload.variantKey.slice(0, 8) : '';
  const visitorId = typeof payload.visitorId === 'string' ? payload.visitorId : '';
  const kind = typeof payload.kind === 'string' ? payload.kind : 'goal';

  if (!Number.isFinite(experimentId) || experimentId <= 0) {
    return NextResponse.json({ success: false, error: 'invalid_experiment_id' }, { status: 400 });
  }
  if (!variantKey || !ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ success: false, error: 'invalid_payload' }, { status: 400 });
  }
  if (!VISITOR_RE.test(visitorId)) {
    return NextResponse.json({ success: false, error: 'invalid_visitor' }, { status: 400 });
  }

  // Confirm the experiment exists + is running. We accept events for
  // 'completed' too so late-arriving clients don't get rejected during the
  // moment a dashboard is being viewed. Drafts/archived are rejected.
  const [experiment] = await db
    .select({ id: abExperiments.id, status: abExperiments.status })
    .from(abExperiments)
    .where(eq(abExperiments.id, experimentId))
    .limit(1);

  if (!experiment) {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }
  if (experiment.status !== 'running' && experiment.status !== 'completed') {
    return NextResponse.json({ success: false, error: 'not_active' }, { status: 409 });
  }

  // De-dupe on (experiment, visitor, kind). For 'goal' events we want at
  // most one — that's how lift is computed. For 'view' we ALSO collapse to
  // one per visitor; otherwise a bookmarked refresh cycle would skew the
  // funnel.
  const [existing] = await db
    .select({ id: abEvents.id })
    .from(abEvents)
    .where(and(
      eq(abEvents.experimentId, experimentId),
      eq(abEvents.visitorId, visitorId),
      eq(abEvents.kind, kind),
    ))
    .limit(1);

  if (existing) {
    return NextResponse.json({ success: true, data: { duplicated: true } });
  }

  await db.insert(abEvents).values({ experimentId, variantKey, visitorId, kind });
  return NextResponse.json({ success: true, data: { recorded: true } });
}
