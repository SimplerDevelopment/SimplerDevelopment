import type { FetchOptions } from '../utils/fetch';
import { apiFetch } from '../utils/fetch';
import type { ApiResponse, BlockDefinition } from '../types';

export class BlocksResource {
  constructor(private opts: FetchOptions) {}

  async list(): Promise<BlockDefinition[]> {
    const res = await apiFetch<ApiResponse<BlockDefinition[]>>(this.opts, '/blocks');
    return res.data;
  }
}
