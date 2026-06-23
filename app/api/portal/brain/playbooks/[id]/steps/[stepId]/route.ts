/**
 * GET    /api/portal/brain/playbooks/[id]/steps/[stepId]  — single step
 * PATCH  /api/portal/brain/playbooks/[id]/steps/[stepId]  — update step
 * DELETE /api/portal/brain/playbooks/[id]/steps/[stepId]  — remove step
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brainPlaybookSteps } from '@/lib/db/schema';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  updateStep,
  removeStep,
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

const patchSchema = z.object({
  key: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(10_000).optional().nullable(),
  kind: z.enum(STEP_KINDS).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  condition: conditionSchema.optional(),
  nextStepKeys: z.array(z.string().min(1).max(100)).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

/**
 * Confirm the step belongs to the given playbook + tenant before any
 * mutation. Returns the step row so callers can short-circuit on 404.
 */
async function assertStepScope(
  clientId: number,
  playbookId: number,
  stepId: number,
): Promise<{ id: number } | null> {
  const [row] = await db
    .select({ id: brainPlaybookSteps.id })
    .from(brainPlaybookSteps)
    .where(and(
      eq(brainPlaybookSteps.id, stepId),
      eq(brainPlaybookSteps.playbookId, playbookId),
      eq(brainPlaybookSteps.clientId, clientId),
    ))
    .limit(1);
  return row ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id, stepId } = await params;
  const playbookId = parseId(id);
  const stepIdNum = parseId(stepId);
  if (playbookId === null || stepIdNum === null) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const [step] = await db
    .select()
    .from(brainPlaybookSteps)
    .where(and(
      eq(brainPlaybookSteps.id, stepIdNum),
      eq(brainPlaybookSteps.playbookId, playbookId),
      eq(brainPlaybookSteps.clientId, result.client.id),
    ))
    .limit(1);
  if (!step) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: step });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id, stepId } = await params;
  const playbookId = parseId(id);
  const stepIdNum = parseId(stepId);
  if (playbookId === null || stepIdNum === null) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const scope = await assertStepScope(result.client.id, playbookId, stepIdNum);
  if (!scope) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const updated = await updateStep(result.client.id, result.userId, stepIdNum, {
      key: parsed.data.key,
      name: parsed.data.name,
      description: parsed.data.description,
      kind: parsed.data.kind,
      config: parsed.data.config,
      condition: parsed.data.condition,
      nextStepKeys: parsed.data.nextStepKeys,
      sortOrder: parsed.data.sortOrder,
    });
    if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update step failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id, stepId } = await params;
  const playbookId = parseId(id);
  const stepIdNum = parseId(stepId);
  if (playbookId === null || stepIdNum === null) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const scope = await assertStepScope(result.client.id, playbookId, stepIdNum);
  if (!scope) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  try {
    const ok = await removeStep(result.client.id, result.userId, stepIdNum);
    if (!ok) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: { id: stepIdNum, deleted: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete step failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
