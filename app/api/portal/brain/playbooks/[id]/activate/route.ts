/**
 * POST /api/portal/brain/playbooks/[id]/activate
 *
 * Validates the step DAG before flipping status. Returns 400 with the
 * validator's error list when invalid.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { activatePlaybook, validatePlaybookDag } from '@/lib/brain/playbooks';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const playbookId = parseInt(id, 10);
  if (!Number.isFinite(playbookId) || playbookId <= 0) {
    return NextResponse.json({ success: false, message: 'Invalid playbook id' }, { status: 400 });
  }

  // Pre-run the DAG validator so the failure path can return the structured
  // error list to the editor (rather than just the joined string the lib
  // throws). activatePlaybook re-runs it internally — that's fine, cheap,
  // and keeps the lib defensible if a caller bypasses this route.
  const dag = await validatePlaybookDag(result.client.id, playbookId);
  if (!dag.valid) {
    return NextResponse.json(
      { success: false, message: 'Playbook DAG invalid', errors: dag.errors },
      { status: 400 },
    );
  }

  try {
    const updated = await activatePlaybook(result.client.id, result.userId, playbookId);
    if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Activate failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
