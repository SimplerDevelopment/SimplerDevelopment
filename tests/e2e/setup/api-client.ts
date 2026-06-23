import { request, APIRequestContext } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Authenticated API client that handles NextAuth session cookies.
 * Logs in via the credentials provider and reuses the session for all requests.
 */
export class ApiClient {
  private ctx!: APIRequestContext;
  private ready: Promise<void>;

  constructor(private email?: string, private password?: string) {
    this.ready = this.init();
  }

  private async init() {
    this.ctx = await request.newContext({ baseURL: BASE_URL });

    if (this.email && this.password) {
      // Get CSRF token
      const csrfRes = await this.ctx.get('/api/auth/csrf');
      const { csrfToken } = await csrfRes.json();

      // Sign in via NextAuth credentials callback
      const signInRes = await this.ctx.post('/api/auth/callback/credentials', {
        form: {
          email: this.email,
          password: this.password,
          csrfToken,
          json: 'true',
        },
      });

      if (signInRes.status() >= 400) {
        throw new Error(`Login failed for ${this.email}: ${signInRes.status()}`);
      }

      // Pin an active client. Most portal routes resolve the client via team
      // membership/ownership, but cookie-only resolvers (e.g. the Publishing
      // Command Center → getPublishingSession) need the `sd-active-client`
      // cookie. Staff users have no implicit client, so resolve the accessible
      // workspace and persist the cookie via switch-client (its Set-Cookie
      // lands in this context's jar). No-op for users with no client.
      const clientsRes = await this.ctx.get('/api/portal/clients');
      if (clientsRes.ok()) {
        const { activeClientId } = (await clientsRes.json().catch(() => ({}))) as {
          activeClientId?: number | null;
        };
        if (activeClientId) {
          await this.ctx.post('/api/portal/switch-client', { data: { clientId: activeClientId } });
        }
      }
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
