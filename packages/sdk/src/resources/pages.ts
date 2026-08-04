import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import { NotFoundError } from '../utils/errors';
import type { PaginatedResponse, PostSummary, Post, ApiResponse, RequestOptions } from '../types';

export class PagesResource {
  constructor(private opts: FetchOptions) {}

  async list(
    params?: { limit?: number; offset?: number; search?: string },
    request?: RequestOptions,
  ): Promise<{ data: PostSummary[]; pagination: PaginatedResponse<PostSummary>['pagination'] }> {
    const res = await apiFetch<PaginatedResponse<PostSummary>>(
      this.opts,
      '/pages',
      params as Record<string, string | number>,
      request,
    );
    return { data: res.data, pagination: res.pagination };
  }

  /**
   * Fetch a single published page by slug.
   *
   * The v1 API exposes no `/pages/{slug}` route — `/posts/{slug}` resolves any
   * post type — so this reads through the posts endpoint and enforces the same
   * `postType: 'page'` filter that `list()` applies. Without that guard a blog
   * slug would resolve here and a page route would happily render a blog post.
   */
  async get(slug: string, request?: RequestOptions): Promise<Post> {
    const res = await apiFetch<ApiResponse<Post>>(
      this.opts,
      `/posts/${encodeURIComponent(slug)}`,
      undefined,
      request,
    );
    if (res.data.postType !== 'page') throw new NotFoundError(`/pages/${slug}`);
    return res.data;
  }
}
