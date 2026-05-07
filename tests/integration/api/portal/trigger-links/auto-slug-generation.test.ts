/**
 * Trigger links — auto-slug generation.
 *
 * The route generates an 8-char Crockford base32 slug (`a-z0-9` minus
 * `i/l/o/u`) when the caller doesn't supply one. With ~1.1e12 possibilities
 * the practical collision probability over a few thousand inserts is
 * vanishing, but the route also retries on UNIQUE-violation up to 5 times.
 *
 * This spec asserts the contract:
 *   - 100 sequential POSTs without an explicit slug each get a fresh slug.
 *   - Every generated slug matches the documented charset.
 *   - All 100 are unique (DB UNIQUE plus the random generator agreeing).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';

const SLUG_RE = /^[0-9abcdefghjkmnpqrstvwxyz]{8}$/;

describe('POST /api/portal/trigger-links auto-slug generation @trigger-links', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('triglinks-autoslug');
  });

  it('a single POST without slug produces a valid base32 slug', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/trigger-links/route');
    const res = await callHandler<{ data: { link: { slug: string } } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { destinationUrl: 'https://example.com/x' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.link?.slug).toMatch(SLUG_RE);
  });

  it('100 POSTs without explicit slug each generate a unique base32 slug', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/trigger-links/route');

    const slugs: string[] = [];
    const N = 100;
    for (let i = 0; i < N; i++) {
      const res = await callHandler<{ success: boolean; data: { link: { slug: string } } }>(
        route as unknown as Record<string, unknown>, 'POST',
        { body: { destinationUrl: `https://example.com/loop/${i}` } },
      );
      expect(res.status).toBe(200);
      expect(res.data?.success).toBe(true);
      const slug = res.data?.data?.link?.slug;
      expect(slug).toBeDefined();
      expect(slug!).toMatch(SLUG_RE);
      slugs.push(slug!);
    }

    expect(slugs.length).toBe(N);
    // All unique — Set size equals array length only when no collisions slipped
    // through. The DB has a UNIQUE constraint, so a collision would either be
    // caught by the route's retry or bubble up as a 500 (which `expect 200`
    // above would already have caught).
    expect(new Set(slugs).size).toBe(N);
  });
});
