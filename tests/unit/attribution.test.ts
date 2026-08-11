// @vitest-environment node
/**
 * Unit tests for first-touch attribution (lib/attribution.ts).
 *
 * The two properties that make this data worth anything are (a) it is
 * write-once, so it stays FIRST touch rather than silently becoming last
 * touch, and (b) a direct visit doesn't burn the slot, so a campaign click
 * days later is still captured. Most of what follows pins those down.
 */
import { describe, it, expect } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  ATTRIBUTION_COOKIE,
  ensureAttributionCookie,
  parseAttributionCookie,
  readAttributionFromRequest,
} from '@/lib/attribution';

function req(url: string, opts: { referer?: string; cookie?: string } = {}) {
  const headers = new Headers();
  if (opts.referer) headers.set('referer', opts.referer);
  if (opts.cookie) headers.set('cookie', `${ATTRIBUTION_COOKIE}=${opts.cookie}`);
  return new NextRequest(new URL(url), { headers });
}

describe('readAttributionFromRequest', () => {
  it('returns null for a direct visit — the first-touch slot stays open', () => {
    expect(readAttributionFromRequest(req('https://simplerdevelopment.com/pricing'))).toBeNull();
  });

  it('captures utm parameters', () => {
    const a = readAttributionFromRequest(
      req('https://simplerdevelopment.com/?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_term=agency&utm_content=hero'),
    );
    expect(a).toMatchObject({ s: 'google', m: 'cpc', c: 'spring', t: 'agency', ct: 'hero' });
    expect(a?.l).toBe('/');
    expect(a?.ts).toBeTruthy();
  });

  it('records only the referrer HOST, never the full URL', () => {
    const a = readAttributionFromRequest(
      req('https://simplerdevelopment.com/blog', { referer: 'https://news.ycombinator.com/item?id=123&q=secret' }),
    );
    expect(a?.r).toBe('news.ycombinator.com');
    expect(JSON.stringify(a)).not.toContain('secret');
  });

  it('ignores a same-host referrer — internal navigation is not a source', () => {
    expect(
      readAttributionFromRequest(
        req('https://simplerdevelopment.com/pricing', { referer: 'https://simplerdevelopment.com/' }),
      ),
    ).toBeNull();
  });

  it('ignores a malformed Referer rather than throwing', () => {
    expect(readAttributionFromRequest(req('https://simplerdevelopment.com/', { referer: 'not a url' }))).toBeNull();
  });

  it('omits the query string from the landing path — utms are already captured', () => {
    const a = readAttributionFromRequest(req('https://simplerdevelopment.com/solutions?utm_source=x&token=abc'));
    expect(a?.l).toBe('/solutions');
  });

  it('caps an oversized field', () => {
    const a = readAttributionFromRequest(
      req(`https://simplerdevelopment.com/?utm_source=${'x'.repeat(5000)}`),
    );
    expect(a?.s?.length).toBe(128);
  });
});

describe('ensureAttributionCookie', () => {
  it('writes first touch when there is a campaign', () => {
    const res = NextResponse.next();
    ensureAttributionCookie(req('https://simplerdevelopment.com/?utm_source=linkedin'), res);
    const stored = parseAttributionCookie(res.cookies.get(ATTRIBUTION_COOKIE)?.value);
    expect(stored?.s).toBe('linkedin');
  });

  it('never overwrites an existing first touch — this is what makes it FIRST touch', () => {
    const res = NextResponse.next();
    ensureAttributionCookie(
      req('https://simplerdevelopment.com/?utm_source=second-campaign', {
        cookie: JSON.stringify({ s: 'original-campaign' }),
      }),
      res,
    );
    expect(res.cookies.get(ATTRIBUTION_COOKIE)).toBeUndefined();
  });

  it('writes nothing on a direct visit', () => {
    const res = NextResponse.next();
    ensureAttributionCookie(req('https://simplerdevelopment.com/'), res);
    expect(res.cookies.get(ATTRIBUTION_COOKIE)).toBeUndefined();
  });

  it('sets the cookie HttpOnly so page scripts cannot read it', () => {
    const res = NextResponse.next();
    ensureAttributionCookie(req('https://simplerdevelopment.com/?utm_source=x'), res);
    expect(res.cookies.get(ATTRIBUTION_COOKIE)?.httpOnly).toBe(true);
  });
});

describe('parseAttributionCookie', () => {
  it('round-trips what ensureAttributionCookie wrote', () => {
    const res = NextResponse.next();
    ensureAttributionCookie(
      req('https://simplerdevelopment.com/pricing?utm_source=google&utm_campaign=q3'),
      res,
    );
    const parsed = parseAttributionCookie(res.cookies.get(ATTRIBUTION_COOKIE)?.value);
    expect(parsed).toMatchObject({ s: 'google', c: 'q3', l: '/pricing' });
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['malformed json', '{not json'],
    ['a json array', '["nope"]'],
    ['a json scalar', '"nope"'],
    ['an object with no known keys', '{"evil":"x"}'],
  ])('returns null for %s', (_label, value) => {
    expect(parseAttributionCookie(value as string | undefined)).toBeNull();
  });

  it('re-caps oversized values on read — the cookie is client-supplied', () => {
    const parsed = parseAttributionCookie(JSON.stringify({ s: 'y'.repeat(9000) }));
    expect(parsed?.s?.length).toBe(128);
  });

  it('drops non-string values rather than passing them to the database', () => {
    const parsed = parseAttributionCookie(JSON.stringify({ s: 'ok', m: { nested: true }, c: 42 }));
    expect(parsed).toEqual({ s: 'ok' });
  });
});
