import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { ApiResponse, SiteConfig, RequestOptions } from '../types';

export class ConfigResource {
  constructor(private opts: FetchOptions) {}

  async get(request?: RequestOptions): Promise<SiteConfig> {
    const res = await apiFetch<ApiResponse<SiteConfig>>(this.opts, '/config', undefined, request);
    return res.data;
  }
}
