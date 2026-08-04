import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { PaginatedResponse, MediaItem, ListMediaParams, RequestOptions } from '../types';

export class MediaResource {
  constructor(private opts: FetchOptions) {}

  async list(
    params?: ListMediaParams,
    request?: RequestOptions,
  ): Promise<{ data: MediaItem[]; pagination: PaginatedResponse<MediaItem>['pagination'] }> {
    const res = await apiFetch<PaginatedResponse<MediaItem>>(
      this.opts,
      '/media',
      params as Record<string, string | number>,
      request,
    );
    return { data: res.data, pagination: res.pagination };
  }
}
