/**
 * GET /api/portal/brain/documents/[id]/compliance-report
 *
 * Canonical "who's read this and who hasn't" view. Cached for 30s via
 * unstable_cache when available; falls back to uncached on platforms where
 * Next's cache surface isn't reachable (e.g. tests).
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { complianceReport } from '@/lib/brain/document-acks';

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Try to use Next's unstable_cache when present. We resolve it lazily so
// tests (where the import surface may be incomplete) still work — falling
// back to a direct call when the helper isn't usable.
async function getCached(
  clientId: number,
  documentId: number,
): Promise<Awaited<ReturnType<typeof complianceReport>>> {
  try {
    const next = await import('next/cache');
    const unstable = (next as { unstable_cache?: unknown }).unstable_cache;
    if (typeof unstable === 'function') {
      const fn = unstable as <T>(
        cb: () => Promise<T>,
        keys: string[],
        opts: { revalidate?: number; tags?: string[] },
      ) => () => Promise<T>;
      const cached = fn(
        () => complianceReport(clientId, documentId),
        [`brain-doc-compliance-${clientId}-${documentId}`],
        { revalidate: 30, tags: [`brain-doc-${documentId}`] },
      );
      return await cached();
    }
  } catch {
    // fall through
  }
  return complianceReport(clientId, documentId);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const documentId = parseId(id);
  if (documentId === null) {
    return NextResponse.json({ success: false, message: 'Invalid document id' }, { status: 400 });
  }

  const report = await getCached(result.client.id, documentId);
  if (!report) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: report });
}
