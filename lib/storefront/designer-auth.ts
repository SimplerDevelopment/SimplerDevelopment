// Resolves the caller for a product-designer endpoint. Returns one of:
//   - { customerId } when a valid Authorization: Bearer <token> matches the
//     site's customer session table (preferred, persistent across devices)
//   - { sessionId }  when an `sd_design_session` cookie is present (anonymous)
//   - {}             when neither was supplied (read endpoints return empty)
//
// The session cookie is minted lazily by the POST /designs route (see
// designSessionCookieOptions below) so anonymous flows still survive a
// reload. Cookie is NOT httpOnly — the editor reads/writes it from JS so
// the in-page draft survives navigating between product pages.

import type { NextRequest } from 'next/server';
import { validateSession, extractToken } from './customer-auth';

export const DESIGN_SESSION_COOKIE = 'sd_design_session';
export const DESIGN_SESSION_MAX_AGE = 365 * 24 * 3600; // 1y

export interface DesignerCaller {
  customerId: number | null;
  sessionId: string | null;
}

export async function resolveDesignerCaller(
  req: NextRequest,
  websiteId: number,
): Promise<DesignerCaller> {
  // 1) Auth header → customer
  const token = extractToken(req);
  if (token) {
    const session = await validateSession(token);
    if (session && session.websiteId === websiteId) {
      return { customerId: session.customerId, sessionId: null };
    }
  }

  // 2) Anonymous design-session cookie
  const sessionId = req.cookies.get(DESIGN_SESSION_COOKIE)?.value ?? null;
  return { customerId: null, sessionId };
}

export function newDesignSessionId(): string {
  return crypto.randomUUID();
}

export function designSessionCookieOptions() {
  return {
    httpOnly: false as const,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: DESIGN_SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  };
}
