import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { ApiResponse, SiteConfig } from '../types';

export class ConfigResource {
  constructor(private opts: FetchOptions) {}

  async get(): Promise<SiteConfig> {
    const res = await apiFetch<ApiResponse<SiteConfig>>(this.opts, '/config');
    return res.data;
  }
}
