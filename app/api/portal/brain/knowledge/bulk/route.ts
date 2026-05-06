import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { bulkUpdateNotes, type BulkOp } from '@/lib/brain/notes';

const MAX_BULK = 500;

function parseBulkOp(raw: unknown): BulkOp | null {
  if (!raw || typeof raw !== 'object') return null;
  const op = raw as { kind?: unknown; tags?: unknown; from?: unknown; to?: unknown };
  switch (op.kind) {
    case 'soft_delete':
    case 'restore':
    case 'hard_delete':
      return { kind: op.kind };
    case 'add_tags':
    case 'remove_tags': {
      if (!Array.isArray(op.tags)) return null;
      const tags = op.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
      if (tags.length === 0) return null;
      return { kind: op.kind, tags };
    }
    case 'replace_tag_prefix': {
      if (typeof op.from !== 'string' || typeof op.to !== 'string') return null;
      if (!op.from.trim()) return null;
      return { kind: 'replace_tag_prefix', from: op.from, to: op.to };
    }
    default:
      return null;
  }
}

export async function POST(request: Request) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  const idsRaw = (body as { ids?: unknown }).ids;
  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return NextResponse.json({ success: false, message: 'ids must be a non-empty array' }, { status: 400 });
  }
  const ids = idsRaw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n));
  if (ids.length === 0) {
    return NextResponse.json({ success: false, message: 'ids must contain integers' }, { status: 400 });
  }
  if (ids.length > MAX_BULK) {
    return NextResponse.json({ success: false, message: `Bulk capped at ${MAX_BULK} ids` }, { status: 400 });
  }

  const op = parseBulkOp((body as { op?: unknown }).op);
  if (!op) {
    return NextResponse.json({ success: false, message: 'Invalid op' }, { status: 400 });
  }

  try {
    const summary = await bulkUpdateNotes(result.client.id, ids, op, result.userId);
    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    console.error('[brain.knowledge.bulk] failed', { clientId: result.client.id, op: op.kind, err });
    const message = err instanceof Error ? err.message : 'Bulk update failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
