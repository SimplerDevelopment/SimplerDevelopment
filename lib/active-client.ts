import { cookies } from 'next/headers';

// Portal session tenant identity (the `sd-active-client` cookie), used
// throughout app/portal/. Not to be confused with lib/publishing/active-client.ts,
// a same-named but unrelated helper scoped to the Publishing Command Center —
// it resolves the acting client via getPortalClient(userId), not this cookie.

const COOKIE_NAME = 'sd-active-client';

/**
 * Read the active client ID from the cookie (server components / route handlers).
 */
export async function getActiveClientId(): Promise<number | null> {
  const store = await cookies();
  const val = store.get(COOKIE_NAME)?.value;
  return val ? parseInt(val, 10) : null;
}

/**
 * Parse active client ID from a raw Cookie header string (for API routes using Request).
 */
export function parseActiveClientId(cookieHeader: string | null): number | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=(\\d+)`));
  return match ? parseInt(match[1], 10) : null;
}

export { COOKIE_NAME };
