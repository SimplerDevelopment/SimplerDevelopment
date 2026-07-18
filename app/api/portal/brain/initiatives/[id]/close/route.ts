/**
 * POST /api/portal/brain/initiatives/[id]/close
 * Body: { outcome: 'completed' | 'cancelled', reason?: string, lessonsLearned?: string }
 *
 * Atomic with brain_note creation (lib does Pattern B — txAudit).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { closeInitiative } from '@/lib/brain/initiatives';

const schema = z.object({
  outcome: z.enum(['completed', 'cancelled']),
  reason: z.string().max(5000).optional(),
  lessonsLearned: z.string().max(50_000).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const initiativeId = parseInt(id, 10);
  if (!Number.isFinite(initiativeId) || initiativeId <= 0) {
    return NextResponse.json({ success: false, message: 'Invalid initiative id' }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const closed = await closeInitiative(result.client.id, result.userId, initiativeId, {
      outcome: parsed.data.outcome,
      reason: parsed.data.reason,
      lessonsLearned: parsed.data.lessonsLearned,
    });
    if (!closed) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({
      success: true,
      data: {
        initiative: closed.initiative,
        lessonsLearnedNoteId: closed.lessonsLearnedNoteId,
      },
    });
  } catch (err) {
    console.error('[brain.initiatives.close] failed', { initiativeId, err });
    const message = err instanceof Error ? err.message : 'Close failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
