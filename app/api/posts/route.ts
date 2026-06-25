import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { posts, postCategories, postTags, postCustomFieldValues, customFields, postTypes, clientWebsites } from '@/lib/db/schema';
import { eq, desc, asc, and, inArray, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { revalidateBlogPostsCache } from '@/lib/actions/blog';
import { requireAdminOrEditor, gateResponse } from '@/lib/admin/auth';
import { getPortalClients } from '@/lib/portal-client';

const createPostSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  slug: z.string().min(1, 'Slug is required'),
  postType: z.string().default('blog'),
  excerpt: z.string().optional(),
  content: z.string().min(1, 'Content is required'),
  coverImage: z.string().url().optional().or(z.literal('')),
  published: z.boolean().default(false),
  publishedAt: z.string().datetime().optional().nullable(),
  categoryIds: z.array(z.number()).optional(),
  tagIds: z.array(z.number()).optional(),
  customFields: z.record(z.string(), z.string()).optional(),
});

export async function GET(request: NextRequest) {
  // Dual-audience: staff (admin/editor) manage content across all tenants; a
  // portal user only sees posts on websites their client(s) own. Previously
  // this returned every post across every tenant with no scoping.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  const isStaff = role === 'admin' || role === 'editor';

  try {
    const { searchParams } = new URL(request.url);
    const published = searchParams.get('published');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const orderColumn = sortBy === 'publishedAt' ? posts.publishedAt : posts.createdAt;

    const conditions: SQL[] = [];
    if (published !== null) {
      conditions.push(eq(posts.published, published === 'true'));
    }

    if (!isStaff) {
      // Scope to the websites owned by the portal user's client(s).
      const ownedClients = await getPortalClients(parseInt(session.user.id, 10));
      const clientIds = ownedClients.map((c) => c.id);
      const sites = clientIds.length
        ? await db
            .select({ id: clientWebsites.id })
            .from(clientWebsites)
            .where(inArray(clientWebsites.clientId, clientIds))
        : [];
      const siteIds = sites.map((s) => s.id);
      if (siteIds.length === 0) {
        return NextResponse.json({ success: true, data: [], pagination: { limit, offset } });
      }
      conditions.push(inArray(posts.websiteId, siteIds));
    }

    const result = await db
      .select()
      .from(posts)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(sortOrder === 'asc' ? asc(orderColumn) : desc(orderColumn))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      success: true,
      data: result,
      pagination: {
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdminOrEditor();
  const denied = gateResponse(gate);
  if (denied) return denied;

  try {
    const body = await request.json();
    const validatedData = createPostSchema.parse(body);
    console.log({validatedData})
    const { categoryIds, tagIds, customFields: customFieldsData, ...postData } = validatedData;

    const [newPost] = await db
      .insert(posts)
      .values({
        ...postData,
        publishedAt: postData.publishedAt ? new Date(postData.publishedAt) : null,
      })
      .returning();

    if (categoryIds && categoryIds.length > 0) {
      await db.insert(postCategories).values(
        categoryIds.map((categoryId) => ({
          postId: newPost.id,
          categoryId,
        }))
      );
    }

    if (tagIds && tagIds.length > 0) {
      await db.insert(postTags).values(
        tagIds.map((tagId) => ({
          postId: newPost.id,
          tagId,
        }))
      );
    }

    // Save custom field values
    if (customFieldsData && Object.keys(customFieldsData).length > 0) {
      // Get post type ID from slug
      const [postType] = await db
        .select()
        .from(postTypes)
        .where(eq(postTypes.slug, postData.postType))
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
            postId: newPost.id,
            customFieldId: fieldMap.get(slug)!,
            value: value as string,
          }));

        if (valuesToInsert.length > 0) {
          await db.insert(postCustomFieldValues).values(valuesToInsert);
        }
      }
    }

    // Bust the cached blog list/featured/category queries so a newly created
    // (or published) post appears on the marketing home + /blog immediately.
    await revalidateBlogPostsCache();

    return NextResponse.json(
      { success: true, data: newPost },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating post:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create post' },
      { status: 500 }
    );
  }
}
