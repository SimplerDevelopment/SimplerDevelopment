/**
 * POST /api/portal/brain/topics/import-from-tags
 *   Body: { tagPrefix?: string, dryRun?: boolean }
 *
 * Read distinct tag strings from `brain_notes.tags`, find-or-create a topic
 * chain per tag (`/`-separated tags become a hierarchical chain), and attach
 * each note bearing the tag to the leaf topic. Idempotent — re-running creates
 * no duplicates. `dryRun: true` returns the report without writes.
 *
 * Phase 1 brain-restructure (Wave 2b).
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { importTopicsFromTags } from '@/lib/brain/topics';

export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const body = await request.json().catch(() => ({}));
  const tagPrefix = body && typeof body.tagPrefix === 'string' && body.tagPrefix.trim() ? body.tagPrefix.trim() : undefined;
  const dryRun = body?.dryRun === true;

  const report = await importTopicsFromTags(result.client.id, result.userId, { tagPrefix, dryRun });
  return NextResponse.json({ success: true, data: report });
}
