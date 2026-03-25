import { ApiClient } from './api-client';

/** Run cleanup functions in reverse order, ignoring errors */
export async function runCleanups(cleanups: Array<() => Promise<void>>) {
  for (const fn of cleanups.reverse()) {
    try {
      await fn();
    } catch {}
  }
}

/** Create a test website for a client, returns the website and cleanup fn */
export async function createTestWebsite(api: ApiClient) {
  const name = `Test Site ${Date.now()}`;
  const res = await api.post('/api/portal/cms/websites', {
    name,
    domain: `test-${Date.now()}.example.com`,
    description: 'E2E test website',
  });
  if (!res.data?.success) throw new Error(`Failed to create test website: ${res.data?.message}`);
  const website = res.data.data;
  const cleanup = async () => {
    // No delete endpoint for websites yet — acceptable leak for tests
  };
  return { website, cleanup };
}

/** Create a test category scoped to a website */
export async function createTestCategory(api: ApiClient, siteId: number, overrides?: Record<string, string>) {
  const slug = `test-cat-${Date.now()}`;
  const res = await api.post(`/api/portal/cms/websites/${siteId}/categories`, {
    name: overrides?.name || `Test Category ${Date.now()}`,
    slug: overrides?.slug || slug,
    description: overrides?.description || 'E2E test category',
    color: overrides?.color || '#6366f1',
  });
  if (!res.data?.success) throw new Error(`Failed to create test category: ${res.data?.message}`);
  const category = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/cms/websites/${siteId}/categories/${category.id}`).catch(() => {});
  };
  return { category, cleanup };
}

/** Create a test tag scoped to a website */
export async function createTestTag(api: ApiClient, siteId: number, overrides?: Record<string, string>) {
  const slug = `test-tag-${Date.now()}`;
  const res = await api.post(`/api/portal/cms/websites/${siteId}/tags`, {
    name: overrides?.name || `Test Tag ${Date.now()}`,
    slug: overrides?.slug || slug,
  });
  if (!res.data?.success) throw new Error(`Failed to create test tag: ${res.data?.message}`);
  const tag = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/cms/websites/${siteId}/tags/${tag.id}`).catch(() => {});
  };
  return { tag, cleanup };
}

/** Create a test post scoped to a website */
export async function createTestPost(api: ApiClient, siteId: number, overrides?: Record<string, unknown>) {
  const slug = `test-post-${Date.now()}`;
  const res = await api.post(`/api/portal/cms/websites/${siteId}/posts`, {
    title: `Test Post ${Date.now()}`,
    slug,
    content: JSON.stringify({ blocks: [], version: '1.0' }),
    postType: 'page',
    published: false,
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create test post: ${res.data?.message}`);
  const post = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/cms/websites/${siteId}/posts/${post.id}`).catch(() => {});
  };
  return { post, cleanup };
}
