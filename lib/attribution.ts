/**
 * First-touch attribution — how a lead found us.
 *
 * Deliberately NOT an analytics pipeline. There is no pageview table and no
 * write on ordinary traffic: the campaign that brought someone here is stamped
 * once into a cookie at first touch, then copied onto the CRM contact when
 * they actually convert. One row per lead, written at conversion time, instead
 * of one row per view written forever.
 *
 * What that buys and costs: you can answer "which campaign produced this
 * client" — the question that decides where to spend. You cannot answer
 * "what was their fifth touch", because multi-touch journeys need the pageview
 * log this deliberately avoids. At consulting volume the first question is the
 * one worth money.
 *
 * FIRST *MEANINGFUL* TOUCH, not literally first. A direct visit with no
 * referrer records nothing, so a campaign click days later still gets
 * captured. Strict first-touch would lock in "direct" forever and throw away
 * the only signal that has any value. The trade: someone who bookmarks the
 * site, returns via an ad, and converts is credited to the ad.
 */

import type { NextRequest, NextResponse } from 'next/server';

export const ATTRIBUTION_COOKIE = 'sd_attr';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Per-field cap. Values come straight from a URL an attacker controls, and
 *  this rides on every subsequent request as a cookie — so it is bounded hard
 *  rather than trusted. */
const MAX_FIELD = 128;
/** Refuse to set a cookie larger than this; a bloated one would be sent on
 *  every request forever. */
const MAX_COOKIE_BYTES = 1024;

/** Short keys: this is serialized into a cookie sent on every request. */
export interface Attribution {
  /** utm_source */ s?: string;
  /** utm_medium */ m?: string;
  /** utm_campaign */ c?: string;
  /** utm_term */ t?: string;
  /** utm_content */ ct?: string;
  /** Referrer HOST only — never the full URL, which can carry PII in its
   *  query string (search terms, session tokens on badly-built sites). */
  r?: string;
  /** Landing path, no query string (the UTMs are already captured above). */
  l?: string;
  /** First-touch timestamp, ISO. */
  ts?: string;
}

function clean(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_FIELD);
}

/** Referrers from our own host aren't a source — that's just navigation. */
function externalReferrerHost(referer: string | null, selfHost: string | null): string | undefined {
  if (!referer) return undefined;
  try {
    const host = new URL(referer).host;
    if (!host || (selfHost && host === selfHost)) return undefined;
    return clean(host);
  } catch {
    return undefined; // malformed Referer header — ignore, never throw
  }
}

/**
 * Build an Attribution from a request, or null when there is nothing worth
 * recording (a direct visit with no campaign and no external referrer).
 */
export function readAttributionFromRequest(req: NextRequest): Attribution | null {
  const p = req.nextUrl.searchParams;
  const attribution: Attribution = {
    s: clean(p.get('utm_source')),
    m: clean(p.get('utm_medium')),
    c: clean(p.get('utm_campaign')),
    t: clean(p.get('utm_term')),
    ct: clean(p.get('utm_content')),
    r: externalReferrerHost(req.headers.get('referer'), req.nextUrl.host),
  };

  // Nothing to attribute — don't burn the first-touch slot on a direct visit.
  if (!attribution.s && !attribution.m && !attribution.c && !attribution.r) return null;

  attribution.l = clean(req.nextUrl.pathname);
  attribution.ts = new Date().toISOString();

  // Drop undefined keys so the cookie stays small and the stored JSON is clean.
  return Object.fromEntries(
    Object.entries(attribution).filter(([, v]) => v !== undefined),
  ) as Attribution;
}

/**
 * Stamp first-touch attribution if we don't already have it. Idempotent and
 * write-once: an existing cookie is never overwritten, which is what makes
 * this first-touch rather than last-touch.
 */
export function ensureAttributionCookie(req: NextRequest, res: NextResponse): void {
  if (req.cookies.get(ATTRIBUTION_COOKIE)?.value) return;

  const attribution = readAttributionFromRequest(req);
  if (!attribution) return;

  const value = JSON.stringify(attribution);
  if (Buffer.byteLength(value, 'utf8') > MAX_COOKIE_BYTES) return;

  res.cookies.set({
    name: ATTRIBUTION_COOKIE,
    value,
    // HttpOnly: nothing client-side needs to read this, and it keeps the
    // value out of reach of any third-party script on the page.
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
}

/**
 * Parse a stored cookie value back into an Attribution. Returns null for
 * anything malformed — a bad cookie must never break a conversion, which is
 * the whole point of keeping this out of the critical path.
 */
export function parseAttributionCookie(raw: string | undefined | null): Attribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    // Re-clean on read: the cookie is client-supplied and could have been
    // hand-edited to something enormous before it reaches the database.
    const out: Attribution = {};
    for (const key of ['s', 'm', 'c', 't', 'ct', 'r', 'l', 'ts'] as const) {
      const v = (parsed as Record<string, unknown>)[key];
      if (typeof v === 'string') {
        const cleaned = clean(v);
        if (cleaned) out[key] = cleaned;
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}
