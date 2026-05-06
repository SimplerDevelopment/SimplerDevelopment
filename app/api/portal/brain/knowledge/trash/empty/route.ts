import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { emptyTrash } from '@/lib/brain/notes';

/**
 * POST /api/portal/brain/knowledge/trash/empty
 *
 * Permanently delete every soft-deleted (trashed) brain note for the active
 * tenant. Cascade purges incoming backlinks, custom field values, per-note
 * audit history, and queues attachment objects for S3 deletion.
 *
 * Auth: requires the 'admin' portal action — empty-trash is irreversible
 * and matches the same scope as a single-note hard-delete.
 */
export async function POST() {
  const result = await authorizePortal({ action: 'admin' });
  if (isAuthError(result)) return result.response;

  try {
    const summary = await emptyTrash(result.client.id, result.userId);
    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    console.error('[brain.knowledge.trash.empty] failed', { clientId: result.client.id, err });
    const message = err instanceof Error ? err.message : 'Empty trash failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
