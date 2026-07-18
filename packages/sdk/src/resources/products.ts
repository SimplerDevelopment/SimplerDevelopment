import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type {
  PagePaginatedResponse,
  ApiResponse,
  Product,
  ProductDetail,
  ListProductsParams,
  RequestOptions,
} from '../types';

export class ProductsResource {
  constructor(private opts: FetchOptions) {}

  async list(
    params?: ListProductsParams,
    request?: RequestOptions,
  ): Promise<{ data: Product[]; pagination: PagePaginatedResponse<Product>['pagination'] }> {
    const res = await apiFetch<PagePaginatedResponse<Product>>(
      this.opts,
      '/products',
      params as Record<string, string | number>,
      request,
    );
    return { data: res.data, pagination: res.pagination };
  }

  async get(slug: string, request?: RequestOptions): Promise<ProductDetail> {
    const res = await apiFetch<ApiResponse<ProductDetail>>(
      this.opts,
      `/products/${encodeURIComponent(slug)}`,
      undefined,
      request,
    );
    return res.data;
  }
}
