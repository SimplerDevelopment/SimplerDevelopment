import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { PaginatedResponse, ApiResponse, PostSummary, Post, ListPostsParams, RequestOptions } from '../types';

export class PostsResource {
  constructor(private opts: FetchOptions) {}

  async list(
    params?: ListPostsParams,
    request?: RequestOptions,
  ): Promise<{ data: PostSummary[]; pagination: PaginatedResponse<PostSummary>['pagination'] }> {
    const res = await apiFetch<PaginatedResponse<PostSummary>>(
      this.opts,
      '/posts',
      params as Record<string, string | number>,
      request,
    );
    return { data: res.data, pagination: res.pagination };
  }

  async get(slug: string, request?: RequestOptions): Promise<Post> {
    const res = await apiFetch<ApiResponse<Post>>(
      this.opts,
      `/posts/${encodeURIComponent(slug)}`,
      undefined,
      request,
    );
    return res.data;
  }
}
