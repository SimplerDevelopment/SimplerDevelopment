/**
 * Brain topics — list / create.
 *
 *   GET  ?as=tree   → nested tree with childCount / entityCount
 *   GET  ?as=flat   → flat list ordered by path (default)
 *   GET  ?tagPrefix=foo → filter the flat list by leading path segment
 *                         (used by the import-from-tags preview UI)
 *   POST            → create a topic { name, parentId?, description?, color?,
 *                                       icon?, sortOrder?, derivedFromTag? }
 *
 * Phase 1 brain-restructure (Wave 2b).
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { listTopics, getTopicTree, createTopic } from '@/lib/brain/topics';

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  const as = url.searchParams.get('as') ?? 'flat';
  const tagPrefix = url.searchParams.get('tagPrefix')?.trim() || undefined;

  if (as === 'tree') {
    const tree = await getTopicTree(result.client.id);
    return NextResponse.json({ success: true, data: { tree } });
  }

  const items = await listTopics(result.client.id);
  const filtered = tagPrefix
    ? items.filter((t) => t.path === `/${tagPrefix}` || t.path.startsWith(`/${tagPrefix}/`))
    : items;
  return NextResponse.json({ success: true, data: { items: filtered, total: filtered.length } });
}

export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });
  }

  try {
    const created = await createTopic(result.client.id, result.userId, {
      name: body.name,
      parentId: typeof body.parentId === 'number' ? body.parentId : null,
      description: typeof body.description === 'string' ? body.description : null,
      color: typeof body.color === 'string' ? body.color : null,
      icon: typeof body.icon === 'string' ? body.icon : null,
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
      derivedFromTag: typeof body.derivedFromTag === 'string' ? body.derivedFromTag : null,
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Create failed';
    const status = /not found/i.test(message) ? 400 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
