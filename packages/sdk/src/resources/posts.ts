import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { PaginatedResponse, ApiResponse, PostSummary, Post, ListPostsParams } from '../types';

export class PostsResource {
  constructor(private opts: FetchOptions) {}

  async list(params?: ListPostsParams): Promise<{ data: PostSummary[]; pagination: PaginatedResponse<PostSummary>['pagination'] }> {
    const res = await apiFetch<PaginatedResponse<PostSummary>>(this.opts, '/posts', params as Record<string, string | number>);
    return { data: res.data, pagination: res.pagination };
  }

  async get(slug: string): Promise<Post> {
    const res = await apiFetch<ApiResponse<Post>>(this.opts, `/posts/${encodeURIComponent(slug)}`);
    return res.data;
  }
}
