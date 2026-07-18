/**
 * GET   /api/portal/brain/playbooks/[id]/steps      — list steps in order
 * POST  /api/portal/brain/playbooks/[id]/steps      — add a step
 * PATCH /api/portal/brain/playbooks/[id]/steps      — reorder; body { orderedStepIds: number[] }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  getPlaybookById,
  addStep,
  reorderSteps,
} from '@/lib/brain/playbooks';

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const STEP_KINDS = ['task', 'note', 'meeting', 'decision', 'review_item', 'wait', 'branch'] as const;
const COND_OPS = ['eq', 'neq', 'in', 'not_in', 'exists', 'not_exists', 'gt', 'lt'] as const;

const conditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(COND_OPS),
  value: z.unknown().optional(),
}).nullable();

const addStepSchema = z.object({
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(10_000).optional().nullable(),
  kind: z.enum(STEP_KINDS),
  config: z.record(z.string(), z.unknown()).optional(),
  condition: conditionSchema.optional(),
  nextStepKeys: z.array(z.string().min(1).max(100)).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const reorderSchema = z.object({
  orderedStepIds: z.array(z.number().int().positive()).min(1),
});

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
  return NextResponse.json({ success: true, data: { items: data.steps } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const playbookId = parseId(id);
  if (playbookId === null) {
    return NextResponse.json({ success: false, message: 'Invalid playbook id' }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const parsed = addStepSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const step = await addStep(result.client.id, result.userId, playbookId, {
      key: parsed.data.key,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      kind: parsed.data.kind,
      config: parsed.data.config,
      condition: parsed.data.condition ?? null,
      nextStepKeys: parsed.data.nextStepKeys,
      sortOrder: parsed.data.sortOrder,
    });
    return NextResponse.json({ success: true, data: step });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Add step failed';
    const isClient = /not found in tenant|is required|duplicate/i.test(message);
    return NextResponse.json({ success: false, message }, { status: isClient ? 400 : 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const playbookId = parseId(id);
  if (playbookId === null) {
    return NextResponse.json({ success: false, message: 'Invalid playbook id' }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const parsed = reorderSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const items = await reorderSteps(result.client.id, result.userId, playbookId, parsed.data.orderedStepIds);
    return NextResponse.json({ success: true, data: { items } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reorder failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
