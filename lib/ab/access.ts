// Access control for portal A/B routes.
//
// Multi-tenant: every experiment is anchored to a post, every post lives on
// a website, every website belongs to a client. The acting user must have
// access to that client (same rule the rest of the portal uses via
// `getPortalClient` + `getPortalClients`).

import { db } from '@/lib/db';
import { abExperiments, posts, clientWebsites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClients } from '@/lib/portal-client';

export interface PostAccess {
  postId: number;
  siteId: number | null;
  clientId: number | null;
}

/**
 * Verify the acting user can act on `postId`. Returns the resolved post +
 * site context, or null when the user cannot reach this post.
 */
export async function authorizePostForUser(userId: number, postId: number): Promise<PostAccess | null> {
  if (!Number.isFinite(postId) || postId <= 0) return null;

  const [row] = await db
    .select({
      postId: posts.id,
      siteId: posts.websiteId,
    })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (!row) return null;

  // Agency-only posts (websiteId null) are admin-only — the portal
  // experiments UI doesn't surface them.
  if (row.siteId == null) return null;

  const [site] = await db
    .select({ clientId: clientWebsites.clientId })
    .from(clientWebsites)
    .where(eq(clientWebsites.id, row.siteId))
    .limit(1);

  if (!site) return null;

  const userClients = await getPortalClients(userId);
  if (!userClients.some(c => c.id === site.clientId)) return null;

  return { postId: row.postId, siteId: row.siteId, clientId: site.clientId };
}

/**
 * Verify the acting user can act on `experimentId`. Returns the resolved
 * post-access bundle when yes, null when no.
 */
export async function authorizeExperimentForUser(userId: number, experimentId: number): Promise<(PostAccess & { experimentId: number }) | null> {
  if (!Number.isFinite(experimentId) || experimentId <= 0) return null;

  const [row] = await db
    .select({ postId: abExperiments.postId })
    .from(abExperiments)
    .where(eq(abExperiments.id, experimentId))
    .limit(1);

  if (!row) return null;

  const post = await authorizePostForUser(userId, row.postId);
  if (!post) return null;

  return { ...post, experimentId };
}
