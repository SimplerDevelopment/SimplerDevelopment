/**
 * GET    /api/portal/brain/initiatives/[id]  — single (+?includeGoals + ?includeLinks)
 * PATCH  /api/portal/brain/initiatives/[id]  — update (status changes refused)
 * DELETE /api/portal/brain/initiatives/[id]  — soft-cancel via closeInitiative
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  getInitiativeById,
  updateInitiative,
  closeInitiative,
} from '@/lib/brain/initiatives';

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const initiativeId = parseId(id);
  if (initiativeId === null) {
    return NextResponse.json({ success: false, message: 'Invalid initiative id' }, { status: 400 });
  }
  const url = new URL(request.url);
  const includeGoals = url.searchParams.get('includeGoals') === 'true';
  const includeLinks = url.searchParams.get('includeLinks') === 'true';

  const data = await getInitiativeById(result.client.id, initiativeId, {
    includeGoals,
    includeLinks,
  });
  if (!data) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

const isoDate = z.preprocess(
  (v) => (typeof v === 'string' && v ? new Date(v) : v ?? undefined),
  z.date().optional().nullable(),
);

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(50_000).optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  ownerId: z.number().int().positive().optional().nullable(),
  sponsorId: z.number().int().positive().optional().nullable(),
  startDate: isoDate,
  targetDate: isoDate,
  confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
  // status not in schema by design — captured below as a pre-check.
}).strict().passthrough();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const initiativeId = parseId(id);
  if (initiativeId === null) {
    return NextResponse.json({ success: false, message: 'Invalid initiative id' }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  if (!json || typeof json !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }
  // Explicit status guard — the lib will throw, but we want a clean 400 here.
  if ('status' in json) {
    return NextResponse.json(
      { success: false, message: 'status changes go through /close or /reopen' },
      { status: 400 },
    );
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const updated = await updateInitiative(result.client.id, result.userId, initiativeId, {
      name: parsed.data.name,
      description: parsed.data.description,
      priority: parsed.data.priority,
      ownerId: parsed.data.ownerId,
      sponsorId: parsed.data.sponsorId,
      startDate: parsed.data.startDate,
      targetDate: parsed.data.targetDate,
      confidentialityLevel: parsed.data.confidentialityLevel,
    });
    if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

/**
 * DELETE is a soft-cancel: routes to closeInitiative with outcome='cancelled'
 * and the sentinel reason='deleted'. There is intentionally no destructive
 * hard-delete in the public API surface — the only way a row disappears is
 * via clientId cascade.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'admin' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const initiativeId = parseId(id);
  if (initiativeId === null) {
    return NextResponse.json({ success: false, message: 'Invalid initiative id' }, { status: 400 });
  }

  try {
    const closed = await closeInitiative(result.client.id, result.userId, initiativeId, {
      outcome: 'cancelled',
      reason: 'deleted',
    });
    if (!closed) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data: { id: initiativeId, status: closed.initiative.status, deleted: 'soft' as const },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
