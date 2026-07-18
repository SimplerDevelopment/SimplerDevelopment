import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { BrandingResponse, Branding } from '../types';

export class BrandingResource {
  constructor(private opts: FetchOptions) {}

  async get(): Promise<{ branding: Branding; cssVars: string }> {
    const res = await apiFetch<BrandingResponse>(this.opts, '/branding');
    return { branding: res.data, cssVars: res.cssVars };
  }
}
