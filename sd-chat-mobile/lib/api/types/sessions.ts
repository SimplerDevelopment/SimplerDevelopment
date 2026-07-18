/**
 * SD Chat — Active-sessions API types
 *
 * The portal's `portal_api_keys` table is what backs the "active sessions"
 * concept — each row is one issued `sd_mcp_…` token, one per device. The
 * mobile sign-in flow mints one of these via `/portal/mobile-auth`, so an
 * active session = an active (non-revoked, non-expired) portal API key.
 *
 * Wire endpoints:
 *  - GET    /api/portal/api-keys         → PortalApiKeyRow[]
 *  - DELETE /api/portal/api-keys?id=<id> → revoke (sets revokedAt + active=false)
 *
 * The portal currently does NOT include a `keyPreview` of the *current*
 * device's token in any response we control, so the mobile client can't
 * confidently tag "this device". The fallback heuristic is to compare each
 * row's `keyPreview` against the first/last chars of our stored token. Good
 * enough for a "THIS DEVICE" badge; better long-term: the sign-in callback
 * could include the key `id` so we can match exactly. See `useSessions()`
 * in `lib/api/sessions.ts` for the heuristic.
 */

export interface PortalApiKeyRow {
  id: number;
  name: string;
  keyPreview: string;
  scopes: string[];
  active: boolean;
  requireCmsApproval: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * UI-shaped active session — `PortalApiKeyRow` enriched with the bits the
 * Privacy & Security screen wants:
 *  - `current`: true if this row matches the token currently stored on-device.
 *  - `icon`: Material Symbols name. Derived from `name` heuristics
 *    (phone_iphone for iOS / iPhone, laptop_mac for macOS / MacBook,
 *    language otherwise).
 *  - `device`: pretty label (the row's `name`).
 *  - `time`: humanized `lastUsedAt` (or "Just now" for the current device).
 */
export interface ActiveSession {
  id: number;
  device: string;
  location: string;
  time: string;
  icon: 'phone_iphone' | 'laptop_mac' | 'language';
  current: boolean;
  /** Raw underlying row, in case the caller wants more. */
  raw: PortalApiKeyRow;
}
