import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { postTypes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updatePostTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  slug: z.string().min(1, 'Slug is required').optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional(),
  active: z.boolean().optional(),
});

// GET /api/post-types/[id] - Get single post type
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const postTypeId = parseInt(id);

    if (isNaN(postTypeId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid post type ID' },
        { status: 400 }
      );
    }

    const [postType] = await db
      .select()
      .from(postTypes)
      .where(eq(postTypes.id, postTypeId))
      .limit(1);

    if (!postType) {
      return NextResponse.json(
        { success: false, error: 'Post type not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: postType });
  } catch (error) {
    console.error('Error fetching post type:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch post type' },
      { status: 500 }
    );
  }
}

// PUT /api/post-types/[id] - Update post type
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const postTypeId = parseInt(id);

    if (isNaN(postTypeId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid post type ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validatedData = updatePostTypeSchema.parse(body);

    const [updatedPostType] = await db
      .update(postTypes)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(postTypes.id, postTypeId))
      .returning();

    if (!updatedPostType) {
      return NextResponse.json(
        { success: false, error: 'Post type not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updatedPostType });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', issues: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating post type:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update post type' },
      { status: 500 }
    );
  }
}

// DELETE /api/post-types/[id] - Delete post type
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const postTypeId = parseInt(id);

    if (isNaN(postTypeId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid post type ID' },
        { status: 400 }
      );
    }

    await db.delete(postTypes).where(eq(postTypes.id, postTypeId));

    return NextResponse.json({
      success: true,
      message: 'Post type deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting post type:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete post type' },
      { status: 500 }
    );
  }
}
