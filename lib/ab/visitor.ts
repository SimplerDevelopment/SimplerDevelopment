// Visitor cookie helpers for A/B testing.
//
// `sd_visitor` is a 1-year, HttpOnly, SameSite=Lax UUID. Exposed two ways:
//
//   - `getVisitorId()` — server-side read; returns null if absent. Use in
//     route handlers that need to read but cannot mutate cookies (e.g. inside
//     a Suspense-driven component).
//   - `ensureVisitorId()` — read + create-if-missing on a mutable cookie
//     store. Use in the public site render path so every viewer ends up with
//     a stable id by the time the response is sent.
//
// Note: Next 16 makes the `cookies()` store mutable in route handlers and
// server actions but read-only in plain server components. The render-path
// caller is `app/sites/...` which IS a server component, so we set the
// cookie via a `Set-Cookie` header from a route helper, OR — what we do
// here — via `cookies()` `.set()` which is allowed inside route handlers
// and middleware. For the SSR page we generate the id in-memory and let
// the goal tracker / event POST seal it later.

import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';

export const VISITOR_COOKIE = 'sd_visitor';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export interface VisitorResolution {
  id: string;
  /** True when we just minted this id (caller should set a Set-Cookie). */
  fresh: boolean;
}

function isValidVisitorId(value: string): boolean {
  // UUID v4 ish + a generous 32–64 char fallback for visitors who arrive
  // with an existing id from another tab. The DB column is varchar(64).
  if (!value) return false;
  if (value.length < 8 || value.length > 64) return false;
  return /^[a-zA-Z0-9-]+$/.test(value);
}

/**
 * Read the visitor id from the request cookies. Does NOT mint a new one.
 * Use when reading from a server component / page.
 */
export async function getVisitorId(): Promise<string | null> {
  try {
    const store = await cookies();
    const raw = store.get(VISITOR_COOKIE)?.value;
    return raw && isValidVisitorId(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Read or mint a visitor id. Tries to set a long-lived cookie if the store
 * is writable (route handlers / server actions). Always returns a usable id
 * even if the write fails — the goal tracker fallback will mint one client-
 * side on next interaction.
 */
export async function ensureVisitorId(): Promise<VisitorResolution> {
  let store: Awaited<ReturnType<typeof cookies>>;
  try {
    store = await cookies();
  } catch {
    return { id: randomUUID(), fresh: true };
  }

  const existing = store.get(VISITOR_COOKIE)?.value;
  if (existing && isValidVisitorId(existing)) {
    return { id: existing, fresh: false };
  }

  const id = randomUUID();
  try {
    store.set({
      name: VISITOR_COOKIE,
      value: id,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ONE_YEAR_SECONDS,
    });
  } catch {
    // Read-only cookie store (e.g. inside a server component). Caller will
    // get the id once via `<AbGoalTracker>` and the client lib can persist.
  }
  return { id, fresh: true };
}
