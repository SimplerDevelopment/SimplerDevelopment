/**
 * POST /api/portal/brain/playbooks/[id]/start
 * Body: {
 *   label: string,                                                 // required
 *   context?: Record<string, unknown>,                             // variables for step templating
 *   triggerPayload?: Record<string, unknown>,                      // event payload (for event-triggered runs)
 *   links?: Array<{ entityType, entityId }>,                       // polymorphic anchors
 * }
 *
 * Lives under `/playbooks/[id]/start` (not `/playbook-runs/start`) because
 * starting a run conceptually belongs to the playbook resource. Wave 2a
 * also owns the rest of `/playbooks/**`; this endpoint is Wave 2b's only
 * touch inside that tree.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { startRun } from '@/lib/brain/playbook-runs';

const LINK_TYPES = ['initiative', 'person', 'crm_company', 'crm_deal', 'meeting', 'decision'] as const;

const schema = z.object({
  label: z.string().min(1).max(255),
  context: z.record(z.string(), z.unknown()).optional(),
  triggerPayload: z.record(z.string(), z.unknown()).optional(),
  links: z.array(z.object({
    entityType: z.enum(LINK_TYPES),
    entityId: z.number().int().positive(),
  })).optional(),
});

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
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
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const out = await startRun(result.client.id, result.userId, {
      playbookId,
      label: parsed.data.label,
      context: parsed.data.context,
      triggerPayload: parsed.data.triggerPayload,
      links: parsed.data.links,
    });
    return NextResponse.json({ success: true, data: out });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Start failed';
    console.error('[brain.playbooks.start] failed', { playbookId, err: message });
    // 404 if not found, 400 for any other validation-style error.
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
