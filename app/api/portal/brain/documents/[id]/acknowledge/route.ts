/**
 * POST /api/portal/brain/documents/[id]/acknowledge
 *
 * Body: { versionId, personId, acknowledgmentNote?, requiredReadId? }
 *
 * Idempotent — re-acknowledging the same (doc, version, person) returns the
 * existing row without duplicating audit.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { acknowledge } from '@/lib/brain/document-acks';

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const postSchema = z.object({
  versionId: z.number().int().positive(),
  personId: z.number().int().positive(),
  acknowledgmentNote: z.string().max(10_000).optional().nullable(),
  requiredReadId: z.number().int().positive().optional().nullable(),
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
    const ack = await acknowledge(result.client.id, result.userId, {
      documentId,
      versionId: parsed.data.versionId,
      personId: parsed.data.personId,
      acknowledgmentNote: parsed.data.acknowledgmentNote ?? null,
      requiredReadId: parsed.data.requiredReadId ?? null,
    });
    return NextResponse.json({ success: true, data: ack });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Acknowledge failed';
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
