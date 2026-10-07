import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hash } from 'bcryptjs';
import { and, eq } from 'drizzle-orm';

const requestContext = vi.hoisted(() => ({ headers: new Headers(), activeClientId: 0 }));
vi.mock('next/headers', () => ({
  headers: async () => requestContext.headers,
  cookies: async () => ({ get: (name: string) => name === 'sd-active-client' && requestContext.activeClientId
    ? { value: String(requestContext.activeClientId) } : undefined }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { brainNotes, clientMembers, portalApiKeys, privateMediaKeys, users } from '@/lib/db/schema';
import { twoTenants, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import { callHandler } from '../../../helpers/call-handler';
import { generatePortalApiKey, resolvePortalApiKey } from '@/lib/mcp-auth';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { consumeLoginMfa } from '@/lib/security/login-mfa';
import { authorizeMediaDownload } from '@/lib/security/private-media';
import { rememberPrivateAttachment } from '@/lib/security/private-media-registry';
import { generateTOTP, generateTOTPSecret } from '@/lib/totp';

describe('security boundaries with real rows @security @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    vi.stubEnv('WORKSPACE_TENANT_SECRETS_KEY', '55'.repeat(32));
    ({ A, B } = await twoTenants());
    await db.update(users).set({ role: 'client' }).where(eq(users.id, A.user.id));
    await db.update(users).set({ role: 'client' }).where(eq(users.id, B.user.id));
    A.session.user.role = 'client';
    B.session.user.role = 'client';
    vi.mocked(auth).mockResolvedValue(null);
    requestContext.headers = new Headers();
    requestContext.activeClientId = 0;
    delete process.env.AUTH_SCOPE_ENFORCE;
    delete process.env.AUTH_ROLE_ENFORCE;
  });

  async function keyFor(clientId: number, scopes: string[]) {
    const generated = generatePortalApiKey();
    await db.insert(portalApiKeys).values({ clientId, clientIds: [clientId], userId: A.user.id,
      name: 'security-test', keyHash: generated.hash, keyPreview: generated.preview,
      scopes, requireCmsApproval: true });
    return generated.key;
  }

  it('revokes bearer access immediately after membership removal or account deactivation', async () => {
    await db.insert(clientMembers).values({ clientId: B.client.id, userId: A.user.id, role: 'viewer' });
    const key = await keyFor(B.client.id, ['media:read']);
    expect(await resolvePortalApiKey(key)).not.toBeNull();
    await db.delete(clientMembers).where(and(eq(clientMembers.clientId, B.client.id), eq(clientMembers.userId, A.user.id)));
    expect(await resolvePortalApiKey(key)).toBeNull();
    const ownerKey = await keyFor(A.client.id, ['media:read']);
    await db.update(users).set({ active: false }).where(eq(users.id, A.user.id));
    expect(await resolvePortalApiKey(ownerKey)).toBeNull();
  });

  it('requires declared and granted REST scopes when flags are absent', async () => {
    const key = await keyFor(A.client.id, ['chat:read']);
    requestContext.headers = new Headers({ authorization: `Bearer ${key}` });
    for (const opts of [{ action: 'read' as const }, { action: 'read' as const, scope: 'media:read' }]) {
      const result = await authorizePortal(opts);
      expect(isAuthError(result)).toBe(true);
      if (isAuthError(result)) expect(result.response.status).toBe(403);
    }
    const good = await keyFor(A.client.id, ['media:read']);
    requestContext.headers = new Headers({ authorization: `Bearer ${good}` });
    expect(isAuthError(await authorizePortal({ action: 'read', scope: 'media:read' }))).toBe(false);
  });

  it('mobile rejects missing or reused MFA without issuing a credential', async () => {
    const secret = generateTOTPSecret();
    await db.update(users).set({ password: await hash('test-password', 4), mfaEnabled: true,
      totpSecret: secret, mfaLastUsedStep: null }).where(eq(users.id, A.user.id));
    const route = await import('@/app/api/portal/auth/mobile-sign-in/route');
    const attempt = (totpCode?: string) => callHandler(route, 'POST', {
      body: { email: A.user.email, password: 'test-password', totpCode },
      headers: { 'x-forwarded-for': `security-test-${A.user.id}` },
    });
    expect((await attempt()).status).toBe(401);
    expect(await db.select().from(portalApiKeys)).toHaveLength(0);
    const code = generateTOTP(secret);
    expect((await attempt(code)).status).toBe(200);
    expect((await attempt(code)).status).toBe(401);
    const keys = await db.select().from(portalApiKeys);
    expect(keys).toHaveLength(1);
    expect(keys[0].scopes).not.toContain('*');
    expect(keys[0].requireCmsApproval).toBe(true);
  });

  it('shared MFA consumption accepts only one concurrent use of a code', async () => {
    const secret = generateTOTPSecret();
    await db.update(users).set({ mfaEnabled: true, totpSecret: secret, mfaLastUsedStep: null })
      .where(eq(users.id, A.user.id));
    const user = { id: A.user.id, mfaEnabled: true, totpSecret: secret };
    const code = generateTOTP(secret);
    const attempts = await Promise.all([consumeLoginMfa(user, code), consumeLoginMfa(user, code)]);
    expect(attempts.filter(Boolean)).toHaveLength(1);
    expect(await consumeLoginMfa({ ...user, totpSecret: null }, code)).toBe(false);
  });

  it('legacy confidential URLs deny anonymous, foreign tenant and detached references', async () => {
    const key = 'media/security-test-attachment.pdf';
    const [note] = await db.insert(brainNotes).values({ clientId: A.client.id, title: 'Confidential',
      confidentialityLevel: 'confidential', attachmentStoredKey: 'security-test-attachment.pdf',
      attachmentUrl: `/api/media/proxy/${key}` }).returning({ id: brainNotes.id });
    const req = new Request(`https://example.test/api/media/proxy/${key}`);
    expect(await authorizeMediaDownload(req, key)).toBe('denied');
    vi.mocked(auth).mockResolvedValue(B.session);
    expect(await authorizeMediaDownload(req, key)).toBe('denied');
    vi.mocked(auth).mockResolvedValue(A.session);
    expect(await authorizeMediaDownload(req, key)).toBe('private');
    await rememberPrivateAttachment('security-test-attachment.pdf', A.client.id);
    await db.delete(brainNotes).where(eq(brainNotes.id, note.id));
    expect(await db.select().from(privateMediaKeys).where(eq(privateMediaKeys.key, key))).toHaveLength(1);
    expect(await authorizeMediaDownload(req, key)).toBe('denied');
    expect(await authorizeMediaDownload(req, 'media/public-logo.png')).toBe('public');
  });

  it('viewers cannot mutate CMS; clients cannot save custom JS or serialized executable blocks', async () => {
    const sql = getTestSql();
    await db.insert(clientMembers).values({ clientId: B.client.id, userId: A.user.id, role: 'viewer' });
    const [site] = await sql<{ id: number }[]>`INSERT INTO ${sql(TEST_SCHEMA)}.client_websites
      (client_id, name, domain) VALUES (${B.client.id}, 'Secure site', 'secure.test') RETURNING id`;
    const [post] = await sql<{ id: number }[]>`INSERT INTO ${sql(TEST_SCHEMA)}.posts
      (website_id, title, slug, content, published) VALUES (${site.id}, 'Original', 'original', '{"blocks":[]}', false) RETURNING id`;
    vi.mocked(auth).mockResolvedValue(A.session);
    requestContext.activeClientId = B.client.id;
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route');
    const params = { siteId: String(site.id), postId: String(post.id) };
    expect((await callHandler(route, 'PUT', { params, body: { title: 'Changed', published: true } })).status).toBe(403);
    expect((await callHandler(route, 'DELETE', { params })).status).toBe(403);
    await db.update(clientMembers).set({ role: 'member' })
      .where(and(eq(clientMembers.clientId, B.client.id), eq(clientMembers.userId, A.user.id)));
    expect((await callHandler(route, 'PUT', { params, body: { customJs: 'example()' } })).status).toBe(403);
    expect((await callHandler(route, 'PUT', { params, body: {
      content: JSON.stringify({ blocks: [{ type: 'html-render', html: '<script>example()</script>' }] }),
    } })).status).toBe(403);
    const [unchanged] = await sql<{ title: string; published: boolean; custom_js: string | null }[]>`
      SELECT title, published, custom_js FROM ${sql(TEST_SCHEMA)}.posts WHERE id=${post.id}`;
    expect(unchanged).toMatchObject({ title: 'Original', published: false, custom_js: null });
  });

  it('public chat enables AI only for opted-in widgets and preserves human handoff on reuse', async () => {
    const sql = getTestSql();
    const [site] = await sql<{ id: number }[]>`INSERT INTO ${sql(TEST_SCHEMA)}.client_websites
      (client_id, name, domain) VALUES (${A.client.id}, 'Chat site', 'chat-secure.test') RETURNING id`;
    const [widget] = await sql<{ id: number }[]>`INSERT INTO ${sql(TEST_SCHEMA)}.chat_widgets
      (client_id, site_id, brain_enabled) VALUES (${A.client.id}, ${site.id}, false) RETURNING id`;
    const route = await import('@/app/api/public/chat/start/route');
    const start = (visitorId: string) => callHandler<{ data: { conversationId: number } }>(route, 'POST', {
      body: { widgetId: widget.id, visitorId },
    });
    const first = await start('visitor-human');
    const [human] = await sql<{ ai_mode: string }[]>`SELECT ai_mode FROM ${sql(TEST_SCHEMA)}.chat_conversations WHERE id=${first.data!.data.conversationId}`;
    expect(human.ai_mode).toBe('human');
    await sql`UPDATE ${sql(TEST_SCHEMA)}.chat_widgets SET brain_enabled=true WHERE id=${widget.id}`;
    const second = await start('visitor-ai');
    const conversationId = second.data!.data.conversationId;
    const [ai] = await sql<{ ai_mode: string }[]>`SELECT ai_mode FROM ${sql(TEST_SCHEMA)}.chat_conversations WHERE id=${conversationId}`;
    expect(ai.ai_mode).toBe('ai');
    await sql`UPDATE ${sql(TEST_SCHEMA)}.chat_conversations SET ai_mode='human' WHERE id=${conversationId}`;
    expect((await start('visitor-ai')).data!.data.conversationId).toBe(conversationId);
    const [handedOff] = await sql<{ ai_mode: string }[]>`SELECT ai_mode FROM ${sql(TEST_SCHEMA)}.chat_conversations WHERE id=${conversationId}`;
    expect(handedOff.ai_mode).toBe('human');
  });
});
