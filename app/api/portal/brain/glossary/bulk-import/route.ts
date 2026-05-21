import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { bulkImportGlossary, type BulkImportArgs } from '@/lib/brain/glossary';

export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !Array.isArray(body.terms)) {
    return NextResponse.json(
      { success: false, message: 'terms (array) is required' },
      { status: 400 },
    );
  }

  try {
    const out = await bulkImportGlossary(
      result.client.id,
      result.userId,
      { terms: body.terms } as BulkImportArgs,
    );
    return NextResponse.json({ success: true, data: out });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bulk import failed';
    // 400 for input-cap violations; 500 otherwise.
    const status = /capped/i.test(message) ? 400 : 500;
    if (status === 500) console.error('[brain.glossary] bulk import failed', { clientId: result.client.id, err });
    return NextResponse.json({ success: false, message }, { status });
  }
}
