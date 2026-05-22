/**
 * GET  /api/portal/brain/initiatives        — list (filters + pagination)
 * POST /api/portal/brain/initiatives        — create
 *
 * Auth: NextAuth + active portal client + brain entitlement.
 * Envelope: { success: true, data } / { success: false, message }.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  listInitiatives,
  createInitiative,
  type ListInitiativesOpts,
  type BrainInitiativeStatus,
  type BrainInitiativePriority,
} from '@/lib/brain/initiatives';

const STATUSES: BrainInitiativeStatus[] = ['planned', 'active', 'paused', 'completed', 'cancelled'];
const PRIORITIES: BrainInitiativePriority[] = ['low', 'medium', 'high', 'critical'];

function isStatus(s: string | null): s is BrainInitiativeStatus {
  return s !== null && (STATUSES as readonly string[]).includes(s);
}
function isPriority(s: string | null): s is BrainInitiativePriority {
  return s !== null && (PRIORITIES as readonly string[]).includes(s);
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
  const priorityRaw = url.searchParams.get('priority');
  if (priorityRaw !== null && !isPriority(priorityRaw)) {
    return NextResponse.json(
      { success: false, message: `Invalid priority. Allowed: ${PRIORITIES.join(', ')}` },
      { status: 400 },
    );
  }

  const ownerIdRaw = url.searchParams.get('ownerId');
  const targetDateBeforeRaw = url.searchParams.get('targetDateBefore');
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const opts: ListInitiativesOpts = { limit, offset };
  if (isStatus(statusRaw)) opts.status = statusRaw;
  if (isPriority(priorityRaw)) opts.priority = priorityRaw;
  if (ownerIdRaw) {
    const n = parseInt(ownerIdRaw, 10);
    if (Number.isFinite(n)) opts.ownerId = n;
  }
  if (url.searchParams.get('hasOpenGoals') === 'true') opts.hasOpenGoals = true;
  if (targetDateBeforeRaw) {
    const t = new Date(targetDateBeforeRaw);
    if (!Number.isNaN(t.getTime())) opts.targetDateBefore = t;
  }

  const items = await listInitiatives(result.client.id, opts);
  return NextResponse.json({ success: true, data: { items, limit, offset } });
}

const isoDate = z.preprocess(
  (v) => (typeof v === 'string' && v ? new Date(v) : v ?? undefined),
  z.date().optional().nullable(),
);

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(50_000).optional().nullable(),
  status: z.enum(['planned', 'active', 'paused', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  ownerId: z.number().int().positive().optional().nullable(),
  sponsorId: z.number().int().positive().optional().nullable(),
  startDate: isoDate,
  targetDate: isoDate,
  confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
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

  const created = await createInitiative(result.client.id, result.userId, {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    status: parsed.data.status,
    priority: parsed.data.priority,
    ownerId: parsed.data.ownerId ?? null,
    sponsorId: parsed.data.sponsorId ?? null,
    startDate: parsed.data.startDate ?? null,
    targetDate: parsed.data.targetDate ?? null,
    confidentialityLevel: parsed.data.confidentialityLevel,
  });

  return NextResponse.json({ success: true, data: created });
}
