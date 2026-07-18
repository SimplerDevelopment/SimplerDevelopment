/**
 * GET  /api/portal/brain/documents/[id]/required-reads  — list required-reads
 *                                                         for a document
 * POST /api/portal/brain/documents/[id]/required-reads  — assign a required-read
 *
 * Body shape for POST mirrors AssignRequiredReadArgs minus documentId (taken
 * from the URL):
 *   {
 *     targetType: 'person' | 'org_unit',
 *     targetId: number,
 *     pinnedVersionId?: number | null,
 *     dueAt?: string | null,          // ISO date
 *     expandOrgUnit?: boolean,
 *   }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  assignRequiredRead,
  listRequiredReadsForDocument,
} from '@/lib/brain/document-acks';

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const documentId = parseId(id);
  if (documentId === null) {
    return NextResponse.json({ success: false, message: 'Invalid document id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const targetType = url.searchParams.get('targetType');
  const limit = parseInt(url.searchParams.get('limit') ?? '100', 10);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  if (targetType !== null && targetType !== 'person' && targetType !== 'org_unit') {
    return NextResponse.json(
      { success: false, message: 'targetType must be "person" or "org_unit"' },
      { status: 400 },
    );
  }

  const items = await listRequiredReadsForDocument(result.client.id, documentId, {
    targetType: (targetType as 'person' | 'org_unit' | null) ?? undefined,
    limit: Number.isFinite(limit) ? limit : 100,
    offset: Number.isFinite(offset) ? offset : 0,
  });
  return NextResponse.json({ success: true, data: { items } });
}

const isoDate = z.preprocess(
  (v) => (typeof v === 'string' && v ? new Date(v) : v ?? undefined),
  z.date().optional().nullable(),
);

const postSchema = z.object({
  targetType: z.enum(['person', 'org_unit']),
  targetId: z.number().int().positive(),
  pinnedVersionId: z.number().int().positive().optional().nullable(),
  dueAt: isoDate,
  expandOrgUnit: z.boolean().optional(),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const documentId = parseId(id);
  if (documentId === null) {
    return NextResponse.json({ success: false, message: 'Invalid document id' }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  if (!json || typeof json !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const out = await assignRequiredRead(result.client.id, result.userId, {
      documentId,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      pinnedVersionId: parsed.data.pinnedVersionId ?? null,
      dueAt: parsed.data.dueAt ?? null,
      expandOrgUnit: parsed.data.expandOrgUnit ?? false,
    });
    return NextResponse.json({ success: true, data: out });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Assign failed';
    const status = /not found|does not belong/i.test(message) ? 404 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
