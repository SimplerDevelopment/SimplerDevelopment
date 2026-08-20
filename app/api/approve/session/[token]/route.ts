/**
 * Mints the approval-mode session and sends the reviewer to the real artifact.
 *
 * `/approve/<token>` (a Server Component) cannot set a cookie — Next only allows
 * that from a Route Handler or Server Action — so it redirects here when the
 * entity has a converted surface, and this handler does the mint + hand-off.
 *
 * The cookie names the link, not the entity: the approval row stays the single
 * source of truth for what may be viewed and for how long (PUX-061).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pitchDecks, surveys, bookingPages, posts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { lookupApprovalLink } from '@/lib/mcp/approval-links';
import { resolveApprovalSurface } from '@/lib/mcp/approval-surface';
import {
  signApprovalCookie,
  approvalCookieOptions,
  APPROVAL_COOKIE,
} from '@/lib/mcp/approval-mode';

/**
 * The artifact's slug, scoped to the link's tenant. Returns null when the row is
 * missing or belongs to another client — the token is the only credential here,
 * so entityId is never trusted without an ownership check.
 */
async function loadSlug(
  entityType: string,
  entityId: number,
  clientId: number,
): Promise<string | null> {
  switch (entityType) {
    case 'pitch_deck': {
      const [row] = await db
        .select({ slug: pitchDecks.slug })
        .from(pitchDecks)
        .where(and(eq(pitchDecks.id, entityId), eq(pitchDecks.clientId, clientId)))
        .limit(1);
      return row?.slug ?? null;
    }
    case 'survey': {
      const [row] = await db
        .select({ slug: surveys.slug })
        .from(surveys)
        .where(and(eq(surveys.id, entityId), eq(surveys.clientId, clientId)))
        .limit(1);
      return row?.slug ?? null;
    }
    case 'booking_page': {
      const [row] = await db
        .select({ slug: bookingPages.slug })
        .from(bookingPages)
        .where(and(eq(bookingPages.id, entityId), eq(bookingPages.clientId, clientId)))
        .limit(1);
      return row?.slug ?? null;
    }
    case 'post': {
      // Posts carry no clientId column — ownership runs through
      // websiteId → clientWebsites.clientId, which PUX-071 wires along with the
      // rest of the post surface. Until then this returns null and the reviewer
      // falls back to the legacy page.
      const [row] = await db
        .select({ slug: posts.slug })
        .from(posts)
        .where(eq(posts.id, entityId))
        .limit(1);
      return row?.slug ?? null;
    }
    default:
      return null;
  }
}

/** noindex every response from the approval session hop (PUX-079). */
function noIndex(res: NextResponse): NextResponse {
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  return res;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const link = await lookupApprovalLink(token);

  // Nothing in the approval flow may be indexed (PUX-079). The redirect itself
  // is stamped as well as the pages, so a crawler that ignores robots.txt still
  // gets an explicit directive on the hop that mints the credential.
  // `fallback=1` tells the page not to bounce back here, so a surface that
  // resolves on one side but not the other cannot ping-pong.
  if (!link || link.status !== 'pending' || !link.entityId) {
    return noIndex(NextResponse.redirect(new URL(`/approve/${token}?fallback=1`, req.url)));
  }

  const slug = await loadSlug(link.entityType, link.entityId, link.clientId);
  const surface = resolveApprovalSurface(link, slug);
  if (!surface) {
    return noIndex(NextResponse.redirect(new URL(`/approve/${token}?fallback=1`, req.url)));
  }

  // Same-origin by construction: surface.path is always an app-origin path, so
  // the cookie we are about to set travels with the redirect.
  const res = noIndex(NextResponse.redirect(new URL(surface.path, req.url)));
  res.cookies.set(APPROVAL_COOKIE, signApprovalCookie(token), approvalCookieOptions());
  return res;
}
