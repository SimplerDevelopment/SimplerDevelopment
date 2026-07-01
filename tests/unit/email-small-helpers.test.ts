// @vitest-environment node
/**
 * Unit tests for three small email-module surfaces:
 *
 *   - lib/email/index.ts        — Resend lazy client + Proxy + unsubscribe
 *                                 token helpers + campaign HTML builders.
 *   - lib/email/invite-email.ts — team-invite transactional email.
 *   - lib/email/render-cache.ts — DB-backed read-through render cache
 *                                 (the pure helpers are exercised in
 *                                 email-render-cache.test.ts; here we
 *                                 cover the DB-touching wrapper).
 *
 * All external deps (Resend, the Drizzle db handle) are mocked so the
 * file is a pure unit test — no network, no DATABASE_URL required.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Block } from '@/types/blocks';

// ---------------------------------------------------------------------------
// Module-level mocks (must be declared before any `import` from the SUT).
// ---------------------------------------------------------------------------

// `resend` package — capture the constructor key so we can assert lazy init.
const resendInstances: Array<{ key: string }> = [];
vi.mock('resend', () => {
  return {
    Resend: class {
      key: string;
      emails = { send: vi.fn().mockResolvedValue({ data: { id: 'msg_default' }, error: null }) };
      domains = { list: vi.fn().mockResolvedValue({ data: [] }) };
      constructor(key: string) {
        this.key = key;
        resendInstances.push(this);
      }
    },
  };
});

// Drizzle db — used by render-cache.ts (`getOrRenderCampaignHtml`).
// We feed it a tiny stub that lets us toggle cache hit vs miss per test
// and capture inserted rows.
type Recorded = { campaignId: number; blocksHash: string; html: string; subject: string | null };
const dbState: {
  selectHit: { html: string } | null;
  inserted: Recorded[];
} = { selectHit: null, inserted: [] };

vi.mock('@/lib/db', () => {
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => Promise.resolve(dbState.selectHit ? [dbState.selectHit] : []),
            }),
          }),
        }),
      }),
      insert: () => ({
        values: (v: Recorded) => {
          dbState.inserted.push(v);
          return Promise.resolve();
        },
      }),
    },
  };
});

vi.mock('@/lib/db/schema', () => ({
  emailRenders: {
    campaignId: { name: 'campaignId' },
    blocksHash: { name: 'blocksHash' },
    html: { name: 'html' },
    subject: { name: 'subject' },
    generatedAt: { name: 'generatedAt' },
  },
}));

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------
const ORIG_ENV = { ...process.env };
function resetEnv() {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIG_ENV);
}

beforeEach(() => {
  resendInstances.length = 0;
  dbState.selectHit = null;
  dbState.inserted = [];
  vi.resetModules();
});

afterEach(() => {
  resetEnv();
});

// ===========================================================================
// lib/email/index.ts
// ===========================================================================
describe('lib/email/index — getResend', () => {
  it('throws when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    const mod = await import('@/lib/email');
    expect(() => mod.getResend()).toThrow(/RESEND_API_KEY is not set/);
  });

  it('lazily constructs a Resend client with the env key, exactly once', async () => {
    process.env.RESEND_API_KEY = 're_test_key_123';
    const mod = await import('@/lib/email');
    const a = mod.getResend();
    const b = mod.getResend();
    expect(a).toBe(b);
    expect(resendInstances).toHaveLength(1);
    expect(resendInstances[0].key).toBe('re_test_key_123');
  });

  it('does NOT eagerly construct on module import (proxy is lazy)', async () => {
    delete process.env.RESEND_API_KEY;
    // Importing must succeed even without a key — that's the whole reason
    // for the Proxy. Constructor must not have run yet.
    await import('@/lib/email');
    expect(resendInstances).toHaveLength(0);
  });
});

describe('lib/email/index — resend proxy', () => {
  it('routes emails.send through the configured email transport', async () => {
    process.env.RESEND_API_KEY = 're_test_proxy';
    const mod = await import('@/lib/email');
    const emails = (mod.resend as unknown as { emails: { send: (...a: unknown[]) => Promise<unknown> } }).emails;
    expect(emails).toBeDefined();
    expect(typeof emails.send).toBe('function');
    const res = await emails.send({ from: 'a@test.test', to: 'x@y', subject: 'Test', html: '<p>Hi</p>' });
    expect(res).toEqual({ data: { id: 'msg_default' }, error: null });
    expect(resendInstances).toHaveLength(1);
  });

  it('throws via emails.send when the env key is missing', async () => {
    delete process.env.RESEND_API_KEY;
    const mod = await import('@/lib/email');
    const emails = (mod.resend as unknown as { emails: { send: (...a: unknown[]) => Promise<unknown> } }).emails;
    await expect(emails.send({ from: 'a@test.test', to: 'x@y', subject: 'Test', html: '<p>Hi</p>' }))
      .rejects.toThrow(/RESEND_API_KEY/);
  });
});

describe('lib/email/index — generateUnsubscribeToken', () => {
  it('returns a 64-char lowercase hex string (32 random bytes)', async () => {
    const mod = await import('@/lib/email');
    const tok = mod.generateUnsubscribeToken();
    expect(tok).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a different token across calls', async () => {
    const mod = await import('@/lib/email');
    const a = mod.generateUnsubscribeToken();
    const b = mod.generateUnsubscribeToken();
    expect(a).not.toBe(b);
  });
});

describe('lib/email/index — buildUnsubscribeUrl', () => {
  it('uses NEXTAUTH_URL when set', async () => {
    process.env.NEXTAUTH_URL = 'https://mail.example.test';
    const mod = await import('@/lib/email');
    expect(mod.buildUnsubscribeUrl('abc')).toBe(
      'https://mail.example.test/api/email/unsubscribe?token=abc',
    );
  });

  it('falls back to http://localhost:3000 when NEXTAUTH_URL is unset', async () => {
    delete process.env.NEXTAUTH_URL;
    const mod = await import('@/lib/email');
    expect(mod.buildUnsubscribeUrl('xyz')).toBe(
      'http://localhost:3000/api/email/unsubscribe?token=xyz',
    );
  });
});

describe('lib/email/index — buildCampaignHtml(FromBlocks)', () => {
  it('wraps content in a full HTML document and embeds the unsub URL', async () => {
    const mod = await import('@/lib/email');
    const out = mod.buildCampaignHtml(
      '<p>Hello world</p>',
      'https://x.test/unsub?t=42',
      'Preview!',
    );
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out).toContain('Hello world');
    // preview text may be rendered into the document head/preheader
    expect(out).toContain('Preview!');
  });

  it('renders blocks to email html and substitutes the placeholder token', async () => {
    const mod = await import('@/lib/email');
    const blocks: Block[] = [
      { id: 'h', type: 'heading', order: 0, content: 'Hi {{UNSUBSCRIBE_URL}} placeholder', level: 1 },
      { id: 'f', type: 'email-footer', order: 1, companyName: 'Acme' },
    ];
    const out = mod.buildCampaignHtmlFromBlocks(
      { blocks } as unknown as Parameters<typeof mod.buildCampaignHtmlFromBlocks>[0],
      'https://x.test/unsub?t=99',
    );
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out).toContain('https://x.test/unsub?t=99');
    // Placeholder must be replaced everywhere in the inner HTML.
    expect(out).not.toContain('{{UNSUBSCRIBE_URL}}');
  });
});

// ===========================================================================
// lib/email/invite-email.ts
// ===========================================================================
describe('lib/email/invite-email — sendInviteEmail', () => {
  it('calls resend.emails.send with from / to / subject / html populated', async () => {
    process.env.RESEND_API_KEY = 're_test_invite';
    process.env.NEXTAUTH_URL = 'https://portal.example.test';
    process.env.RESEND_FROM_EMAIL = 'sender@example.test';

    const { sendInviteEmail } = await import('@/lib/email/invite-email');
    const result = await sendInviteEmail({
      recipientEmail: 'new@example.test',
      recipientName: 'Newbie',
      companyName: 'Acme Co',
      inviterName: 'Alice',
      role: 'member',
      inviteToken: 'tok_123',
    });
    expect(result).toEqual({ data: { id: 'msg_default' }, error: null });

    const inst = resendInstances[0];
    const sendCall = inst.emails.send.mock.calls[0][0];
    expect(sendCall.from).toBe('Simpler Development <sender@example.test>');
    expect(sendCall.to).toBe('new@example.test');
    expect(sendCall.subject).toBe('Alice invited you to Acme Co');
    expect(sendCall.html).toContain('Newbie');
    expect(sendCall.html).toContain('Acme Co');
    expect(sendCall.html).toContain('Alice');
    // role 'member' → 'Team Member' label
    expect(sendCall.html).toContain('Team Member');
    // gets indefinite article 'a' for consonant-starting label
    expect(sendCall.html).toMatch(/as a\s+<strong>Team Member<\/strong>/);
    // invite URL includes token + base
    expect(sendCall.html).toContain(
      'https://portal.example.test/portal/invite/tok_123',
    );
  });

  it('renders an "Owner" role label with the article "an"', async () => {
    process.env.RESEND_API_KEY = 're_test_invite2';
    const { sendInviteEmail } = await import('@/lib/email/invite-email');
    await sendInviteEmail({
      recipientEmail: 'o@example.test',
      recipientName: 'O',
      companyName: 'Acme',
      inviterName: 'I',
      role: 'owner',
      inviteToken: 'tok',
    });
    const html = resendInstances[0].emails.send.mock.calls[0][0].html as string;
    expect(html).toContain('Owner');
    expect(html).toMatch(/as an\s+<strong>Owner<\/strong>/);
  });

  it('renders an "Admin" role label with the article "an"', async () => {
    process.env.RESEND_API_KEY = 're_test_invite3';
    const { sendInviteEmail } = await import('@/lib/email/invite-email');
    await sendInviteEmail({
      recipientEmail: 'a@example.test',
      recipientName: 'A',
      companyName: 'Acme',
      inviterName: 'I',
      role: 'admin',
      inviteToken: 'tok',
    });
    const html = resendInstances[0].emails.send.mock.calls[0][0].html as string;
    expect(html).toMatch(/as an\s+<strong>Admin<\/strong>/);
  });

  it('renders a Viewer role label with article "a"', async () => {
    process.env.RESEND_API_KEY = 're_test_invite4';
    const { sendInviteEmail } = await import('@/lib/email/invite-email');
    await sendInviteEmail({
      recipientEmail: 'v@example.test',
      recipientName: 'V',
      companyName: 'Acme',
      inviterName: 'I',
      role: 'viewer',
      inviteToken: 'tok',
    });
    const html = resendInstances[0].emails.send.mock.calls[0][0].html as string;
    expect(html).toMatch(/as a\s+<strong>Viewer<\/strong>/);
  });

  it('falls back to "Team Member" for an unknown role', async () => {
    process.env.RESEND_API_KEY = 're_test_invite5';
    const { sendInviteEmail } = await import('@/lib/email/invite-email');
    await sendInviteEmail({
      recipientEmail: 'u@example.test',
      recipientName: 'U',
      companyName: 'Acme',
      inviterName: 'I',
      role: 'something-weird',
      inviteToken: 'tok',
    });
    const html = resendInstances[0].emails.send.mock.calls[0][0].html as string;
    expect(html).toContain('Team Member');
  });

  it('falls back to default BASE_URL + FROM_EMAIL when env is unset', async () => {
    process.env.RESEND_API_KEY = 're_test_invite6';
    delete process.env.NEXTAUTH_URL;
    delete process.env.RESEND_FROM_EMAIL;
    const { sendInviteEmail } = await import('@/lib/email/invite-email');
    await sendInviteEmail({
      recipientEmail: 'd@example.test',
      recipientName: 'D',
      companyName: 'C',
      inviterName: 'I',
      role: 'member',
      inviteToken: 'tok_default',
    });
    const call = resendInstances[0].emails.send.mock.calls[0][0];
    expect(call.from).toBe('Simpler Development <portal@simplerdevelopment.com>');
    expect(call.html).toContain('https://simplerdevelopment.com/portal/invite/tok_default');
  });
});

// ===========================================================================
// lib/email/render-cache.ts (DB-backed wrapper)
// ===========================================================================
describe('lib/email/render-cache — getOrRenderCampaignHtml', () => {
  const sampleBlocks = (): Block[] => [
    { id: 'h', type: 'heading', order: 0, content: 'Welcome', level: 1 },
    { id: 't', type: 'text', order: 1, content: 'Body copy.' },
  ];

  it('returns a cache HIT without inserting when the row already exists', async () => {
    dbState.selectHit = { html: '<!DOCTYPE html><html>cached body</html>' };
    const { getOrRenderCampaignHtml } = await import('@/lib/email/render-cache');
    const out = await getOrRenderCampaignHtml(42, sampleBlocks());
    expect(out.cached).toBe(true);
    expect(out.html).toContain('cached body');
    expect(out.text).toContain('cached body');
    expect(out.blocksHash).toMatch(/^[0-9a-f]{64}$/);
    expect(dbState.inserted).toHaveLength(0);
  });

  it('renders fresh + inserts on cache MISS and uses the {{UNSUBSCRIBE_URL}} placeholder', async () => {
    dbState.selectHit = null;
    const { getOrRenderCampaignHtml } = await import('@/lib/email/render-cache');
    const out = await getOrRenderCampaignHtml(7, sampleBlocks(), {
      previewText: 'Preview line',
      subject: 'Hello there',
    });
    expect(out.cached).toBe(false);
    expect(out.html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out.html).toContain('Welcome');
    // Body should retain the literal placeholder for per-recipient rewrite.
    expect(out.html).toContain('{{UNSUBSCRIBE_URL}}');
    expect(out.text).toContain('Welcome');
    expect(dbState.inserted).toHaveLength(1);
    const row = dbState.inserted[0];
    expect(row.campaignId).toBe(7);
    expect(row.blocksHash).toBe(out.blocksHash);
    expect(row.subject).toBe('Hello there');
    expect(row.html).toBe(out.html);
  });

  it('writes subject=null when not supplied', async () => {
    dbState.selectHit = null;
    const { getOrRenderCampaignHtml } = await import('@/lib/email/render-cache');
    await getOrRenderCampaignHtml(11, sampleBlocks());
    expect(dbState.inserted).toHaveLength(1);
    expect(dbState.inserted[0].subject).toBeNull();
  });

  it('re-exports the pure helpers from render-cache-core', async () => {
    const mod = await import('@/lib/email/render-cache');
    expect(typeof mod.hashBlocks).toBe('function');
    expect(typeof mod.htmlToText).toBe('function');
    expect(typeof mod.renderCampaignPreview).toBe('function');
    // Sanity-check the contract: hashBlocks emits sha256 hex.
    expect(mod.hashBlocks(sampleBlocks())).toMatch(/^[0-9a-f]{64}$/);
  });
});
