import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { posts, postCategories, postTags, postCustomFieldValues, customFields, postTypes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updatePostSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  postType: z.string().optional(),
  excerpt: z.string().optional(),
  content: z.string().min(1).optional(),
  coverImage: z.string().url().optional().or(z.literal('')),
  published: z.boolean().optional(),
  publishedAt: z.string().datetime().optional().nullable(),
  categoryIds: z.array(z.number()).optional(),
  tagIds: z.array(z.number()).optional(),
  customFields: z.record(z.string(), z.string()).optional(),
});

async function requireAdminOrEditor() {
  const session = await auth();
  if (!session?.user?.id) return { error: 'unauth' as const };
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'editor') return { error: 'forbidden' as const };
  return { session };
}

function gateResponse(result: Awaited<ReturnType<typeof requireAdminOrEditor>>) {
  if ('error' in result) {
    if (result.error === 'unauth') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminOrEditor();
  const denied = gateResponse(gate);
  if (denied) return denied;

  try {
    const { id } = await params;
    const postId = parseInt(id);

    if (isNaN(postId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid post ID' },
        { status: 400 }
      );
    }

    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!post) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: post });
  } catch (error) {
    console.error('Error fetching post:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch post' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminOrEditor();
  const denied = gateResponse(gate);
  if (denied) return denied;

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
    const validatedData = updatePostSchema.parse(body);

    const { categoryIds, tagIds, customFields: customFieldsData, ...postData } = validatedData;

    const [updatedPost] = await db
      .update(posts)
      .set({
        ...postData,
        publishedAt: postData.publishedAt ? new Date(postData.publishedAt) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId))
      .returning();

    if (!updatedPost) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      );
    }

    if (categoryIds !== undefined) {
      await db.delete(postCategories).where(eq(postCategories.postId, postId));
      if (categoryIds.length > 0) {
        await db.insert(postCategories).values(
          categoryIds.map((categoryId) => ({
            postId,
            categoryId,
          }))
        );
      }
    }

    if (tagIds !== undefined) {
      await db.delete(postTags).where(eq(postTags.postId, postId));
      if (tagIds.length > 0) {
        await db.insert(postTags).values(
          tagIds.map((tagId) => ({
            postId,
            tagId,
          }))
        );
      }
    }

    // Update custom field values
    if (customFieldsData !== undefined) {
      // Delete existing custom field values for this post
      await db.delete(postCustomFieldValues).where(eq(postCustomFieldValues.postId, postId));

      if (Object.keys(customFieldsData).length > 0) {
        // Get post type ID from slug
        const [postType] = await db
          .select()
          .from(postTypes)
          .where(eq(postTypes.slug, updatedPost.postType))
          .limit(1);

        if (postType) {
          // Get custom field definitions for this post type
          const fieldDefinitions = await db
            .select()
            .from(customFields)
            .where(eq(customFields.postTypeId, postType.id));

          // Create a map of slug to field ID
          const fieldMap = new Map(fieldDefinitions.map(f => [f.slug, f.id]));

          // Insert custom field values
          const valuesToInsert = Object.entries(customFieldsData)
            .filter(([slug, value]) => fieldMap.has(slug) && value)
            .map(([slug, value]) => ({
              postId,
              customFieldId: fieldMap.get(slug)!,
              value: value as string,
            }));

          if (valuesToInsert.length > 0) {
            await db.insert(postCustomFieldValues).values(valuesToInsert);
          }
        }
      }
    }

    return NextResponse.json({ success: true, data: updatedPost });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating post:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update post' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminOrEditor();
  const denied = gateResponse(gate);
  if (denied) return denied;

  try {
    const { id } = await params;
    const postId = parseInt(id);

    if (isNaN(postId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid post ID' },
        { status: 400 }
      );
    }

    const [deletedPost] = await db
      .delete(posts)
      .where(eq(posts.id, postId))
      .returning();

    if (!deletedPost) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Post deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete post' },
      { status: 500 }
    );
  }
}
