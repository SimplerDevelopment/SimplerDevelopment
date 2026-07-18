import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  listSavedSearches,
  createSavedSearch,
  type BrainSavedSearchFilters,
} from '@/lib/brain/saved-searches';

const VALID_SORT = new Set(['updated', 'created', 'title']);
const VALID_ORDER = new Set(['asc', 'desc']);

function parseFilters(raw: unknown): BrainSavedSearchFilters | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  const out: BrainSavedSearchFilters = {};
  if (typeof f.search === 'string') out.search = f.search;
  if (typeof f.tagPrefix === 'string') out.tagPrefix = f.tagPrefix;
  if (Array.isArray(f.tags)) {
    out.tags = f.tags.filter((t): t is string => typeof t === 'string');
  }
  if (typeof f.pinnedOnly === 'boolean') out.pinnedOnly = f.pinnedOnly;
  if (typeof f.trashed === 'boolean') out.trashed = f.trashed;
  if (typeof f.sort === 'string' && VALID_SORT.has(f.sort)) {
    out.sort = f.sort as BrainSavedSearchFilters['sort'];
  }
  if (typeof f.order === 'string' && VALID_ORDER.has(f.order)) {
    out.order = f.order as BrainSavedSearchFilters['order'];
  }
  return out;
}

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  const scope = url.searchParams.get('userId');

  // mine = caller's personal pins only
  // shared = team pins only (userId IS NULL)
  // all (default) = caller's personal + shared (the natural read scope)
  if (scope === 'shared') {
    const items = await listSavedSearches(result.client.id, { userId: null });
    return NextResponse.json({ success: true, data: { items } });
  }

  if (scope === 'mine') {
    const all = await listSavedSearches(result.client.id, { userId: result.userId });
    const items = all.filter(r => r.userId === result.userId);
    return NextResponse.json({ success: true, data: { items } });
  }

  const items = await listSavedSearches(result.client.id, { userId: result.userId });
  return NextResponse.json({ success: true, data: { items } });
}

export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 150) {
    return NextResponse.json(
      { success: false, message: 'name is required (1-150 characters)' },
      { status: 400 },
    );
  }

  const filters = parseFilters(body.filters);
  if (!filters) {
    return NextResponse.json(
      { success: false, message: 'filters object is required' },
      { status: 400 },
    );
  }

  const icon = typeof body.icon === 'string' && body.icon.length <= 50 ? body.icon : 'bookmark';
  const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : 0;

  // Scope: 'shared' (team) or 'personal' (default).
  let userId: number | null = result.userId;
  if (body.scope === 'shared' || body.userId === null) userId = null;

  try {
    const created = await createSavedSearch({
      clientId: result.client.id,
      userId,
      name,
      icon,
      filters,
      sortOrder,
      createdBy: result.userId,
    });
    return NextResponse.json({ success: true, data: created });
  } catch (err) {
    console.error('[brain.saved-searches] create failed', { clientId: result.client.id, err });
    const message = err instanceof Error ? err.message : 'Create failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
