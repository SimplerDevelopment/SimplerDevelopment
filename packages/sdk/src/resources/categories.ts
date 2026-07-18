import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { ApiResponse, Category } from '../types';

export class CategoriesResource {
  constructor(private opts: FetchOptions) {}

  async list(): Promise<Category[]> {
    const res = await apiFetch<ApiResponse<Category[]>>(this.opts, '/categories');
    return res.data;
  }
}
