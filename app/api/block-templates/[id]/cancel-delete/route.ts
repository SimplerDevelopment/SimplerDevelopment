import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { blockTemplates, type BlockTemplateDraft } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function requireAdminOrEditor() {
  const session = await auth();
  if (!session?.user?.id) return { error: 'unauth' as const };
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'editor') return { error: 'forbidden' as const, role };
  return { session, role, userId: parseInt(session.user.id, 10) };
}

function gateResponse(result: Awaited<ReturnType<typeof requireAdminOrEditor>>) {
  if ('error' in result) {
    if (result.error === 'unauth') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }
  return null;
}

/**
 * Clears `draft.pendingDelete` for a block template. If after clearing the
 * draft would be effectively empty (no real edits), the draft is dropped
 * entirely so the row goes back to "in sync with live".
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdminOrEditor();
  const denied = gateResponse(gate);
  if (denied) return denied;
  if ('error' in gate) throw new Error('unreachable'); // gate is now narrowed

  const { id } = await params;
  const templateId = parseInt(id);
  if (isNaN(templateId)) {
    return NextResponse.json(
      { success: false, message: 'Invalid template ID' },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select()
    .from(blockTemplates)
    .where(eq(blockTemplates.id, templateId))
    .limit(1);
  if (!existing) {
    return NextResponse.json(
      { success: false, message: 'Template not found' },
      { status: 404 },
    );
  }
  if (!existing.draft?.pendingDelete) {
    return NextResponse.json(
      { success: false, message: 'No pending deletion to cancel' },
      { status: 400 },
    );
  }

  const prev: BlockTemplateDraft = existing.draft;
  const { pendingDelete: _drop, ...rest } = prev;
  void _drop;
  // If the only thing the draft was tracking was the tombstone, drop the
  // entire draft so the row goes back to "in sync with live".
  const onlyTracksDeletion =
    Object.keys(rest).filter((k) => k !== 'updatedAt' && k !== 'updatedBy').length === 0;

  const nextDraft: BlockTemplateDraft | null = onlyTracksDeletion
    ? null
    : { ...rest, updatedAt: new Date().toISOString(), updatedBy: gate.userId };

  await db
    .update(blockTemplates)
    .set({ draft: nextDraft, updatedAt: new Date() })
    .where(eq(blockTemplates.id, templateId));

  return NextResponse.json({ success: true, data: { id: templateId, draft: nextDraft } });
}
