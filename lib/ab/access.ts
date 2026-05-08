// Access control for portal A/B routes.
//
// Multi-tenant: every experiment is anchored to a target (post, deck, …).
// Each target ultimately resolves to a clientId, and the acting user must
// have access to that client (same rule the rest of the portal uses via
// `getPortalClient` + `getPortalClients`).

import { db } from '@/lib/db';
import { abExperiments, posts, clientWebsites, pitchDecks } from '@/lib/db/schema';
import type { AbTargetType } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClients } from '@/lib/portal-client';

export interface PostAccess {
  postId: number;
  siteId: number | null;
  clientId: number | null;
}

export interface TargetAccess {
  targetType: AbTargetType;
  targetId: number;
  clientId: number;
  /** Populated when the target naturally lives on a site (post). */
  siteId: number | null;
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
 * Verify the acting user can act on a deck (`pitch_decks.id`). Returns the
 * resolved client context, or null when the user cannot reach this deck.
 */
export async function authorizeDeckForUser(userId: number, deckId: number): Promise<TargetAccess | null> {
  if (!Number.isFinite(deckId) || deckId <= 0) return null;

  const [row] = await db
    .select({ clientId: pitchDecks.clientId })
    .from(pitchDecks)
    .where(eq(pitchDecks.id, deckId))
    .limit(1);

  if (!row) return null;

  const userClients = await getPortalClients(userId);
  if (!userClients.some(c => c.id === row.clientId)) return null;

  return { targetType: 'deck', targetId: deckId, clientId: row.clientId, siteId: null };
}

/**
 * Generalized target authorization. Dispatches to the per-type helper.
 */
export async function authorizeTargetForUser(
  userId: number,
  targetType: AbTargetType,
  targetId: number,
): Promise<TargetAccess | null> {
  switch (targetType) {
    case 'post': {
      const post = await authorizePostForUser(userId, targetId);
      if (!post || post.clientId == null) return null;
      return { targetType: 'post', targetId: post.postId, clientId: post.clientId, siteId: post.siteId };
    }
    case 'deck':
      return authorizeDeckForUser(userId, targetId);
    case 'survey':
    case 'email':
      // Not yet wired — explicit refusal until the per-type renderer is in.
      return null;
    default:
      return null;
  }
}

/**
 * Verify the acting user can act on `experimentId`. Returns the resolved
 * target-access bundle (with legacy postId mirror for back-compat) when yes,
 * null when no.
 */
export async function authorizeExperimentForUser(
  userId: number,
  experimentId: number,
): Promise<(PostAccess & { experimentId: number; targetType: AbTargetType; targetId: number }) | null> {
  if (!Number.isFinite(experimentId) || experimentId <= 0) return null;

  const [row] = await db
    .select({
      targetType: abExperiments.targetType,
      targetId: abExperiments.targetId,
      postId: abExperiments.postId,
    })
    .from(abExperiments)
    .where(eq(abExperiments.id, experimentId))
    .limit(1);

  if (!row) return null;

  const access = await authorizeTargetForUser(userId, row.targetType, row.targetId);
  if (!access) return null;

  // Mirror the legacy PostAccess shape so existing callers keep compiling.
  return {
    experimentId,
    targetType: access.targetType,
    targetId: access.targetId,
    postId: row.postId ?? (access.targetType === 'post' ? access.targetId : 0),
    siteId: access.siteId,
    clientId: access.clientId,
  };
}
