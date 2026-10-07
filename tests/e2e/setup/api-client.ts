import { request, APIRequestContext } from '@playwright/test';
import { loginRequestContext, sharedStorageState } from './auth-session';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Authenticated API client that handles NextAuth session cookies.
 * Clones prepared seed sessions into its own cookie jar; new/negative credentials
 * still use real sign-in. Pass { freshLogin: true } to explicitly test seed login.
 */
export class ApiClient {
  private ctx!: APIRequestContext;
  private ready: Promise<void>;

  constructor(private email?: string, private password?: string, private options: { freshLogin?: boolean } = {}) {
    this.ready = this.init();
  }

  private async init() {
    const storageState = this.email && this.password && !this.options.freshLogin
      ? sharedStorageState(this.email, this.password) : undefined;
    this.ctx = await request.newContext({ baseURL: BASE_URL, storageState });

    if (this.email && this.password && !storageState) {
      await loginRequestContext(this.ctx, this.email, this.password, false);
    }
  }

  async ensure() {
    await this.ready;
    return this;
  }

  async get(path: string) {
    await this.ready;
    const res = await this.ctx.get(path);
    return {
      status: res.status(),
      data: await res.json().catch(() => null),
    };
  }

  async post(path: string, body?: Record<string, unknown>) {
    await this.ready;
    const res = await this.ctx.post(path, { data: body });
    return {
      status: res.status(),
      data: await res.json().catch(() => null),
    };
  }

  async put(path: string, body?: Record<string, unknown>) {
    await this.ready;
    const res = await this.ctx.put(path, { data: body });
    return {
      status: res.status(),
      data: await res.json().catch(() => null),
    };
  }

  async patch(path: string, body?: Record<string, unknown>) {
    await this.ready;
    const res = await this.ctx.patch(path, { data: body });
    return {
      status: res.status(),
      data: await res.json().catch(() => null),
    };
  }

  async delete(path: string, body?: Record<string, unknown>) {
    await this.ready;
    const res = await this.ctx.delete(path, body !== undefined ? { data: body } : undefined);
    return {
      status: res.status(),
      data: await res.json().catch(() => null),
    };
  }

  /**
   * POST and return the RAW response body as text (plus status + content-type).
   * Used for streaming / non-JSON endpoints such as the Brain Agent SSE route
   * (`text/event-stream`) where `.json()` would throw. Callers parse the SSE
   * frames themselves.
   */
  async postText(path: string, body?: Record<string, unknown>) {
    await this.ready;
    const res = await this.ctx.post(path, { data: body });
    return {
      status: res.status(),
      headers: res.headers(),
      text: await res.text().catch(() => ''),
    };
  }

  async postForm(path: string, formData: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>) {
    await this.ready;
    const multipart: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(formData)) {
      if (typeof value === 'string') {
        multipart[key] = value;
      } else {
        multipart[key] = value;
      }
    }
    const res = await this.ctx.post(path, { multipart: multipart as Record<string, string | number | boolean | { name: string; mimeType: string; buffer: Buffer }> });
    return {
      status: res.status(),
      data: await res.json().catch(() => null),
    };
  }

  async dispose() {
    await this.ctx?.dispose();
  }
}
