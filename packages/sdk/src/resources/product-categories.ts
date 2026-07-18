import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { ApiResponse, ProductCategory, RequestOptions } from '../types';

export class ProductCategoriesResource {
  constructor(private opts: FetchOptions) {}

  async list(request?: RequestOptions): Promise<ProductCategory[]> {
    const res = await apiFetch<ApiResponse<ProductCategory[]>>(
      this.opts,
      '/product-categories',
      undefined,
      request,
    );
    return res.data;
  }
}
