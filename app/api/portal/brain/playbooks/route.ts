/**
 * GET  /api/portal/brain/playbooks      — list (filters + pagination)
 * POST /api/portal/brain/playbooks      — create
 *
 * Auth: NextAuth + active portal client + brain entitlement.
 * Envelope: { success: true, data } / { success: false, message }.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  listPlaybooks,
  createPlaybook,
  type ListPlaybooksOpts,
  type BrainPlaybookStatus,
  type BrainPlaybookTriggerKind,
} from '@/lib/brain/playbooks';

const STATUSES: BrainPlaybookStatus[] = ['draft', 'active', 'archived'];
const TRIGGER_KINDS: BrainPlaybookTriggerKind[] = ['manual', 'event', 'scheduled'];

function isStatus(s: string | null): s is BrainPlaybookStatus {
  return s !== null && (STATUSES as readonly string[]).includes(s);
}
function isTriggerKind(s: string | null): s is BrainPlaybookTriggerKind {
  return s !== null && (TRIGGER_KINDS as readonly string[]).includes(s);
}

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);

  const statusRaw = url.searchParams.get('status');
  if (statusRaw !== null && !isStatus(statusRaw)) {
    return NextResponse.json(
      { success: false, message: `Invalid status. Allowed: ${STATUSES.join(', ')}` },
      { status: 400 },
    );
  }
  const triggerKindRaw = url.searchParams.get('triggerKind');
  if (triggerKindRaw !== null && !isTriggerKind(triggerKindRaw)) {
    return NextResponse.json(
      { success: false, message: `Invalid triggerKind. Allowed: ${TRIGGER_KINDS.join(', ')}` },
      { status: 400 },
    );
  }

  const category = url.searchParams.get('category');
  const ownerIdRaw = url.searchParams.get('ownerId');
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const opts: ListPlaybooksOpts = { limit, offset };
  if (isStatus(statusRaw)) opts.status = statusRaw;
  if (isTriggerKind(triggerKindRaw)) opts.triggerKind = triggerKindRaw;
  if (category) opts.category = category;
  if (ownerIdRaw) {
    const n = parseInt(ownerIdRaw, 10);
    if (Number.isFinite(n)) opts.ownerId = n;
  }

  const items = await listPlaybooks(result.client.id, opts);
  return NextResponse.json({ success: true, data: { items, limit, offset } });
}

const triggerConfigSchema = z.object({
  event: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  cron: z.string().optional(),
}).strict().nullable().optional();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(10_000).optional().nullable(),
  triggerKind: z.enum(['manual', 'event', 'scheduled']).optional(),
  triggerConfig: triggerConfigSchema,
  category: z.string().max(100).optional().nullable(),
  ownerId: z.number().int().positive().optional().nullable(),
  defaultTopicIds: z.array(z.number().int().positive()).optional(),
});

export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const created = await createPlaybook(result.client.id, result.userId, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      triggerKind: parsed.data.triggerKind,
      triggerConfig: parsed.data.triggerConfig ?? null,
      category: parsed.data.category ?? null,
      ownerId: parsed.data.ownerId ?? null,
      defaultTopicIds: parsed.data.defaultTopicIds,
    });
    return NextResponse.json({ success: true, data: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Create failed';
    console.error('[brain.playbooks] create failed', { clientId: result.client.id, err });
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
