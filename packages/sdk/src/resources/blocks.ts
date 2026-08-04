import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { ApiResponse, BlockDefinition, RequestOptions } from '../types';

export class BlocksResource {
  constructor(private opts: FetchOptions) {}

  async list(request?: RequestOptions): Promise<BlockDefinition[]> {
    const res = await apiFetch<ApiResponse<BlockDefinition[]>>(this.opts, '/blocks', undefined, request);
    return res.data;
  }
}
