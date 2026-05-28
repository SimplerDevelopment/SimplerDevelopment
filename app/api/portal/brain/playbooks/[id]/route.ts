/**
 * GET    /api/portal/brain/playbooks/[id]  — single playbook + steps
 * PATCH  /api/portal/brain/playbooks/[id]  — update (status changes refused)
 * DELETE /api/portal/brain/playbooks/[id]  — hard delete (?force=true to cascade runs)
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  getPlaybookById,
  updatePlaybook,
  deletePlaybook,
} from '@/lib/brain/playbooks';

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const playbookId = parseId(id);
  if (playbookId === null) {
    return NextResponse.json({ success: false, message: 'Invalid playbook id' }, { status: 400 });
  }

  const data = await getPlaybookById(result.client.id, playbookId);
  if (!data) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

const triggerConfigSchema = z.object({
  event: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  cron: z.string().optional(),
}).strict().nullable().optional();

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(10_000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  ownerId: z.number().int().positive().optional().nullable(),
  triggerKind: z.enum(['manual', 'event', 'scheduled']).optional(),
  triggerConfig: triggerConfigSchema,
  defaultTopicIds: z.array(z.number().int().positive()).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const playbookId = parseId(id);
  if (playbookId === null) {
    return NextResponse.json({ success: false, message: 'Invalid playbook id' }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  if (!json || typeof json !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }
  // Explicit status guard — lib throws too, but cleaner 400 from here.
  if ('status' in json) {
    return NextResponse.json(
      { success: false, message: 'status changes go through /activate or /archive' },
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
    const updated = await updatePlaybook(result.client.id, result.userId, playbookId, {
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      ownerId: parsed.data.ownerId,
      triggerKind: parsed.data.triggerKind,
      triggerConfig: parsed.data.triggerConfig ?? undefined,
      defaultTopicIds: parsed.data.defaultTopicIds,
    });
    if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'admin' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const playbookId = parseId(id);
  if (playbookId === null) {
    return NextResponse.json({ success: false, message: 'Invalid playbook id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

  try {
    const ok = await deletePlaybook(result.client.id, result.userId, playbookId, { force });
    if (!ok) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({
      success: true,
      data: { id: playbookId, deleted: true, forced: force },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
