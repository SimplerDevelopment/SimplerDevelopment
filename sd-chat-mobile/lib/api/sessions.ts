/**
 * SD Chat — Tanstack Query hooks for active sessions (portal API keys)
 *
 * Backed by the SimplerDevelopment portal endpoints
 *  - GET    /api/portal/api-keys         → PortalApiKeyRow[]
 *  - DELETE /api/portal/api-keys?id=<id> → revoke (sets revokedAt + active=false)
 *
 * The portal's `portal_api_keys` table holds one row per issued device
 * token. The mobile sign-in flow mints one of these via
 * `/portal/mobile-auth`, so an "active session" = an active, non-revoked,
 * non-expired portal API key.
 *
 * "Current device" detection: the portal returns each row's `keyPreview`
 * (first 8 + last 4 chars of the raw key, separated by `…`). The mobile
 * client compares its stored token against each preview. Imperfect — a
 * forward-rolled `keyPreview` format would break it — but it's the best
 * we can do without the sign-in callback emitting the key `id` (a planned
 * Phase 5 follow-up).
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { getToken } from './auth';
import { api } from './client';
import type { ActiveSession, PortalApiKeyRow } from './types/sessions';

// ─── query keys ────────────────────────────────────────────────────────────

export const sessionKeys = {
  all: ['sessions'] as const,
};

// ─── helpers ───────────────────────────────────────────────────────────────

/** Material Symbols icon for the device, inferred from the key's name. */
function iconForName(name: string): ActiveSession['icon'] {
  const n = name.toLowerCase();
  if (n.includes('iphone') || n.includes('ios') || n.includes('android') || n.includes('phone')) {
    return 'phone_iphone';
  }
  if (n.includes('macbook') || n.includes('mac') || n.includes('laptop') || n.includes('desktop')) {
    return 'laptop_mac';
  }
  return 'language';
}

/** Loose, human-readable freshness label. */
function humanizeLastUsed(iso: string | null, current: boolean): string {
  if (current) return 'Now · this device';
  if (!iso) return 'Never used';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const deltaMs = Date.now() - t;
  const min = Math.floor(deltaMs / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  return new Date(t).toLocaleDateString();
}

/**
 * Heuristic: a row matches "this device" if our stored token's first 8 and
 * last 4 chars match the `keyPreview`. The portal generates previews as
 * `<first8>…<last4>` (see `lib/mcp-auth.ts → generatePortalApiKey`).
 */
function matchesCurrentToken(token: string | null, keyPreview: string): boolean {
  if (!token) return false;
  // Preview format: 8 chars + ellipsis + 4 chars (with unicode ellipsis or `...`).
  const first = token.slice(0, 8);
  const last = token.slice(-4);
  return keyPreview.startsWith(first) && keyPreview.endsWith(last);
}

// ─── list ──────────────────────────────────────────────────────────────────

/**
 * Fetch active sessions for the signed-in user. Filters out revoked +
 * expired keys server-list-side (we still get them, but the UI hides
 * them via `active && !revokedAt`).
 *
 * Returns enriched `ActiveSession` rows with `current` tagged on the row
 * whose `keyPreview` matches our stored token.
 */
export function useSessions(): UseQueryResult<ActiveSession[], Error> {
  return useQuery<ActiveSession[], Error>({
    queryKey: sessionKeys.all,
    queryFn: async () => {
      const res = await api.get<PortalApiKeyRow[]>('/api/portal/api-keys');
      if (!res.success) throw new Error(res.error);

      const token = await getToken();
      const now = Date.now();

      const sessions: ActiveSession[] = res.data
        .filter((row) => row.active && !row.revokedAt)
        .filter((row) => !row.expiresAt || Date.parse(row.expiresAt) > now)
        .map((row) => {
          const current = matchesCurrentToken(token, row.keyPreview);
          return {
            id: row.id,
            device: row.name,
            // Portal does NOT store geolocation per key. Fallback label —
            // a future portal enhancement could surface IP/UA-derived
            // location.
            location: row.keyPreview,
            time: humanizeLastUsed(row.lastUsedAt, current),
            icon: iconForName(row.name),
            current,
            raw: row,
          };
        })
        // Current device first; otherwise most-recently-used first.
        .sort((a, b) => {
          if (a.current && !b.current) return -1;
          if (b.current && !a.current) return 1;
          const aT = a.raw.lastUsedAt ? Date.parse(a.raw.lastUsedAt) : 0;
          const bT = b.raw.lastUsedAt ? Date.parse(b.raw.lastUsedAt) : 0;
          return bT - aT;
        });

      return sessions;
    },
    staleTime: 30 * 1000,
  });
}

// ─── revoke ────────────────────────────────────────────────────────────────

/**
 * Revoke an active session by api-key id. The portal sets `active=false` +
 * `revokedAt=now()`. The next `Authorization` header check against that
 * token will fail.
 *
 * **Caller responsibility:** do NOT call this with the current device's
 * key id from inside the app — it'll invalidate the token the app is
 * currently using. The Privacy & Security screen hides the "End" affordance
 * on the row marked `current`.
 */
export function useRevokeSession(): UseMutationResult<{ id: number }, Error, number> {
  const qc = useQueryClient();
  return useMutation<{ id: number }, Error, number>({
    mutationFn: async (id: number) => {
      const res = await api.delete<{ message?: string }>(
        `/api/portal/api-keys?id=${id}`,
      );
      if (!res.success) throw new Error(res.error);
      return { id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}
