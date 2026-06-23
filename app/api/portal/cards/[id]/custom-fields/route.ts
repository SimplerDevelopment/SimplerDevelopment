// Per-card custom-field values. GET joins definitions + values; PUT bulk-
// upserts the value for each (cardId, fieldId).

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, projectCustomFields, cardCustomFieldValues, projects } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { canUserEditProject } from '@/lib/portal/project-access';

async function authorize(cardId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();

  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return null;

  const [project] = await db.select().from(projects).where(eq(projects.id, card.projectId)).limit(1);
  if (!project) return null;

  if (!staff) {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) return null;
  }
  return { card, canEdit: staff || (await canUserEditProject(userId, card.projectId)) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cardId = parseInt(id, 10);
  const access = await authorize(cardId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const fields = await db.select().from(projectCustomFields)
    .where(eq(projectCustomFields.projectId, access.card.projectId))
    .orderBy(asc(projectCustomFields.order), asc(projectCustomFields.id));

  const values = await db.select().from(cardCustomFieldValues)
    .where(eq(cardCustomFieldValues.cardId, cardId));

  const valueByField = new Map(values.map(v => [v.fieldId, v.value]));
  const result = fields.map(f => ({
    id: f.id,
    key: f.key,
    name: f.name,
    kind: f.kind,
    required: f.required,
    options: f.options,
    order: f.order,
    value: valueByField.get(f.id) ?? null,
  }));

  return NextResponse.json({ success: true, data: result });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cardId = parseInt(id, 10);
  const access = await authorize(cardId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { values?: { fieldId: number; value: unknown }[] };
  if (!Array.isArray(body.values)) {
    return NextResponse.json({ success: false, message: 'values: { fieldId, value }[] required' }, { status: 400 });
  }

  // Verify all fieldIds belong to this card's project — prevents cross-project poisoning.
  const fieldIds = body.values.map(v => v.fieldId);
  if (fieldIds.length === 0) return NextResponse.json({ success: true, data: [] });

  const fields = await db.select().from(projectCustomFields)
    .where(eq(projectCustomFields.projectId, access.card.projectId));
  const validFieldIds = new Set(fields.map(f => f.id));

  for (const v of body.values) {
    if (!validFieldIds.has(v.fieldId)) {
      return NextResponse.json({ success: false, message: `Field ${v.fieldId} not in this project` }, { status: 400 });
    }
  }

  // Upsert each (cardId, fieldId).
  for (const v of body.values) {
    await db.insert(cardCustomFieldValues).values({
      cardId,
      fieldId: v.fieldId,
      value: v.value as typeof cardCustomFieldValues.$inferInsert['value'],
    }).onConflictDoUpdate({
      target: [cardCustomFieldValues.cardId, cardCustomFieldValues.fieldId],
      set: { value: v.value as typeof cardCustomFieldValues.$inferInsert['value'], updatedAt: new Date() },
    });
  }

  return NextResponse.json({ success: true });
}
