import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { getKnowledgeGraph } from '@/lib/brain/graph';

/**
 * GET /api/portal/brain/knowledge/graph
 *
 * Returns the wikilink graph for the active client — used by the canvas-based
 * Note Graph view at /portal/brain/knowledge/graph. Tenant-scoped via
 * requireBrainEntitlement() like the sibling knowledge route.
 *
 * Query params:
 *   - `tag`         (optional) filter nodes to those tagged with `tag`
 *   - `orphansOnly` (optional, "true"/"false") return only nodes with no
 *                   incoming edges (true orphans)
 *   - `includeCrm`  (optional, "true"/"false") also emit CRM company/contact/
 *                   deal nodes and brain meeting nodes for any anchors set on
 *                   the loaded notes, with note→entity edges
 *
 * Response: { success: true, data: { nodes, edges, truncated } }
 */
export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');
  const orphansOnly = url.searchParams.get('orphansOnly') === 'true';
  const includeCrm = url.searchParams.get('includeCrm') === 'true';

  const graph = await getKnowledgeGraph(result.client.id, {
    tag: tag && tag.trim() ? tag.trim() : undefined,
    orphansOnly,
    includeCrm,
  });

  return NextResponse.json({ success: true, data: graph });
}
