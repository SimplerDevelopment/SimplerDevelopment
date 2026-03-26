import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customFields } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const FIELD_TYPE_ENUM = ['text', 'textarea', 'number', 'date', 'select', 'checkbox', 'url', 'email', 'image', 'user_select', 'repeater', 'group'] as const;

const createCustomFieldSchema = z.object({
  postTypeId: z.number().int().positive(),
  parentId: z.number().int().positive().optional().nullable(),
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required'),
  fieldType: z.enum(FIELD_TYPE_ENUM),
  options: z.array(z.string()).optional().nullable(),
  required: z.boolean().default(false),
  defaultValue: z.string().optional().nullable(),
  helpText: z.string().optional().nullable(),
  order: z.number().int().default(0),
});

const updateCustomFieldSchema = z.object({
  postTypeId: z.number().int().positive().optional(),
  parentId: z.number().int().positive().optional().nullable(),
  name: z.string().min(1, 'Name is required').optional(),
  slug: z.string().min(1, 'Slug is required').optional(),
  fieldType: z.enum(FIELD_TYPE_ENUM).optional(),
  options: z.array(z.string()).optional().nullable(),
  required: z.boolean().optional(),
  defaultValue: z.string().optional().nullable(),
  helpText: z.string().optional().nullable(),
  order: z.number().int().optional(),
});

// GET /api/custom-fields?postTypeId=X - List custom fields (optionally filtered by post type)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const postTypeId = searchParams.get('postTypeId');

    let allCustomFields;

    if (postTypeId) {
      const postTypeIdNum = parseInt(postTypeId);
      if (isNaN(postTypeIdNum)) {
        return NextResponse.json(
          { success: false, error: 'Invalid post type ID' },
          { status: 400 }
        );
      }

      allCustomFields = await db
        .select()
        .from(customFields)
        .where(eq(customFields.postTypeId, postTypeIdNum))
        .orderBy(customFields.order);
    } else {
      allCustomFields = await db.select().from(customFields).orderBy(customFields.order);
    }

    return NextResponse.json({ success: true, data: allCustomFields });
  } catch (error) {
    console.error('Error fetching custom fields:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch custom fields' },
      { status: 500 }
    );
  }
}

// POST /api/custom-fields - Create new custom field
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = createCustomFieldSchema.parse(body);

    const [newCustomField] = await db
      .insert(customFields)
      .values({
        ...validatedData,
        options: validatedData.options ? validatedData.options : null,
      })
      .returning();

    return NextResponse.json(
      { success: true, data: newCustomField },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', issues: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating custom field:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create custom field' },
      { status: 500 }
    );
  }
}
