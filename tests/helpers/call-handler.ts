/**
 * Thin wrapper to call a Next.js route handler as a pure function during
 * integration-api tests. Avoids booting an HTTP server.
 *
 * Usage:
 *   import { callHandler } from '@/tests/helpers/call-handler';
 *   import * as route from '@/app/api/portal/projects/route';
 *   const res = await callHandler(route, 'POST', { session, body: { name: 'x' } });
 *   expect(res.status).toBe(201);
 *   expect(res.data.success).toBe(true);
 */
import { NextRequest } from 'next/server';

type HandlerFn = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;

export interface CallOpts {
  body?: unknown;
  query?: Record<string, string | number | boolean>;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  url?: string;                           // overrides auto-constructed URL
}

export interface CallResult<T = unknown> {
  status: number;
  data: T | null;
  headers: Headers;
}

export async function callHandler<T = unknown>(
  mod: Record<string, HandlerFn | unknown>,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  opts: CallOpts = {},
): Promise<CallResult<T>> {
  const handler = mod[method] as HandlerFn | undefined;
  if (typeof handler !== 'function') {
    throw new Error(`Route module does not export a ${method} handler`);
  }

  const base = 'http://localhost:3000';
  const queryStr = opts.query
    ? '?' + new URLSearchParams(
        Object.entries(opts.query).map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';
  const url = opts.url ?? `${base}/${queryStr}`;

  const headers = new Headers(opts.headers ?? {});
  if (opts.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (opts.cookies) {
    const cookie = Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    headers.set('cookie', cookie);
  }

  // If body is already a string, pass through verbatim (critical for HMAC-signed
  // payloads where the exact byte sequence matters). Otherwise JSON-stringify.
  const bodyInit =
    opts.body === undefined ? undefined
      : typeof opts.body === 'string' ? opts.body
      : JSON.stringify(opts.body);

  const req = new NextRequest(url, {
    method,
    headers,
    body: bodyInit,
  });

  const ctx = { params: Promise.resolve(opts.params ?? {}) };
  const res = await handler(req, ctx);

  let data: T | null = null;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try { data = await res.json() as T; } catch { data = null; }
  }

  return { status: res.status, data, headers: res.headers };
}
