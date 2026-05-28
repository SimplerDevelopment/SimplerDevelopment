import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  listOrgUnits,
  getOrgUnitTree,
  createOrgUnit,
  type CreateOrgUnitInput,
} from '@/lib/brain/org-units';

/**
 * GET /api/portal/brain/org-units?as=tree|flat
 *
 * `as=tree` (default) returns a nested `{ ...unit, children, memberCount }`
 * structure ordered by sortOrder; `as=flat` returns the path-ordered flat
 * list.
 */
export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  const as = url.searchParams.get('as') ?? 'tree';
  if (as !== 'tree' && as !== 'flat') {
    return NextResponse.json(
      { success: false, message: "Invalid 'as'. Allowed: tree | flat" },
      { status: 400 },
    );
  }

  if (as === 'flat') {
    const items = await listOrgUnits(result.client.id);
    return NextResponse.json({ success: true, data: { items } });
  }
  const tree = await getOrgUnitTree(result.client.id);
  return NextResponse.json({ success: true, data: { tree } });
}

/**
 * POST /api/portal/brain/org-units
 *
 * Body: { name, parentId?, description?, leadPersonId?, color?, icon?, sortOrder? }
 */
export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });
  }

  const input: CreateOrgUnitInput = {
    name: body.name,
    parentId: typeof body.parentId === 'number' ? body.parentId : null,
    description: typeof body.description === 'string' ? body.description : null,
    leadPersonId: typeof body.leadPersonId === 'number' ? body.leadPersonId : null,
    color: typeof body.color === 'string' ? body.color : null,
    icon: typeof body.icon === 'string' ? body.icon : null,
    sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
  };

  try {
    const created = await createOrgUnit(result.client.id, result.userId, input);
    return NextResponse.json({ success: true, data: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create org unit';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
