import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const scheduleSchema = z.object({
  publishedAt: z.string().datetime().nullable(),
  published: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const postId = parseInt(id);
    const body = await request.json();
    const { publishedAt, published } = scheduleSchema.parse(body);

    const updates: Record<string, unknown> = {
      publishedAt: publishedAt ? new Date(publishedAt) : null,
      updatedAt: new Date(),
    };

    if (published !== undefined) {
      updates.published = published;
    }

    const [updated] = await db
      .update(posts)
      .set(updates)
      .where(eq(posts.id, postId))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 },
      );
    }
    console.error('Error scheduling post:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to schedule post' },
      { status: 500 },
    );
  }
}
