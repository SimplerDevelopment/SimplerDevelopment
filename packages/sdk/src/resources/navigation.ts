import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { ApiResponse, NavItem } from '../types';

export class NavigationResource {
  constructor(private opts: FetchOptions) {}

  async get(): Promise<NavItem[]> {
    const res = await apiFetch<ApiResponse<NavItem[]>>(this.opts, '/navigation');
    return res.data;
  }
}
