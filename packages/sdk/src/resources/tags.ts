import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { ApiResponse, Tag } from '../types';

export class TagsResource {
  constructor(private opts: FetchOptions) {}

  async list(): Promise<Tag[]> {
    const res = await apiFetch<ApiResponse<Tag[]>>(this.opts, '/tags');
    return res.data;
  }
}
