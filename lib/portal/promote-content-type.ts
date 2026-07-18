import { db } from '@/lib/db';
import { postTypes } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

/**
 * "Promote" a built-in (global, websiteId IS NULL) content type to a
 * site-scoped row so it can be edited locally.
 *
 * The Template / Code / Custom Fields editors all require a site-scoped
 * post_types row — they refuse to operate on global rows so a single click
 * can't accidentally affect every other client using the same built-in type
 * (page, blog, event, …). When a user clicks Edit on a built-in type, this
 * helper either returns the existing site-scoped sibling (matched by slug)
 * or creates a fresh copy and returns it.
 *
 * Idempotent: re-running with an already-site-scoped id is a no-op.
 *
 * Returns `{ id, redirected }` — `redirected` is `true` when a new row was
 * created or an existing site-scoped sibling was found, so the caller knows
 * to swap the URL's typeId. `false` means no change needed.
 */
export async function promoteBuiltInContentType(
  siteId: number,
  typeId: number,
): Promise<{ id: number; redirected: boolean } | null> {
  const [type] = await db
    .select()
    .from(postTypes)
    .where(eq(postTypes.id, typeId))
    .limit(1);
  if (!type) return null;

  // Already site-scoped — and it's THIS site — nothing to do.
  if (type.websiteId === siteId) return { id: type.id, redirected: false };

  // It's a different site's row (or already site-scoped to someone else) —
  // refuse rather than expose a cross-site edit.
  if (type.websiteId !== null) return null;

  // Built-in. Look for an existing site-scoped copy by slug.
  const [existing] = await db
    .select()
    .from(postTypes)
    .where(and(eq(postTypes.slug, type.slug), eq(postTypes.websiteId, siteId)))
    .limit(1);
  if (existing) return { id: existing.id, redirected: true };

  // Create the site-scoped fork. Carry over name/slug/description/icon so the
  // override looks identical to the built-in until the user customizes it.
  const [created] = await db
    .insert(postTypes)
    .values({
      name: type.name,
      slug: type.slug,
      description: type.description,
      icon: type.icon,
      active: true,
      websiteId: siteId,
    })
    .returning();
  return { id: created.id, redirected: true };
}
