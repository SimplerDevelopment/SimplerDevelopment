import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites, postTypes, customFields } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { z } from 'zod';

const FIELD_TYPE_ENUM = ['text', 'textarea', 'number', 'date', 'select', 'checkbox', 'url', 'email', 'image', 'user_select', 'repeater', 'group', 'reference'] as const;

const updateSchema = z.object({
  parentId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  fieldType: z.enum(FIELD_TYPE_ENUM).optional(),
  options: z.array(z.string()).nullable().optional(),
  required: z.boolean().optional(),
  defaultValue: z.string().nullable().optional(),
  helpText: z.string().nullable().optional(),
  order: z.number().int().optional(),
});

async function verifyFieldAccess(siteIdRaw: string, typeIdRaw: string, fieldIdRaw: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return null;
  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteIdRaw)), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  if (!site) return null;
  const [type] = await db
    .select()
    .from(postTypes)
    .where(and(eq(postTypes.id, parseInt(typeIdRaw)), eq(postTypes.websiteId, site.id)))
    .limit(1);
  if (!type) return null;
  const [field] = await db
    .select()
    .from(customFields)
    .where(and(eq(customFields.id, parseInt(fieldIdRaw)), eq(customFields.postTypeId, type.id)))
    .limit(1);
  return field ? { site, type, field } : null;
}

export async function PUT(req: Request, { params }: { params: Promise<{ siteId: string; typeId: string; fieldId: string }> }) {
  const { siteId, typeId, fieldId } = await params;
  const ctx = await verifyFieldAccess(siteId, typeId, fieldId);
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  let parsed;
  try {
    parsed = updateSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: 'Validation error', issues: err.issues }, { status: 400 });
    }
    throw err;
  }

  // If reparenting, validate the new parent belongs to this same CPT and is
  // a container (repeater/group).
  if (parsed.parentId) {
    const [parent] = await db
      .select({ id: customFields.id, postTypeId: customFields.postTypeId, fieldType: customFields.fieldType })
      .from(customFields)
      .where(eq(customFields.id, parsed.parentId))
      .limit(1);
    if (!parent || parent.postTypeId !== ctx.type.id) {
      return NextResponse.json({ success: false, message: 'parentId is not a field on this content type' }, { status: 400 });
    }
    if (parent.fieldType !== 'repeater' && parent.fieldType !== 'group') {
      return NextResponse.json({ success: false, message: 'parentId must point to a repeater or group field' }, { status: 400 });
    }
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.name !== undefined) patch.name = parsed.name;
  if (parsed.slug !== undefined) patch.slug = parsed.slug;
  if (parsed.fieldType !== undefined) patch.fieldType = parsed.fieldType;
  if (parsed.options !== undefined) patch.options = parsed.options;
  if (parsed.required !== undefined) patch.required = parsed.required;
  if (parsed.defaultValue !== undefined) patch.defaultValue = parsed.defaultValue;
  if (parsed.helpText !== undefined) patch.helpText = parsed.helpText;
  if (parsed.order !== undefined) patch.order = parsed.order;
  if (parsed.parentId !== undefined) patch.parentId = parsed.parentId;

  const [updated] = await db
    .update(customFields)
    .set(patch)
    .where(eq(customFields.id, ctx.field.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ siteId: string; typeId: string; fieldId: string }> }) {
  const { siteId, typeId, fieldId } = await params;
  const ctx = await verifyFieldAccess(siteId, typeId, fieldId);
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  await db.delete(customFields).where(eq(customFields.id, ctx.field.id));
  return NextResponse.json({ success: true });
}
