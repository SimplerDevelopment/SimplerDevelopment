import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  listGlossaryTerms,
  createGlossaryTerm,
  type ListGlossaryTermsOpts,
} from '@/lib/brain/glossary';
import type { BrainGlossaryStatus } from '@/lib/db/schema';

const VALID_STATUS = new Set<BrainGlossaryStatus>(['active', 'deprecated']);

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  const statusRaw = url.searchParams.get('status');
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const ownerIdRaw = url.searchParams.get('ownerId');

  if (statusRaw !== null && !VALID_STATUS.has(statusRaw as BrainGlossaryStatus)) {
    return NextResponse.json(
      { success: false, message: `Invalid status. Allowed: ${[...VALID_STATUS].join(', ')}` },
      { status: 400 },
    );
  }

  const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const opts: ListGlossaryTermsOpts = {
    status: statusRaw ? (statusRaw as BrainGlossaryStatus) : undefined,
    category: category?.trim() || undefined,
    search: search?.trim() || undefined,
    ownerId: ownerIdRaw ? parseInt(ownerIdRaw, 10) : undefined,
    limit,
    offset,
  };

  const data = await listGlossaryTerms(result.client.id, opts);
  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }
  if (typeof body.term !== 'string' || !body.term.trim()) {
    return NextResponse.json({ success: false, message: 'term is required' }, { status: 400 });
  }
  if (typeof body.definition !== 'string' || !body.definition.trim()) {
    return NextResponse.json({ success: false, message: 'definition is required' }, { status: 400 });
  }
  if (body.status !== undefined && !VALID_STATUS.has(body.status)) {
    return NextResponse.json(
      { success: false, message: `Invalid status. Allowed: ${[...VALID_STATUS].join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const created = await createGlossaryTerm(result.client.id, result.userId, {
      term: body.term,
      definition: body.definition,
      shortDefinition: typeof body.shortDefinition === 'string' ? body.shortDefinition : undefined,
      aliases: Array.isArray(body.aliases) ? body.aliases.filter((a: unknown) => typeof a === 'string') : undefined,
      status: body.status,
      category: typeof body.category === 'string' ? body.category : undefined,
      ownerId: typeof body.ownerId === 'number' ? body.ownerId : undefined,
      relatedTermIds: Array.isArray(body.relatedTermIds) ? body.relatedTermIds.filter((n: unknown) => typeof n === 'number') : undefined,
      source: body.source === 'ai_suggested' ? 'ai_suggested' : 'manual',
    });
    return NextResponse.json({ success: true, data: created });
  } catch (err) {
    console.error('[brain.glossary] create failed', { clientId: result.client.id, err });
    const message = err instanceof Error ? err.message : 'Create failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
