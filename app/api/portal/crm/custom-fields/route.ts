import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmCustomFields } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';

async function getAuthedClient() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return { error: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };
  return { client, userId };
}

const VALID_ENTITY_TYPES = ['contact', 'company', 'deal'];
const VALID_FIELD_TYPES = ['text', 'number', 'date', 'select', 'multiselect', 'url', 'email', 'phone', 'boolean'];

export async function GET(req: NextRequest) {
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const entityType = req.nextUrl.searchParams.get('entityType');

  const conditions = [eq(crmCustomFields.clientId, client.id)];
  if (entityType && VALID_ENTITY_TYPES.includes(entityType)) {
    conditions.push(eq(crmCustomFields.entityType, entityType));
  }

  const fields = await db
    .select()
    .from(crmCustomFields)
    .where(and(...conditions))
    .orderBy(asc(crmCustomFields.sortOrder), asc(crmCustomFields.id));

  return NextResponse.json({ success: true, data: fields });
}

export async function POST(req: NextRequest) {
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const body = await req.json();

  if (!body.fieldName?.trim()) {
    return NextResponse.json({ success: false, message: 'Field name is required' }, { status: 400 });
  }
  if (!body.entityType || !VALID_ENTITY_TYPES.includes(body.entityType)) {
    return NextResponse.json({ success: false, message: 'Invalid entity type' }, { status: 400 });
  }
  if (!body.fieldType || !VALID_FIELD_TYPES.includes(body.fieldType)) {
    return NextResponse.json({ success: false, message: 'Invalid field type' }, { status: 400 });
  }

  // Check uniqueness of fieldName per client + entityType
  const [existing] = await db
    .select({ id: crmCustomFields.id })
    .from(crmCustomFields)
    .where(
      and(
        eq(crmCustomFields.clientId, client.id),
        eq(crmCustomFields.entityType, body.entityType),
        eq(crmCustomFields.fieldName, body.fieldName.trim())
      )
    );

  if (existing) {
    return NextResponse.json(
      { success: false, message: 'A field with this name already exists for this entity type' },
      { status: 409 }
    );
  }

  const categoryRaw = typeof body.category === 'string' ? body.category.trim() : '';
  const category = categoryRaw.length > 0 ? categoryRaw : null;

  const [field] = await db
    .insert(crmCustomFields)
    .values({
      clientId: client.id,
      entityType: body.entityType,
      fieldName: body.fieldName.trim(),
      fieldType: body.fieldType,
      options: body.options || null,
      required: body.required ?? false,
      sortOrder: body.sortOrder ?? 0,
      category,
    })
    .returning();

  return NextResponse.json({ success: true, data: field }, { status: 201 });
}
