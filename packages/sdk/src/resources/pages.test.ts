import { describe, it, expect } from 'vitest';
import { SimplerDevelopment } from '../client';
import { NotFoundError, UnauthorizedError } from '../utils/errors';

/** Minimal stub fetch: returns a fixed response and records the last call's url. */
function stubFetch(body: unknown, status = 200) {
  let lastUrl = '';
  const fn = async (url: string) => {
    lastUrl = url;
    return new Response(JSON.stringify(body), { status });
  };
  return { fn, lastUrl: () => lastUrl };
}

describe('pages.get postType guard', () => {
  it('returns the page normally when data.postType is "page"', async () => {
    const stub = stubFetch({ success: true, data: { slug: 'about', postType: 'page', title: 'About' } });
    const client = new SimplerDevelopment({ siteId: 1, fetch: stub.fn as any });

    const page = await client.pages.get('about');
    expect(page.postType).toBe('page');
    expect(page.title).toBe('About');
  });

  it('throws NotFoundError when data.postType is "blog"', async () => {
    const stub = stubFetch({ success: true, data: { slug: 'my-post', postType: 'blog', title: 'My Post' } });
    const client = new SimplerDevelopment({ siteId: 1, fetch: stub.fn as any });

    await expect(client.pages.get('my-post')).rejects.toThrow(NotFoundError);
  });

  it('requests /posts/{slug} (not /pages/{slug}), URL-encoding the slug', async () => {
    const stub = stubFetch({ success: true, data: { slug: 'hello world', postType: 'page' } });
    const client = new SimplerDevelopment({ siteId: 1, fetch: stub.fn as any });

    await client.pages.get('hello world');

    const url = stub.lastUrl();
    expect(url).toContain('/posts/hello%20world');
    expect(url).not.toContain('/pages/');
  });

  it('throws NotFoundError on a 404 from the server', async () => {
    const stub = stubFetch({ success: false, message: 'not found' }, 404);
    const client = new SimplerDevelopment({ siteId: 1, fetch: stub.fn as any });

    await expect(client.pages.get('missing')).rejects.toThrow(NotFoundError);
  });

  it('throws UnauthorizedError on a 401 from the server', async () => {
    const stub = stubFetch({ success: false, message: 'unauthorized' }, 401);
    const client = new SimplerDevelopment({ siteId: 1, fetch: stub.fn as any });

    await expect(client.pages.get('secret')).rejects.toThrow(UnauthorizedError);
  });
});
