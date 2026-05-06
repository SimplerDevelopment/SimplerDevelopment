import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import {
  getSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  SavedSearchForbiddenError,
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const { id } = await params;
  const savedId = parseInt(id, 10);
  if (Number.isNaN(savedId)) {
    return NextResponse.json({ success: false, message: 'Invalid saved-search id' }, { status: 400 });
  }
  const row = await getSavedSearch(result.client.id, savedId);
  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: row });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

  const { id } = await params;
  const savedId = parseInt(id, 10);
  if (Number.isNaN(savedId)) {
    return NextResponse.json({ success: false, message: 'Invalid saved-search id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  const patch: Parameters<typeof updateSavedSearch>[2] = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 150) {
      return NextResponse.json({ success: false, message: 'name must be 1-150 characters' }, { status: 400 });
    }
    patch.name = body.name;
  }
  if (body.icon !== undefined) {
    if (typeof body.icon !== 'string' || body.icon.length > 50) {
      return NextResponse.json({ success: false, message: 'icon must be a string up to 50 chars' }, { status: 400 });
    }
    patch.icon = body.icon;
  }
  if (body.filters !== undefined) {
    const filters = parseFilters(body.filters);
    if (!filters) {
      return NextResponse.json({ success: false, message: 'invalid filters' }, { status: 400 });
    }
    patch.filters = filters;
  }
  if (body.sortOrder !== undefined) {
    if (typeof body.sortOrder !== 'number' || !Number.isFinite(body.sortOrder)) {
      return NextResponse.json({ success: false, message: 'sortOrder must be a number' }, { status: 400 });
    }
    patch.sortOrder = body.sortOrder;
  }
  if (body.scope !== undefined) {
    if (body.scope === 'shared') patch.userId = null;
    else if (body.scope === 'personal') patch.userId = result.userId;
    else {
      return NextResponse.json({ success: false, message: 'scope must be "shared" or "personal"' }, { status: 400 });
    }
  }

  try {
    const updated = await updateSavedSearch(result.client.id, savedId, patch, result.userId);
    if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof SavedSearchForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    console.error('[brain.saved-searches] update failed', { savedId, clientId: result.client.id, err });
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

  const { id } = await params;
  const savedId = parseInt(id, 10);
  if (Number.isNaN(savedId)) {
    return NextResponse.json({ success: false, message: 'Invalid saved-search id' }, { status: 400 });
  }

  try {
    const ok = await deleteSavedSearch(result.client.id, savedId, result.userId);
    if (!ok) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof SavedSearchForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    console.error('[brain.saved-searches] delete failed', { savedId, clientId: result.client.id, err });
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
