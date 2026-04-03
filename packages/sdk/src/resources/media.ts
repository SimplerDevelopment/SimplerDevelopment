import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { PaginatedResponse, MediaItem, ListMediaParams } from '../types';

export class MediaResource {
  constructor(private opts: FetchOptions) {}

  async list(params?: ListMediaParams): Promise<{ data: MediaItem[]; pagination: PaginatedResponse<MediaItem>['pagination'] }> {
    const res = await apiFetch<PaginatedResponse<MediaItem>>(this.opts, '/media', params as Record<string, string | number>);
    return { data: res.data, pagination: res.pagination };
  }
}
