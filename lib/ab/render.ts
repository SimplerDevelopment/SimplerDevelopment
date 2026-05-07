// Public render-path helper for A/B testing.
//
// Bridges `lib/ab/visitor.ts` + `lib/ab/resolve.ts` so the page render
// route can stay terse: one call, get back the (possibly swapped) content
// and the AB resolution to feed into `<AbGoalTracker>`.
//
// In edit/preview mode, A/B is bypassed entirely — editors should always
// see the canonical post content, never a randomly-bucketed variant.

import { ensureVisitorId } from './visitor';
import { resolveAbContent, type AbResolution } from './resolve';

export interface PostRenderInput {
  postId: number;
  content: string;
  /** Skip A/B entirely — edit/preview mode, internal previews, etc. */
  skip?: boolean;
}

export interface PostRenderOutput {
  content: string;
  ab: AbResolution | null;
  visitorId: string | null;
}

export async function applyAbToPostContent(input: PostRenderInput): Promise<PostRenderOutput> {
  if (input.skip) {
    return { content: input.content, ab: null, visitorId: null };
  }

  const { id: visitorId } = await ensureVisitorId();
  const resolved = await resolveAbContent(input.postId, visitorId, input.content);
  return { content: resolved.content, ab: resolved.ab, visitorId };
}
