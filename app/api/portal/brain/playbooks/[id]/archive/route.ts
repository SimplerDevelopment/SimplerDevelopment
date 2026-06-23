/**
 * POST /api/portal/brain/playbooks/[id]/archive  (?force=true)
 *
 * Flips status to 'archived'. Refuses if active/pending/paused runs exist
 * unless force=true.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { archivePlaybook } from '@/lib/brain/playbooks';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const playbookId = parseInt(id, 10);
  if (!Number.isFinite(playbookId) || playbookId <= 0) {
    return NextResponse.json({ success: false, message: 'Invalid playbook id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

  try {
    const updated = await archivePlaybook(result.client.id, result.userId, playbookId, { force });
    if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Archive failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
