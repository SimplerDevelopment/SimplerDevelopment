import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { db } from '@/lib/db';
import { brainNotes, brainCustomFields, brainCustomFieldValues } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Upsert a single custom-field value for a note. Body: `{ value: string | null }`.
 * Sending `null` (or omitting `value`) clears the value (deletes the row).
 *
 * The field id in the URL is the `brain_custom_fields.id` (definition id),
 * not a value-row id — the value row may not exist yet on first edit.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; fieldId: string }> },
) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id, fieldId } = await params;
  const noteId = parseInt(id, 10);
  const defId = parseInt(fieldId, 10);
  if (Number.isNaN(noteId) || Number.isNaN(defId)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
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

  // Tenant guard on the field definition — never let a write address a
  // definition that belongs to a different client (or a non-note entity_type).
  const [def] = await db
    .select()
    .from(brainCustomFields)
    .where(and(
      eq(brainCustomFields.id, defId),
      eq(brainCustomFields.clientId, result.client.id),
      eq(brainCustomFields.entityType, 'note'),
    ))
    .limit(1);
  if (!def) {
    return NextResponse.json({ success: false, message: 'Field not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  let nextValue: string | null = null;
  if (body.value === null || body.value === undefined) {
    nextValue = null;
  } else if (typeof body.value === 'string') {
    nextValue = body.value;
  } else {
    // numbers, booleans, json — coerce to text for storage; the renderer
    // parses by field_type when reading back.
    try {
      nextValue = typeof body.value === 'object' ? JSON.stringify(body.value) : String(body.value);
    } catch {
      return NextResponse.json({ success: false, message: 'Unserializable value' }, { status: 400 });
    }
  }

  // Cap on field-value length — values are text but we don't want a 5MB blob
  // sneaking in. 50k matches the body cap on notes.
  if (nextValue !== null && nextValue.length > 50_000) {
    return NextResponse.json({ success: false, message: 'Value too large' }, { status: 413 });
  }

  // Find existing value (one per (definition, entity)).
  const [existing] = await db
    .select()
    .from(brainCustomFieldValues)
    .where(and(
      eq(brainCustomFieldValues.customFieldId, defId),
      eq(brainCustomFieldValues.entityType, 'note'),
      eq(brainCustomFieldValues.entityId, noteId),
    ))
    .limit(1);

  if (nextValue === null) {
    if (existing) {
      await db.delete(brainCustomFieldValues).where(eq(brainCustomFieldValues.id, existing.id));
    }
    return NextResponse.json({ success: true, data: { value: null } });
  }

  if (existing) {
    const [updated] = await db
      .update(brainCustomFieldValues)
      .set({ value: nextValue, updatedAt: new Date() })
      .where(eq(brainCustomFieldValues.id, existing.id))
      .returning();
    return NextResponse.json({ success: true, data: { value: updated.value, valueId: updated.id } });
  }

  const [created] = await db
    .insert(brainCustomFieldValues)
    .values({
      customFieldId: defId,
      entityType: 'note',
      entityId: noteId,
      value: nextValue,
    })
    .returning();
  return NextResponse.json({ success: true, data: { value: created.value, valueId: created.id } });
}
