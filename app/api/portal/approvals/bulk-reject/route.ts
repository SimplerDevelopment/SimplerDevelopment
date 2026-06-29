import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { db } from '@/lib/db';
import { mcpPendingChanges } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

const MAX_BATCH = 25;

interface ItemResult {
  id: number;
  status: 'rejected' | 'skipped';
  error?: string;
}

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

  const changes = await db
    .select({ id: mcpPendingChanges.id, status: mcpPendingChanges.status })
    .from(mcpPendingChanges)
    .where(and(eq(mcpPendingChanges.clientId, client.id), inArray(mcpPendingChanges.id, ids)));

  const byId = new Map(changes.map((c) => [c.id, c]));
  const toReject: number[] = [];
  const results: ItemResult[] = [];

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
    toReject.push(id);
    results.push({ id, status: 'rejected' });
  }

  if (toReject.length > 0) {
    await db
      .update(mcpPendingChanges)
      .set({
        status: 'rejected',
        reviewerId: userId,
        reviewedAt: new Date(),
        reviewNote: note,
      })
      .where(
        and(
          eq(mcpPendingChanges.clientId, client.id),
          inArray(mcpPendingChanges.id, toReject),
        ),
      );
  }

  const rejected = results.filter((r) => r.status === 'rejected').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  if (rejected > 0) {
    try { revalidateTag(`approvals:${client.id}`, 'max'); } catch { /* ignore */ }
  }

  return NextResponse.json({
    success: true,
    data: { total: ids.length, rejected, skipped, results },
  });
}
