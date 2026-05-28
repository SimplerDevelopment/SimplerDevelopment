/**
 * GET /api/portal/brain/playbook-runs — list runs (filters + pagination)
 *
 * Auth: NextAuth + active portal client + brain entitlement.
 * Envelope: { success: true, data } / { success: false, message }.
 *
 * Filters:
 *   status     — single status or comma-separated list
 *   playbookId — restrict to one playbook
 *   entityType + entityId — restrict to runs anchored to that polymorphic entity
 *   limit, offset — pagination
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { listRuns, type ListRunsOpts } from '@/lib/brain/playbook-runs';

const RUN_STATUSES = ['pending', 'active', 'paused', 'completed', 'aborted', 'failed'] as const;
type RunStatus = (typeof RUN_STATUSES)[number];

const LINK_ENTITY_TYPES = ['initiative', 'person', 'crm_company', 'crm_deal', 'meeting', 'decision'] as const;
type LinkEntityType = (typeof LINK_ENTITY_TYPES)[number];

function isRunStatus(s: string): s is RunStatus {
  return (RUN_STATUSES as readonly string[]).includes(s);
}
function isLinkEntityType(s: string): s is LinkEntityType {
  return (LINK_ENTITY_TYPES as readonly string[]).includes(s);
}

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  const opts: ListRunsOpts = {};

  const statusRaw = url.searchParams.get('status');
  if (statusRaw) {
    const parts = statusRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const valid = parts.filter(isRunStatus);
    if (valid.length !== parts.length) {
      return NextResponse.json(
        { success: false, message: `Invalid status. Allowed: ${RUN_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }
    opts.status = valid.length === 1 ? valid[0] : valid;
  }

  const playbookIdRaw = url.searchParams.get('playbookId');
  if (playbookIdRaw) {
    const n = parseInt(playbookIdRaw, 10);
    if (Number.isFinite(n) && n > 0) opts.playbookId = n;
  }

  const entityTypeRaw = url.searchParams.get('entityType');
  const entityIdRaw = url.searchParams.get('entityId');
  if (entityTypeRaw && entityIdRaw) {
    if (!isLinkEntityType(entityTypeRaw)) {
      return NextResponse.json(
        { success: false, message: `Invalid entityType. Allowed: ${LINK_ENTITY_TYPES.join(', ')}` },
        { status: 400 },
      );
    }
    const eid = parseInt(entityIdRaw, 10);
    if (!Number.isFinite(eid) || eid <= 0) {
      return NextResponse.json({ success: false, message: 'Invalid entityId' }, { status: 400 });
    }
    opts.entityType = entityTypeRaw;
    opts.entityId = eid;
  }

  const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10);
  opts.limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 50;
  opts.offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const items = await listRuns(result.client.id, opts);
  return NextResponse.json({
    success: true,
    data: { items, limit: opts.limit, offset: opts.offset },
  });
}
