import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmCustomFields, crmCustomFieldValues } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

async function getAuthedClient() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return { error: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };
  return { client, userId };
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const fieldId = parseInt(id, 10);
  if (isNaN(fieldId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [existing] = await db
    .select({ id: crmCustomFields.id })
    .from(crmCustomFields)
    .where(and(eq(crmCustomFields.id, fieldId), eq(crmCustomFields.clientId, client.id)));

  if (!existing)
    return NextResponse.json({ success: false, message: 'Custom field not found' }, { status: 404 });

  const body = await req.json();

  const updateData: Record<string, unknown> = {};
  if (body.fieldName !== undefined) updateData.fieldName = body.fieldName.trim();
  if (body.options !== undefined) updateData.options = body.options;
  if (body.required !== undefined) updateData.required = body.required;
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ success: false, message: 'No fields to update' }, { status: 400 });
  }

  const [updated] = await db
    .update(crmCustomFields)
    .set(updateData)
    .where(eq(crmCustomFields.id, fieldId))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const fieldId = parseInt(id, 10);
  if (isNaN(fieldId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  // Delete cascades to values via FK
  const [deleted] = await db
    .delete(crmCustomFields)
    .where(and(eq(crmCustomFields.id, fieldId), eq(crmCustomFields.clientId, client.id)))
    .returning();

  if (!deleted)
    return NextResponse.json({ success: false, message: 'Custom field not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: deleted });
}
