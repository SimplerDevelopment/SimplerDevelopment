/**
 * Where an approval link's artifact actually lives — the real product surface a
 * reviewer should be sent to (PUX-060).
 *
 * This map is the seam the map's surface cards plug into. An entity type returns
 * null until its route has been taught to accept the approval cookie; `/approve/
 * <token>` then falls back to rendering today's preview page for it. That keeps
 * the flow working end-to-end while the surfaces land one card at a time, and
 * makes "which surfaces are converted" a single readable list rather than
 * knowledge spread across six routes.
 *
 * Wired so far:
 *   - pitch_deck (PUX-069)
 *   - survey     (PUX-068)
 *   - booking_page (PUX-070)
 *
 * Deliberately never wired:
 *   - post — RULED OUT OF SCOPE (PUX-071). A site page runs author-controlled
 *     customJs, and the author is the party seeking approval. The credential is
 *     a cookie, so it rides same-origin requests automatically — the author's
 *     own script could POST /api/approve/decision and self-approve their draft.
 *     Posts keep the sandboxed iframe preview and its page-scoped preview token.
 *   - pending_change — nothing is materialised, so there is no artifact to show
 *   - email_campaign — awaiting PUX-064 (which surface renders a campaign)
 *   - block_template — awaiting PUX-065 (whether a real surface exists at all)
 *
 * IMPORTANT (PUX-061 invariant): every path returned here must be on the APP
 * origin. The approval cookie is set on the app domain, so redirecting a reviewer
 * to a tenant's own hostname or vercelDomain silently drops the credential and
 * 404s them. Post previews therefore use the `/sites/<identifier>/<path>` form,
 * never the custom domain.
 */

import type { ApprovalLinkRow } from './approval-links';

export interface ApprovalSurface {
  /** App-origin path to redirect the reviewer to. */
  path: string;
}

/**
 * Resolve the real surface for a link, or null when this entity type has no
 * converted surface yet and should fall back to the legacy approval page.
 *
 * `slug` is passed in by the caller because only it has already loaded the row.
 */
export function resolveApprovalSurface(
  link: Pick<ApprovalLinkRow, 'linkType' | 'entityType'>,
  slug: string | null,
): ApprovalSurface | null {
  if (link.linkType !== 'entity' || !slug) return null;

  switch (link.entityType) {
    case 'pitch_deck':
      // ?preview=1 is the deck route's existing draft-preview entry point; the
      // approval cookie rides along and authorizes it in place of a session.
      return { path: `/pitch-deck/${encodeURIComponent(slug)}?preview=1` };
    case 'survey':
      // The ordinary public form URL. Draft access is granted by the approval
      // cookie inside GET /api/surveys/<slug>, so no preview flag is needed.
      return { path: `/s/${encodeURIComponent(slug)}` };
    case 'booking_page':
      // The ordinary public booking URL. Access to an INACTIVE page is granted
      // by the approval cookie inside GET /api/public/booking/<slug>.
      return { path: `/book/${encodeURIComponent(slug)}` };
    default:
      return null;
  }
}
