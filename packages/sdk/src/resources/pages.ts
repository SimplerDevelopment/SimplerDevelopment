import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { PaginatedResponse, PostSummary } from '../types';

export class PagesResource {
  constructor(private opts: FetchOptions) {}

  async list(params?: { limit?: number; offset?: number; search?: string }): Promise<{ data: PostSummary[]; pagination: PaginatedResponse<PostSummary>['pagination'] }> {
    const res = await apiFetch<PaginatedResponse<PostSummary>>(this.opts, '/pages', params as Record<string, string | number>);
    return { data: res.data, pagination: res.pagination };
  }
}
