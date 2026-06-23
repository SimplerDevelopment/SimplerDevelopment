import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customFields } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateCustomFieldSchema = z.object({
  postTypeId: z.number().int().positive().optional(),
  parentId: z.number().int().positive().optional().nullable(),
  name: z.string().min(1, 'Name is required').optional(),
  slug: z.string().min(1, 'Slug is required').optional(),
  fieldType: z.enum(['text', 'textarea', 'number', 'date', 'select', 'checkbox', 'url', 'email', 'image', 'user_select', 'repeater', 'group']).optional(),
  options: z.array(z.string()).optional().nullable(),
  required: z.boolean().optional(),
  defaultValue: z.string().optional().nullable(),
  helpText: z.string().optional().nullable(),
  order: z.number().int().optional(),
});

// GET /api/custom-fields/[id] - Get single custom field
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const customFieldId = parseInt(id);

    if (isNaN(customFieldId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid custom field ID' },
        { status: 400 }
      );
    }

    const [customField] = await db
      .select()
      .from(customFields)
      .where(eq(customFields.id, customFieldId))
      .limit(1);

    if (!customField) {
      return NextResponse.json(
        { success: false, error: 'Custom field not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: customField });
  } catch (error) {
    console.error('Error fetching custom field:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch custom field' },
      { status: 500 }
    );
  }
}

// PUT /api/custom-fields/[id] - Update custom field
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const customFieldId = parseInt(id);

    if (isNaN(customFieldId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid custom field ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validatedData = updateCustomFieldSchema.parse(body);

    const [updatedCustomField] = await db
      .update(customFields)
      .set({
        ...validatedData,
        options: validatedData.options !== undefined ? validatedData.options : undefined,
        updatedAt: new Date()
      })
      .where(eq(customFields.id, customFieldId))
      .returning();

    if (!updatedCustomField) {
      return NextResponse.json(
        { success: false, error: 'Custom field not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updatedCustomField });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', issues: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating custom field:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update custom field' },
      { status: 500 }
    );
  }
}

// DELETE /api/custom-fields/[id] - Delete custom field
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const customFieldId = parseInt(id);

    if (isNaN(customFieldId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid custom field ID' },
        { status: 400 }
      );
    }

    await db.delete(customFields).where(eq(customFields.id, customFieldId));

    return NextResponse.json({
      success: true,
      message: 'Custom field deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting custom field:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete custom field' },
      { status: 500 }
    );
  }
}
