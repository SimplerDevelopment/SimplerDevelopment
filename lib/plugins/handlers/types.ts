// Shared types + envelope helpers for plugin callback handlers.
//
// Every handler conforms to `CallbackHandler`. The dispatcher in
// app/api/plugin-callback/[appId]/[...path]/route.ts authenticates, looks up
// the handler, checks scopes, then invokes `handle(req, ctx, params)`.
//
// `path` matches the manifest entry. Segments starting with `:` are param
// captures (we only support `:id` style today — registry.ts enforces that).
//
// `ok()` and `fail()` produce the standard envelope from
// .planning/plugin-registry-spec.md §"Callback envelope":
//   success: { success: true, data: T }
//   failure: { success: false, error: { code, message, details? } }

import type { NextRequest } from 'next/server';
import type { CallbackContext } from '../callback-auth';

export interface CallbackHandler {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string; // '/scripts/runs/:id'
  scope: string;
  handle: (
    req: NextRequest,
    ctx: CallbackContext,
    params: Record<string, string>,
  ) => Promise<Response>;
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

/** Standard success envelope wrapper. */
export function ok<T>(data: T, init: ResponseInit = {}): Response {
  const body: SuccessEnvelope<T> = { success: true, data };
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json; charset=utf-8');
  }
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers,
  });
}

/** Standard failure envelope wrapper. */
export function fail(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): Response {
  const body: ErrorEnvelope = {
    success: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
