import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { ApiResponse, Category, RequestOptions } from '../types';

export class CategoriesResource {
  constructor(private opts: FetchOptions) {}

  async list(request?: RequestOptions): Promise<Category[]> {
    const res = await apiFetch<ApiResponse<Category[]>>(this.opts, '/categories', undefined, request);
    return res.data;
  }
}
