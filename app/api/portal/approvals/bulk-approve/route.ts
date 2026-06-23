import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { db } from '@/lib/db';
import { mcpPendingChanges } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { applyPendingChange } from '@/lib/mcp/approvals';

const MAX_BATCH = 25;

interface ItemResult {
  id: number;
  status: 'applied' | 'failed' | 'skipped';
  error?: string;
}

/**
 * Serially approve a batch of pending MCP changes. Each item is its own
 * mini-transaction — a single failure does not roll back earlier applies.
 * Cap: 25 per call.
 */
export async function POST(req: Request) {
  // Bearer-aware (mobile) + NextAuth (web). action:'admin' enforces the
  // owner/admin gate that previously lived in an explicit role check.
  const authResult = await authorizePortal({ action: 'admin' });
  if (isAuthError(authResult)) return authResult.response;
  const { client, userId } = authResult;

  const body = await req.json().catch(() => ({} as { ids?: unknown; note?: unknown }));
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((n: unknown): n is number => typeof n === 'number' && Number.isFinite(n))
    : [];
  const note = typeof body.note === 'string' ? body.note : null;

  if (ids.length === 0) {
    return NextResponse.json({ success: false, message: 'Provide ids: number[]' }, { status: 400 });
  }
  if (ids.length > MAX_BATCH) {
    return NextResponse.json(
      { success: false, message: `Batch size exceeds limit of ${MAX_BATCH}. Split across multiple calls.` },
      { status: 400 },
    );
  }

  // Pull every target in one query, ownership-scoped.
  const changes = await db
    .select()
    .from(mcpPendingChanges)
    .where(and(eq(mcpPendingChanges.clientId, client.id), inArray(mcpPendingChanges.id, ids)));

  const byId = new Map(changes.map((c) => [c.id, c]));
  const results: ItemResult[] = [];

  // Serial apply — predictable ordering, kind to downstream APIs (Resend/S3).
  for (const id of ids) {
    const change = byId.get(id);
    if (!change) {
      results.push({ id, status: 'skipped', error: 'Not found' });
      continue;
    }
    if (change.status !== 'pending') {
      results.push({ id, status: 'skipped', error: `Status is ${change.status}` });
      continue;
    }

    try {
      await applyPendingChange(change, client.id, userId);
      await db
        .update(mcpPendingChanges)
        .set({
          status: 'applied',
          reviewerId: userId,
          reviewedAt: new Date(),
          reviewNote: note,
          appliedAt: new Date(),
        })
        .where(eq(mcpPendingChanges.id, id));
      results.push({ id, status: 'applied' });
    } catch (err) {
      const message = (err as Error).message;
      await db
        .update(mcpPendingChanges)
        .set({
          status: 'failed',
          reviewerId: userId,
          reviewedAt: new Date(),
          reviewNote: note,
          errorMessage: message,
        })
        .where(eq(mcpPendingChanges.id, id));
      results.push({ id, status: 'failed', error: message });
    }
  }

  try { revalidatePath('/portal', 'layout'); } catch { /* ignore */ }
  // Invalidate the per-client approvals-count cache used by the layout bell.
  try { revalidateTag(`approvals:${client.id}`, 'max'); } catch { /* ignore */ }

  const applied = results.filter((r) => r.status === 'applied').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  return NextResponse.json({
    success: true,
    data: { total: ids.length, applied, failed, skipped, results },
  });
}
