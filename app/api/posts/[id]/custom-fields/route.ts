import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { postCustomFieldValues, customFields } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

// GET /api/posts/[id]/custom-fields - Get custom field values for a post
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const postId = parseInt(id);

    if (isNaN(postId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid post ID' },
        { status: 400 }
      );
    }

    // Get all custom field values for this post with field details
    const values = await db
      .select({
        id: postCustomFieldValues.id,
        postId: postCustomFieldValues.postId,
        customFieldId: postCustomFieldValues.customFieldId,
        value: postCustomFieldValues.value,
        slug: customFields.slug,
        name: customFields.name,
        fieldType: customFields.fieldType,
      })
      .from(postCustomFieldValues)
      .innerJoin(customFields, eq(postCustomFieldValues.customFieldId, customFields.id))
      .where(eq(postCustomFieldValues.postId, postId));

    return NextResponse.json({ success: true, data: values });
  } catch (error) {
    console.error('Error fetching custom field values:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch custom field values' },
      { status: 500 }
    );
  }
}

const upsertSchema = z.object({
  customFieldId: z.number().int().positive(),
  value: z.string(),
});

// PUT /api/posts/[id]/custom-fields - Upsert a single custom field value
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const postId = parseInt(id);

    if (isNaN(postId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid post ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { customFieldId, value } = upsertSchema.parse(body);

    // Check if a value row already exists
    const [existing] = await db
      .select({ id: postCustomFieldValues.id })
      .from(postCustomFieldValues)
      .where(
        and(
          eq(postCustomFieldValues.postId, postId),
          eq(postCustomFieldValues.customFieldId, customFieldId)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(postCustomFieldValues)
        .set({ value, updatedAt: new Date() })
        .where(eq(postCustomFieldValues.id, existing.id));
    } else {
      await db.insert(postCustomFieldValues).values({
        postId,
        customFieldId,
        value,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', issues: error.issues },
        { status: 400 }
      );
    }
    console.error('Error upserting custom field value:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save custom field value' },
      { status: 500 }
    );
  }
}
