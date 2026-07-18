/**
 * POST /api/portal/brain/documents/promote-from-note
 * Body: { noteId: number, title?: string, category?: BrainDocumentCategory }
 *
 * Creates a new document seeded with the note's body as the initial draft
 * version. The new document's `sourceNoteId` is set to the source note id.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { promoteFromNote } from '@/lib/brain/documents';

const schema = z.object({
  noteId: z.number().int().positive(),
  title: z.string().min(1).max(255).optional(),
  category: z.enum(['sop', 'policy', 'guide', 'reference', 'announcement', 'other']).optional(),
});

export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const promoted = await promoteFromNote(result.client.id, result.userId, parsed.data.noteId, {
      title: parsed.data.title,
      category: parsed.data.category,
    });
    if (!promoted) return NextResponse.json({ success: false, message: 'Note not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: promoted });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Promote failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
