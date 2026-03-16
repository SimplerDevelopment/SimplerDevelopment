import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { postCustomFieldValues, customFields } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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
