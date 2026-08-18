// @vitest-environment node
/**
 * Unit tests for the approval-mode credential (PUX-061) and the read-only write
 * gate (PUX-067).
 *
 * These two pieces are what let an unauthenticated reviewer see a draft on the
 * real product surface without being able to change anything, so the properties
 * asserted here are security properties, not conveniences:
 *
 *   - a tampered or expired cookie yields nothing
 *   - the gate is default-deny: unknown write paths are blocked, and only the
 *     explicitly shimmed ones get through
 *
 * `resolveApprovalContext` itself is DB-coupled and is covered by the
 * per-surface tests; what is unit-tested here is the crypto and the gate logic,
 * which are pure.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { isApprovalWriteBlocked, APPROVAL_SHIMMED_PATHS } from '@/lib/mcp/approval-write-gate';

// approval-mode pulls in approval-links → lib/db purely for the row lookup.
// The crypto under test needs none of it, so the client is stubbed rather than
// requiring a live DATABASE_URL (same pattern as tests/unit/mcp-approvals.test.ts).
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({ mcpApprovalLinks: {} }));

beforeAll(() => {
  process.env.AUTH_SECRET ??= 'test-secret-for-approval-mode';
});

const TOKEN = 'a'.repeat(64);

async function mod() {
  return import('@/lib/mcp/approval-mode');
}

describe('approval cookie', () => {
  it('round-trips a freshly signed cookie', async () => {
    const { signApprovalCookie, parseApprovalCookie } = await mod();
    expect(parseApprovalCookie(signApprovalCookie(TOKEN))).toBe(TOKEN);
  });

  it('rejects a tampered signature', async () => {
    const { signApprovalCookie, parseApprovalCookie } = await mod();
    const raw = signApprovalCookie(TOKEN);
    const [token, exp] = raw.split('.');
    const forged = `${token}.${exp}.${'f'.repeat(64)}`;
    expect(parseApprovalCookie(forged)).toBeNull();
  });

  it('rejects a swapped token even with a valid-looking envelope', async () => {
    const { signApprovalCookie, parseApprovalCookie } = await mod();
    const raw = signApprovalCookie(TOKEN);
    const [, exp, mac] = raw.split('.');
    // Someone else's token, this token's signature — must not validate.
    expect(parseApprovalCookie(`${'b'.repeat(64)}.${exp}.${mac}`)).toBeNull();
  });

  it('rejects an expired cookie', async () => {
    const { signApprovalCookie, parseApprovalCookie, APPROVAL_TTL_MS } = await mod();
    const raw = signApprovalCookie(TOKEN, Date.now() - APPROVAL_TTL_MS - 1000);
    expect(parseApprovalCookie(raw)).toBeNull();
  });

  it('rejects malformed input', async () => {
    const { parseApprovalCookie } = await mod();
    expect(parseApprovalCookie(undefined)).toBeNull();
    expect(parseApprovalCookie('')).toBeNull();
    expect(parseApprovalCookie('nope')).toBeNull();
    expect(parseApprovalCookie('a.b')).toBeNull();
    // Non-hex token shape is rejected before any HMAC work.
    expect(parseApprovalCookie(`${'z'.repeat(64)}.${Date.now() + 1000}.${'f'.repeat(64)}`)).toBeNull();
  });

  it('sets an httpOnly cookie so page scripts cannot read the token', async () => {
    const { approvalCookieOptions } = await mod();
    expect(approvalCookieOptions().httpOnly).toBe(true);
  });
});

describe('approval surface map', () => {
  const entity = (entityType: string) =>
    ({ linkType: 'entity' as const, entityType }) as Parameters<
      typeof import('@/lib/mcp/approval-surface').resolveApprovalSurface
    >[0];

  it('sends a deck to the real presentation route', async () => {
    const { resolveApprovalSurface } = await import('@/lib/mcp/approval-surface');
    expect(resolveApprovalSurface(entity('pitch_deck'), 'q3-pitch')?.path).toBe(
      '/pitch-deck/q3-pitch?preview=1',
    );
  });

  it('returns an app-origin RELATIVE path, never a tenant hostname', async () => {
    // PUX-061 invariant: the approval cookie is set on the app origin, so a
    // redirect to a custom domain would silently drop it and 404 the reviewer.
    const { resolveApprovalSurface } = await import('@/lib/mcp/approval-surface');
    const path = resolveApprovalSurface(entity('pitch_deck'), 'q3-pitch')?.path ?? '';
    expect(path.startsWith('/')).toBe(true);
    expect(path).not.toMatch(/^https?:\/\//);
  });

  it('sends a survey to the real public form', async () => {
    const { resolveApprovalSurface } = await import('@/lib/mcp/approval-surface');
    expect(resolveApprovalSurface(entity('survey'), 'intake')?.path).toBe('/s/intake');
  });

  it('sends a booking page to the real public widget', async () => {
    const { resolveApprovalSurface } = await import('@/lib/mcp/approval-surface');
    expect(resolveApprovalSurface(entity('booking_page'), 'discovery-call')?.path).toBe(
      '/book/discovery-call',
    );
  });

  it('never resolves a post — ruled out of scope, keeps the sandboxed iframe', async () => {
    // PUX-071: author customJs + an ambient cookie = self-approval. Permanent.
    const { resolveApprovalSurface } = await import('@/lib/mcp/approval-surface');
    expect(resolveApprovalSurface(entity('post'), 'about')).toBeNull();
  });

  it('escapes the slug', async () => {
    const { resolveApprovalSurface } = await import('@/lib/mcp/approval-surface');
    expect(resolveApprovalSurface(entity('pitch_deck'), 'a b&c')?.path).toBe(
      '/pitch-deck/a%20b%26c?preview=1',
    );
  });

  it('falls back to the legacy page for unconverted entity types', async () => {
    const { resolveApprovalSurface } = await import('@/lib/mcp/approval-surface');
    for (const t of ['email_campaign', 'block_template']) {
      expect(resolveApprovalSurface(entity(t), 'x')).toBeNull();
    }
  });

  it('never resolves a pending_change — nothing is materialised to show', async () => {
    const { resolveApprovalSurface } = await import('@/lib/mcp/approval-surface');
    expect(
      resolveApprovalSurface(
        { linkType: 'pending_change', entityType: 'post' } as Parameters<
          typeof import('@/lib/mcp/approval-surface').resolveApprovalSurface
        >[0],
        'x',
      ),
    ).toBeNull();
  });

  it('resolves nothing without a slug', async () => {
    const { resolveApprovalSurface } = await import('@/lib/mcp/approval-surface');
    expect(resolveApprovalSurface(entity('pitch_deck'), null)).toBeNull();
  });
});

describe('approval write gate', () => {
  const withCookie = (method: string, pathname: string) =>
    isApprovalWriteBlocked({ method, pathname, hasApprovalCookie: true });

  it('never blocks a request without the approval cookie', () => {
    expect(
      isApprovalWriteBlocked({
        method: 'POST',
        pathname: '/api/surveys/x',
        hasApprovalCookie: false,
      }),
    ).toBe(false);
  });

  it('allows reads in approval mode', () => {
    expect(withCookie('GET', '/api/surveys/x')).toBe(false);
    expect(withCookie('HEAD', '/api/surveys/x')).toBe(false);
    expect(withCookie('OPTIONS', '/api/surveys/x')).toBe(false);
  });

  it('blocks every write method by default', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(withCookie(m, '/api/crm/deals')).toBe(true);
    }
  });

  it('is default-deny for paths nobody has thought about yet', () => {
    expect(withCookie('POST', '/api/some/route/added/next/year')).toBe(true);
    expect(withCookie('POST', '/api/public/booking/slug')).toBe(true);
  });

  it('lets the decision endpoint through — the one write a reviewer may make', () => {
    expect(withCookie('POST', '/api/approve/decision')).toBe(false);
  });

  it('does not let a lookalike path masquerade as a shimmed one', () => {
    // Prefix matching must be path-segment aware, not a bare startsWith.
    expect(withCookie('POST', '/api/approve/decisionx')).toBe(true);
    expect(withCookie('POST', '/api/approve/decision-evil')).toBe(true);
  });

  it('treats lowercase methods as writes', () => {
    expect(withCookie('post', '/api/crm/deals')).toBe(true);
  });

  it('shims the survey endpoints a reviewer must walk, and nothing adjacent', () => {
    // Submit + partial-save are shimmed so the reviewer reaches the thank-you
    // screen (PUX-067). Their siblings have no shim and must stay blocked —
    // this is what the segment-exact matcher buys over a prefix match.
    expect(withCookie('POST', '/api/surveys/my-form')).toBe(false);
    expect(withCookie('POST', '/api/surveys/my-form/partial')).toBe(false);
    expect(withCookie('POST', '/api/surveys/my-form/upload')).toBe(true);
    expect(withCookie('POST', '/api/surveys/my-form/certificate')).toBe(true);
    expect(withCookie('POST', '/api/surveys/my-form/results')).toBe(true);
    // A :param is exactly one segment — it must not swallow a deeper path.
    expect(withCookie('POST', '/api/surveys/a/b/c')).toBe(true);
  });

  it('shims the booking submit but not the rest of the funnel', () => {
    // The reviewer must reach the confirmation screen (PUX-067), so /book is
    // shimmed and returns a synthetic result. Everything else that mutates a
    // real reservation stays blocked.
    expect(withCookie('POST', '/api/public/booking/discovery/book')).toBe(false);
    expect(withCookie('POST', '/api/public/booking/discovery/validate-discount')).toBe(false);
    expect(withCookie('POST', '/api/public/gift-certificates/validate')).toBe(false);
    // Not shimmed — these act on real, already-created bookings.
    expect(withCookie('POST', '/api/public/booking/reschedule')).toBe(true);
    expect(withCookie('POST', '/api/public/booking/cancel')).toBe(true);
    expect(withCookie('POST', '/api/public/booking/discovery/waiver')).toBe(true);
  });

  it('keeps the shim allowlist short — every entry is a security decision', () => {
    // Tripwire: if this grows, the diff should force someone to justify it.
    expect(APPROVAL_SHIMMED_PATHS.length).toBeLessThanOrEqual(8);
  });
});
