import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { ApiResponse, NavItem, RequestOptions } from '../types';

export class NavigationResource {
  constructor(private opts: FetchOptions) {}

  async get(request?: RequestOptions): Promise<NavItem[]> {
    const res = await apiFetch<ApiResponse<NavItem[]>>(this.opts, '/navigation', undefined, request);
    return res.data;
  }
}
