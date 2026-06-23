import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { postTypes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const createPostTypeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required'),
  description: z.string().optional(),
  icon: z.string().default('article'),
  active: z.boolean().default(true),
});

const updatePostTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  slug: z.string().min(1, 'Slug is required').optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional(),
  active: z.boolean().optional(),
});

// GET /api/post-types - List all post types
export async function GET() {
  try {
    const allPostTypes = await db.select().from(postTypes);
    return NextResponse.json({ success: true, data: allPostTypes });
  } catch (error) {
    console.error('Error fetching post types:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch post types' },
      { status: 500 }
    );
  }
}

// POST /api/post-types - Create new post type
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = createPostTypeSchema.parse(body);

    const [newPostType] = await db
      .insert(postTypes)
      .values(validatedData)
      .returning();

    return NextResponse.json(
      { success: true, data: newPostType },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', issues: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating post type:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create post type' },
      { status: 500 }
    );
  }
}
