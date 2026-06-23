import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { db } from '@/lib/db';
import { brainNotes, brainCustomFields, brainCustomFieldValues } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';

/**
 * List custom field definitions for `entity_type='note'` plus the current
 * value (if any) for this note. Definitions with no value still appear so
 * the UI can render an empty editable cell — that's the whole point of a
 * structured pane.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const noteId = parseInt(id, 10);
  if (Number.isNaN(noteId)) {
    return NextResponse.json({ success: false, message: 'Invalid note id' }, { status: 400 });
  }

  // Tenant guard on the parent note.
  const [target] = await db
    .select({ id: brainNotes.id })
    .from(brainNotes)
    .where(and(eq(brainNotes.id, noteId), eq(brainNotes.clientId, result.client.id)))
    .limit(1);
  if (!target) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  // All note-scoped definitions for this client.
  const defs = await db
    .select()
    .from(brainCustomFields)
    .where(and(
      eq(brainCustomFields.clientId, result.client.id),
      eq(brainCustomFields.entityType, 'note'),
    ))
    .orderBy(asc(brainCustomFields.sortOrder), asc(brainCustomFields.fieldLabel));

  // Values that exist for this note. Joined to defs we already have so we
  // never read across client_id (definitions are the only thing keyed by
  // clientId; values inherit by FK).
  const values = await db
    .select()
    .from(brainCustomFieldValues)
    .where(and(
      eq(brainCustomFieldValues.entityType, 'note'),
      eq(brainCustomFieldValues.entityId, noteId),
    ));

  const valueByDef = new Map<number, typeof brainCustomFieldValues.$inferSelect>();
  for (const v of values) valueByDef.set(v.customFieldId, v);

  const items = defs.map((d) => {
    const v = valueByDef.get(d.id);
    return {
      definition: {
        id: d.id,
        fieldName: d.fieldName,
        fieldLabel: d.fieldLabel ?? d.fieldName,
        fieldType: d.fieldType,
        options: d.options ?? null,
        required: d.required,
        category: d.category ?? null,
        sortOrder: d.sortOrder,
        source: d.source,
      },
      value: v?.value ?? null,
      valueId: v?.id ?? null,
    };
  });

  return NextResponse.json({ success: true, data: { items } });
}
