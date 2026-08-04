import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { BrandingResponse, Branding, CssVars, RequestOptions } from '../types';

export class BrandingResource {
  constructor(private opts: FetchOptions) {}

  async get(request?: RequestOptions): Promise<{ branding: Branding; cssVars: CssVars }> {
    const res = await apiFetch<BrandingResponse>(this.opts, '/branding', undefined, request);
    return { branding: res.data, cssVars: res.cssVars };
  }
}
