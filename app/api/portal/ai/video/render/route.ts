/**
 * AI video render jobs — POST /api/portal/ai/video/render
 *
 * Body: { plan: ShortPlan, driver?: 'local-script'|'server', aspect?: '16x9'|'4x5' }
 * Stateless: returns the deterministic job (id + steps + handoff artifacts).
 * Renders nothing server-side — see lib/video/render-jobs.ts.
 * Envelope: { success, data | message }.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { buildRenderJob } from '@/lib/video/render-jobs';

export const dynamic = 'force-dynamic';

const sceneSchema = z.object({
  index: z.number().int().min(0),
  kind: z.enum(['hook', 'point', 'demo', 'cta']),
  heading: z.string().max(120),
  body: z.string().max(500),
  durationSec: z.number().positive().max(60),
});

const bodySchema = z.object({
  plan: z.object({
    title: z.string().min(3).max(150),
    scenes: z.array(sceneSchema).min(2).max(6),
    totalDurationSec: z.number().positive(),
    linkedinCaption: z.string().max(2800),
    videoBlock: z.object({
      type: z.literal('video'),
      url: z.string(),
      caption: z.string(),
      autoplay: z.boolean(),
      controls: z.boolean(),
    }),
  }),
  driver: z.enum(['local-script', 'server']).optional(),
  aspect: z.enum(['16x9', '4x5']).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  return NextResponse.json({ success: true, data: buildRenderJob(parsed.data) });
}
