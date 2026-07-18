import { cookies } from 'next/headers';

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
