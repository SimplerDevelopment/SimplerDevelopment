// @vitest-environment node
/**
 * RFC 9728 Protected Resource Metadata is served from TWO locations, and the
 * pair is the point of these tests:
 *
 *   /.well-known/oauth-protected-resource           <- named by our 401 challenge
 *   /.well-known/oauth-protected-resource/api/mcp   <- RFC 9728 §3.1 canonical URL
 *
 * Only the first existed originally, so the canonical URL fell through to Next's
 * HTML 404 and a strict client could abandon discovery before registering. The
 * documents must stay byte-identical, and the path-scoped route must refuse to
 * describe any resource other than the real one.
 */
import { describe, it, expect } from 'vitest';
import { GET as scopedGet } from '@/app/.well-known/oauth-protected-resource/[...path]/route';
import { GET as rootGet } from '@/app/.well-known/oauth-protected-resource/route';

const req = (url = 'https://www.example.com/.well-known/oauth-protected-resource/api/mcp') =>
  new Request(url);

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });

describe('GET /.well-known/oauth-protected-resource/[...path]', () => {
  it('serves metadata at the RFC 9728 canonical URL for the real resource', async () => {
    const res = await scopedGet(req(), ctx('api', 'mcp'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.resource).toBe('https://www.example.com/api/mcp');
    expect(body.authorization_servers).toEqual(['https://www.example.com']);
    expect(body.bearer_methods_supported).toEqual(['header']);
    expect(body.scopes_supported).toContain('*');
  });

  it('returns a document identical to the root route', async () => {
    const scoped = await (await scopedGet(req(), ctx('api', 'mcp'))).json();
    const root = await (await rootGet(req('https://www.example.com/.well-known/oauth-protected-resource'))).json();
    expect(scoped).toEqual(root);
  });

  it('derives the origin from x-forwarded-* so it is correct behind a proxy', async () => {
    const proxied = new Request('http://internal.local/.well-known/oauth-protected-resource/api/mcp', {
      headers: { 'x-forwarded-host': 'www.simplerdevelopment.com', 'x-forwarded-proto': 'https' },
    });
    const body = await (await scopedGet(proxied, ctx('api', 'mcp'))).json();
    expect(body.resource).toBe('https://www.simplerdevelopment.com/api/mcp');
    expect(body.authorization_servers).toEqual(['https://www.simplerdevelopment.com']);
  });

  // Echoing metadata for an arbitrary path would invite a client to bind a token
  // to an audience we never serve, so anything but the real resource 404s.
  it.each([
    [['api', 'bogus'], 'a resource that does not exist'],
    [['api', 'mcp', 'extra'], 'a deeper path than the resource'],
    [['admin'], 'an unrelated route'],
    [['api'], 'a prefix of the resource'],
  ])('404s for %j (%s)', async (path) => {
    const res = await scopedGet(req(), ctx(...(path as string[])));
    expect(res.status).toBe(404);
  });
});
