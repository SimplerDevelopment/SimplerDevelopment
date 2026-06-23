import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmCustomFields, crmCustomFieldValues, crmContacts, crmCompanies, crmDeals } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

async function entityBelongsToClient(
  entityType: string,
  entityId: number,
  clientId: number,
): Promise<boolean> {
  if (entityType === 'contact') {
    const [row] = await db.select({ id: crmContacts.id }).from(crmContacts)
      .where(and(eq(crmContacts.id, entityId), eq(crmContacts.clientId, clientId))).limit(1);
    return !!row;
  }
  if (entityType === 'company') {
    const [row] = await db.select({ id: crmCompanies.id }).from(crmCompanies)
      .where(and(eq(crmCompanies.id, entityId), eq(crmCompanies.clientId, clientId))).limit(1);
    return !!row;
  }
  if (entityType === 'deal') {
    const [row] = await db.select({ id: crmDeals.id }).from(crmDeals)
      .where(and(eq(crmDeals.id, entityId), eq(crmDeals.clientId, clientId))).limit(1);
    return !!row;
  }
  return false;
}

async function getAuthedClient() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return { error: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };
  return { client, userId };
}

const VALID_ENTITY_TYPES = ['contact', 'company', 'deal'];

export async function GET(req: NextRequest) {
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const entityType = req.nextUrl.searchParams.get('entityType');
  const entityId = req.nextUrl.searchParams.get('entityId');

  if (!entityType || !VALID_ENTITY_TYPES.includes(entityType)) {
    return NextResponse.json({ success: false, message: 'Invalid entity type' }, { status: 400 });
  }
  if (!entityId || isNaN(parseInt(entityId, 10))) {
    return NextResponse.json({ success: false, message: 'Invalid entity ID' }, { status: 400 });
  }

  if (!(await entityBelongsToClient(entityType, parseInt(entityId, 10), client.id))) {
    return NextResponse.json({ success: false, message: 'Entity not found' }, { status: 404 });
  }

  const values = await db
    .select({
      id: crmCustomFieldValues.id,
      customFieldId: crmCustomFieldValues.customFieldId,
      entityId: crmCustomFieldValues.entityId,
      entityType: crmCustomFieldValues.entityType,
      value: crmCustomFieldValues.value,
      fieldName: crmCustomFields.fieldName,
      fieldType: crmCustomFields.fieldType,
      options: crmCustomFields.options,
      required: crmCustomFields.required,
    })
    .from(crmCustomFieldValues)
    .innerJoin(crmCustomFields, eq(crmCustomFieldValues.customFieldId, crmCustomFields.id))
    .where(
      and(
        eq(crmCustomFieldValues.entityType, entityType),
        eq(crmCustomFieldValues.entityId, parseInt(entityId, 10)),
        eq(crmCustomFields.clientId, client.id)
      )
    );

  return NextResponse.json({ success: true, data: values });
}

export async function PUT(req: NextRequest) {
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const body = await req.json();

  if (!body.entityType || !VALID_ENTITY_TYPES.includes(body.entityType)) {
    return NextResponse.json({ success: false, message: 'Invalid entity type' }, { status: 400 });
  }
  if (!body.entityId || isNaN(parseInt(String(body.entityId), 10))) {
    return NextResponse.json({ success: false, message: 'Invalid entity ID' }, { status: 400 });
  }
  if (!body.values || typeof body.values !== 'object') {
    return NextResponse.json({ success: false, message: 'Values object is required' }, { status: 400 });
  }

  const entityId = parseInt(String(body.entityId), 10);
  const entityType = body.entityType as string;
  const fieldIds = Object.keys(body.values).map((k) => parseInt(k, 10));

  if (fieldIds.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  if (!(await entityBelongsToClient(entityType, entityId, client.id))) {
    return NextResponse.json({ success: false, message: 'Entity not found' }, { status: 404 });
  }

  // Verify all field IDs belong to this client
  const validFields = await db
    .select({ id: crmCustomFields.id })
    .from(crmCustomFields)
    .where(
      and(
        eq(crmCustomFields.clientId, client.id),
        inArray(crmCustomFields.id, fieldIds)
      )
    );

  const validFieldIds = new Set(validFields.map((f) => f.id));

  const results = [];
  for (const [fieldIdStr, value] of Object.entries(body.values)) {
    const fieldId = parseInt(fieldIdStr, 10);
    if (!validFieldIds.has(fieldId)) continue;

    const stringValue = value === null || value === undefined ? null : String(value);

    // Upsert: insert or update on conflict
    const [upserted] = await db
      .insert(crmCustomFieldValues)
      .values({
        customFieldId: fieldId,
        entityId,
        entityType,
        value: stringValue,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [crmCustomFieldValues.customFieldId, crmCustomFieldValues.entityId, crmCustomFieldValues.entityType],
        set: { value: stringValue, updatedAt: new Date() },
      })
      .returning();

    results.push(upserted);
  }

  return NextResponse.json({ success: true, data: results });
}
