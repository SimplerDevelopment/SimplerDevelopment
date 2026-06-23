import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites, postTypes, customFields } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { z } from 'zod';

const FIELD_TYPE_ENUM = ['text', 'textarea', 'number', 'date', 'select', 'checkbox', 'url', 'email', 'image', 'user_select', 'repeater', 'group', 'reference'] as const;

const createSchema = z.object({
  parentId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1),
  slug: z.string().min(1),
  fieldType: z.enum(FIELD_TYPE_ENUM),
  options: z.array(z.string()).nullable().optional(),
  required: z.boolean().default(false),
  defaultValue: z.string().nullable().optional(),
  helpText: z.string().nullable().optional(),
  order: z.number().int().default(0),
});

// Same auth + access pattern as the sibling code/ + template/ routes:
// session → client → site (same client) → type (this site).
async function verifyTypeAccess(siteIdRaw: string, typeIdRaw: string) {
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
  return type ? { site, type } : null;
}

// GET → list all custom fields for this content type (parent + sub-fields).
// Sorted by `order` so the UI can render in the author's intended sequence.
export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string; typeId: string }> }) {
  const { siteId, typeId } = await params;
  const ctx = await verifyTypeAccess(siteId, typeId);
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select()
    .from(customFields)
    .where(eq(customFields.postTypeId, ctx.type.id))
    .orderBy(asc(customFields.order));

  return NextResponse.json({ success: true, data: rows });
}

// POST → create a new field on this CPT. parentId (when given) must already
// belong to this same CPT — prevents grafting fields onto another type via
// API misuse.
export async function POST(req: Request, { params }: { params: Promise<{ siteId: string; typeId: string }> }) {
  const { siteId, typeId } = await params;
  const ctx = await verifyTypeAccess(siteId, typeId);
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  let parsed;
  try {
    parsed = createSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: 'Validation error', issues: err.issues }, { status: 400 });
    }
    throw err;
  }

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

  const [created] = await db
    .insert(customFields)
    .values({
      postTypeId: ctx.type.id,
      parentId: parsed.parentId ?? null,
      name: parsed.name,
      slug: parsed.slug,
      fieldType: parsed.fieldType,
      options: parsed.options ?? null,
      required: parsed.required,
      defaultValue: parsed.defaultValue ?? null,
      helpText: parsed.helpText ?? null,
      order: parsed.order,
    })
    .returning();

  return NextResponse.json({ success: true, data: created }, { status: 201 });
}
