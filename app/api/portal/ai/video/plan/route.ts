/**
 * AI Content Engine — POST /api/portal/ai/video/plan
 *
 * Body: { title: string, blogMarkdown: string, linkedinText?: string, videoUrl?: string }
 * Draft-only: devuelve el plan de escenas + caption + video block. No renderiza
 * ni publica nada. Envelope { success, data | message }.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { buildShortPlan } from '@/lib/video/short-plan';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  title: z.string().min(3).max(150),
  blogMarkdown: z.string().min(20).max(12000),
  linkedinText: z.string().max(3000).optional(),
  videoUrl: z.string().url().optional(),
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
  const plan = buildShortPlan(parsed.data);
  return NextResponse.json({ success: true, data: plan });
}
