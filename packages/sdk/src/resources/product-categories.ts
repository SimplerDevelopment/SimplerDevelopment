import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { ApiResponse, ProductCategory } from '../types';

export class ProductCategoriesResource {
  constructor(private opts: FetchOptions) {}

  async list(): Promise<ProductCategory[]> {
    const res = await apiFetch<ApiResponse<ProductCategory[]>>(this.opts, '/product-categories');
    return res.data;
  }
}
