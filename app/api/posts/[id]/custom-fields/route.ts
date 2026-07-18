import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { postCustomFieldValues, customFields, posts } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { resolvePortalSite } from '@/lib/portal-client';

/**
 * Dual-audience guard for a single post by id. Custom-field read/write is
 * exercised by BOTH the admin post form (components/admin/PostForm.tsx) and the
 * portal post form (components/portal/post-form). Allow admin/editor staff, OR
 * a portal user who owns the post's website. Returns an error NextResponse to
 * deny, or null to proceed.
 */
async function guardPostAccess(postId: number): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (role === 'admin' || role === 'editor') return null;

  // Portal user: must own the post's website. A null websiteId is a
  // global/admin post that no portal tenant owns → deny.
  const [post] = await db
    .select({ websiteId: posts.websiteId })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  if (!post?.websiteId) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  const site = await resolvePortalSite(parseInt(session.user.id, 10), post.websiteId);
  if (!site) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

// A 'reference' field value is a referenced post id, stored as a bare id ("5")
// or a JSON array of ids ("[5,6]"). Parse either into a number[].
function parseReferenceIds(value: string | null): number[] {
  if (!value) return [];
  const raw = value.trim();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
    }
    if (Number.isInteger(parsed) && parsed > 0) return [parsed];
  } catch {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) return [n];
  }
  return [];
}

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

    const denied = await guardPostAccess(postId);
    if (denied) return denied;

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

    // Resolve 'reference' field values to referenced post summaries.
    const refIds = new Set<number>();
    for (const v of values) {
      if (v.fieldType === 'reference') for (const id of parseReferenceIds(v.value)) refIds.add(id);
    }
    const refById = new Map<number, { id: number; title: string; slug: string; published: boolean }>();
    if (refIds.size > 0) {
      const refPosts = await db
        .select({ id: posts.id, title: posts.title, slug: posts.slug, published: posts.published })
        .from(posts)
        .where(inArray(posts.id, [...refIds]));
      for (const p of refPosts) refById.set(p.id, p);
    }
    const data = values.map((v) =>
      v.fieldType === 'reference'
        ? { ...v, referencedPosts: parseReferenceIds(v.value).map((id) => refById.get(id)).filter(Boolean) }
        : v,
    );

    return NextResponse.json({ success: true, data });
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

    const denied = await guardPostAccess(postId);
    if (denied) return denied;

    const body = await request.json();
    const { customFieldId, value } = upsertSchema.parse(body);

    // Reference fields: the value must point at real post(s).
    const [field] = await db
      .select({ fieldType: customFields.fieldType })
      .from(customFields)
      .where(eq(customFields.id, customFieldId))
      .limit(1);
    if (!field) {
      return NextResponse.json({ success: false, error: 'Custom field not found' }, { status: 404 });
    }
    if (field.fieldType === 'reference' && value) {
      const ids = parseReferenceIds(value);
      if (ids.length === 0) {
        return NextResponse.json(
          { success: false, error: 'A reference value must be a post id or a JSON array of post ids' },
          { status: 400 },
        );
      }
      const [host] = await db
        .select({ websiteId: posts.websiteId })
        .from(posts)
        .where(eq(posts.id, postId))
        .limit(1);
      const found = await db
        .select({ id: posts.id, websiteId: posts.websiteId })
        .from(posts)
        .where(inArray(posts.id, ids));
      if (found.length !== new Set(ids).size) {
        return NextResponse.json(
          { success: false, error: 'One or more referenced posts do not exist' },
          { status: 400 },
        );
      }
      // A reference must point at a post on the same website (no cross-site refs).
      if (host && found.some((p) => p.websiteId !== host.websiteId)) {
        return NextResponse.json(
          { success: false, error: 'Referenced posts must be on the same website' },
          { status: 400 },
        );
      }
    }

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
