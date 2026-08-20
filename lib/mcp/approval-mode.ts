/**
 * Approval mode — the credential that lets an unauthenticated reviewer see ONE
 * draft artifact on its real product surface (PUX-061).
 *
 * `/approve/<token>` validates the approval link, mints a short-lived signed
 * httpOnly cookie naming that one link, and redirects to the artifact's real
 * route. Every surface then calls `resolveApprovalContext` to decide whether to
 * render draft state and show the approval bar.
 *
 * Three properties this file must never lose:
 *
 *   1. The cookie is a POINTER, not a grant. Presence proves nothing — every
 *      resolve re-reads the approval row so a spent (approved/rejected/expired)
 *      link stops rendering the draft immediately. This is why the credential is
 *      DB-backed rather than a stateless HMAC.
 *   2. It authorizes exactly ONE entity. A cookie minted for survey 12 must not
 *      open deck 12; callers pass the entity they are about to render and get
 *      null on mismatch.
 *   3. Tenancy is still the caller's job. This module proves "the reviewer holds
 *      a live link for this entity". It does NOT prove the entity belongs to the
 *      link's client — surfaces must check that against their own owner column
 *      (posts via websiteId → clientWebsites.clientId; decks/surveys/booking
 *      pages/templates carry clientId directly).
 *
 * The cookie is httpOnly on purpose: the raw token must never reach the DOM,
 * because on a site page the author's own `customJs` could scrape it and
 * self-approve their own draft. Decisions go through /api/approve/decision,
 * which reads this cookie server-side, so the bar never holds a token.
 */

import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import { lookupApprovalLink, type ApprovalLinkRow } from './approval-links';
import { APPROVAL_COOKIE } from './approval-cookie';

/**
 * Resolved per call, never at module load.
 *
 * Six product routes now import this module. A module-level throw would make
 * every one of them fail to even load without the env var set — which is
 * exactly what happened to five existing route tests. Importing this file must
 * be free; only actually signing or verifying requires the secret, and that
 * still fails loudly.
 */
function secret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET (or NEXTAUTH_SECRET) is required for approval mode.');
  return s;
}

export { APPROVAL_COOKIE };

/** 30 minutes. Re-minted by re-opening the approval link, so a reviewer who
 *  lingers just reloads /approve/<token> rather than losing their place. */
export const APPROVAL_TTL_MS = 30 * 60 * 1000;

/**
 * The approval context a surface renders against. Deliberately does NOT carry
 * the token — nothing that reaches a client component may contain it.
 */
export interface ApprovalContext {
  linkId: number;
  clientId: number;
  entityType: string;
  entityId: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  summary: string | null;
  expiresAt: Date | null;
  reviewerName: string | null;
  reviewedAt: Date | null;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

/**
 * Cookie value: `<token>.<expiresAtMs>.<hmac>`.
 *
 * The token is the whole payload — the approval row it names is authoritative
 * for entity, tenant and status, so nothing else is duplicated here and there
 * is nothing to keep in sync.
 */
export function signApprovalCookie(token: string, now = Date.now()): string {
  const exp = now + APPROVAL_TTL_MS;
  const payload = `${token}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/** Verify signature + expiry and return the token. Null on any tampering. */
export function parseApprovalCookie(raw: string | undefined, now = Date.now()): string | null {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [token, expRaw, mac] = parts;
  if (!/^[0-9a-f]{64}$/.test(token)) return null;

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= now) return null;

  const expected = Buffer.from(sign(`${token}.${expRaw}`), 'hex');
  let received: Buffer;
  try {
    received = Buffer.from(mac, 'hex');
  } catch {
    return null;
  }
  if (received.length !== expected.length) return null;
  if (!timingSafeEqual(received, expected)) return null;

  return token;
}

export function approvalCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(APPROVAL_TTL_MS / 1000),
  };
}

/** The raw token behind the current request's cookie, or null. Server-only —
 *  never pass the result into a client component. */
export async function readApprovalToken(): Promise<string | null> {
  // Approval mode is an opt-in overlay on ordinary public routes, so failing to
  // read the cookie store must degrade to "not a reviewer" — never throw. Next
  // makes `cookies()` unavailable in some rendering contexts, and a raised error
  // here would take down the public survey and booking endpoints for everyone.
  let store: Awaited<ReturnType<typeof cookies>>;
  try {
    store = await cookies();
  } catch {
    return null;
  }
  return parseApprovalCookie(store.get(APPROVAL_COOKIE)?.value);
}

function toContext(link: ApprovalLinkRow): ApprovalContext {
  return {
    linkId: link.id,
    clientId: link.clientId,
    entityType: link.entityType,
    entityId: link.entityId as number,
    status: link.status,
    summary: link.summary,
    expiresAt: link.expiresAt,
    reviewerName: link.reviewerName,
    reviewedAt: link.reviewedAt,
  };
}

/**
 * Resolve the approval context for the entity a surface is about to render.
 *
 * Returns null — meaning "render as a normal public visitor" — unless the
 * reviewer holds a live cookie for exactly this entity. Callers MUST treat null
 * as "no draft access", not as "skip the check".
 *
 * @param entityType the surface's entity kind, e.g. 'pitch_deck'
 * @param entityId   the id of the row about to be rendered
 */
export async function resolveApprovalContext(
  entityType: string,
  entityId: number,
): Promise<ApprovalContext | null> {
  const token = await readApprovalToken();
  if (!token) return null;

  // The row is authoritative, and it is re-read on every render: a link that was
  // approved, rejected or expired since the cookie was minted stops working here.
  const link = await lookupApprovalLink(token);
  if (!link) return null;
  if (link.status !== 'pending') return null;
  if (link.linkType !== 'entity') return null;
  if (link.entityType !== entityType) return null;
  if (link.entityId !== entityId) return null;

  return toContext(link);
}

/**
 * Resolve without binding to an entity — for the decision endpoint, which needs
 * the link the cookie names before it knows what is being decided.
 */
export async function resolveApprovalLink(): Promise<ApprovalLinkRow | null> {
  const token = await readApprovalToken();
  if (!token) return null;
  return lookupApprovalLink(token);
}

/**
 * Page metadata that keeps an approval-mode render out of search results
 * (PUX-079).
 *
 * `/s/<slug>`, `/book/<slug>` and `/pitch-deck/<slug>` are URLs a tenant WANTS
 * indexed — but never while they are showing an unpublished draft to a reviewer.
 * robots.txt cannot express "this URL, only in this state", so the surfaces
 * answer it in their own `generateMetadata`, which Next merges OVER the app's
 * default. One authoritative <meta robots> results, rather than a second tag
 * contradicting the first and relying on crawlers preferring the restrictive one.
 *
 * Keyed on cookie presence alone — no entity lookup, so ordinary public traffic
 * pays nothing beyond a cookie read. Over-applying noindex when a reviewer's
 * browser holds a cookie for some *other* artifact is deliberate: crawlers never
 * carry the cookie, so the only cost is a reviewer's own browser seeing noindex
 * on a public page, and the failure direction is the safe one.
 */
export async function approvalNoIndexMetadata(): Promise<{
  robots?: {
    index: false;
    follow: false;
    nocache: true;
    noarchive: true;
    nosnippet: true;
    noimageindex: true;
  };
}> {
  const token = await readApprovalToken();
  if (!token) return {};
  return {
    robots: {
      index: false,
      follow: false,
      // noindex alone stops the listing; the rest stop a draft leaking through
      // a cached copy, a search snippet, or image search while it is in review.
      nocache: true,
      noarchive: true,
      nosnippet: true,
      noimageindex: true,
    },
  };
}
