/**
 * GET  /api/portal/brain/documents     — list (filters + pagination, slim rows)
 * POST /api/portal/brain/documents     — create (seeds v1 draft with empty body)
 *
 * Auth: NextAuth + active portal client + brain entitlement.
 * Envelope: { success: true, data } / { success: false, message }.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  listDocuments,
  createDocument,
  type ListDocumentsOpts,
  type BrainDocumentStatus,
  type BrainDocumentCategory,
} from '@/lib/brain/documents';

const STATUSES: BrainDocumentStatus[] = ['draft', 'published', 'archived'];
const CATEGORIES: BrainDocumentCategory[] = ['sop', 'policy', 'guide', 'reference', 'announcement', 'other'];

function isStatus(s: string | null): s is BrainDocumentStatus {
  return s !== null && (STATUSES as readonly string[]).includes(s);
}
function isCategory(s: string | null): s is BrainDocumentCategory {
  return s !== null && (CATEGORIES as readonly string[]).includes(s);
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
  const categoryRaw = url.searchParams.get('category');
  if (categoryRaw !== null && !isCategory(categoryRaw)) {
    return NextResponse.json(
      { success: false, message: `Invalid category. Allowed: ${CATEGORIES.join(', ')}` },
      { status: 400 },
    );
  }

  const ownerIdRaw = url.searchParams.get('ownerId');
  const search = url.searchParams.get('search');
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const opts: ListDocumentsOpts = { limit, offset };
  if (isStatus(statusRaw)) opts.status = statusRaw;
  if (isCategory(categoryRaw)) opts.category = categoryRaw;
  if (ownerIdRaw) {
    const n = parseInt(ownerIdRaw, 10);
    if (Number.isFinite(n)) opts.ownerId = n;
  }
  if (search && search.trim()) opts.search = search.trim();

  const items = await listDocuments(result.client.id, opts);
  return NextResponse.json({ success: true, data: { items, limit, offset } });
}

const createSchema = z.object({
  title: z.string().min(1).max(255),
  category: z.enum(['sop', 'policy', 'guide', 'reference', 'announcement', 'other']).optional(),
  ownerId: z.number().int().positive().optional().nullable(),
  confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
  defaultTopicIds: z.array(z.number().int().positive()).optional(),
  sourceNoteId: z.number().int().positive().optional().nullable(),
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

  const created = await createDocument(result.client.id, result.userId, {
    title: parsed.data.title,
    category: parsed.data.category,
    ownerId: parsed.data.ownerId ?? null,
    confidentialityLevel: parsed.data.confidentialityLevel,
    defaultTopicIds: parsed.data.defaultTopicIds,
    sourceNoteId: parsed.data.sourceNoteId ?? null,
  });

  return NextResponse.json({ success: true, data: created });
}
