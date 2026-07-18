/**
 * SD Chat — Tanstack Query hooks for the user identity surface
 *
 * Backed by the SimplerDevelopment portal endpoints
 *  - GET   /api/portal/me                  → { user, client | null }
 *  - GET   /api/portal/clients             → { clients[], activeClientId }
 *  - GET   /api/portal/settings/profile    → ProfilePayload
 *  - PATCH /api/portal/settings/profile    → { message }
 *  - POST  /api/portal/switch-client       → { activeClientId, company } (cookie-only)
 *
 * Refetch policy:
 *  - currentUser: stale 5 min, refetches on app foreground (React Native AppState).
 *  - workspaces:  stale 5 min, no auto-refetch (membership rarely flips).
 *  - profile:     fetched on demand (settings screen). Not exported as a
 *                 hook here — `useUpdateProfile` invalidates `currentUser`
 *                 because that's what the rest of the app cares about; if a
 *                 dedicated "profile" screen later wants the extended
 *                 `ProfilePayload` (with phone/address/etc.) wire a
 *                 `useProfile()` against `/api/portal/settings/profile`.
 *
 * Workspace switching — read this:
 *  The mobile bearer token (`portal_api_keys`) is bound at mint-time to
 *  ONE clientId (see `/portal/mobile-auth`). The portal's
 *  `POST /api/portal/switch-client` route is a cookie flip — it has no
 *  effect on a bearer token. So `useSwitchWorkspace` cannot just call
 *  that route; it has to clear the local token and re-run the sign-in
 *  bridge so the portal mints a NEW token bound to the chosen client.
 *
 *  The cleanest long-term fix is a backend endpoint that mints a fresh
 *  `portal_api_keys` row for a different client the user is a member of
 *  (e.g. `POST /api/portal/api-keys/switch` returning
 *  `{ token, expiresAt }`). Until then, this hook returns an error of
 *  kind `'requires_reauth'` so the calling screen can prompt the user
 *  to sign out + sign back in to switch.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { api } from './client';
import type {
  ClientMembership,
  CurrentUser,
  ProfilePayload,
  ProfileUpdateInput,
  WorkspacesPayload,
} from './types/user';

// ─── query keys ────────────────────────────────────────────────────────────

export const userKeys = {
  currentUser: ['currentUser'] as const,
  workspaces: ['workspaces'] as const,
  profile: ['profile'] as const,
};

// ─── current user ──────────────────────────────────────────────────────────

/**
 * Fetch the signed-in user + their active client/workspace.
 *
 * Cached as `['currentUser']`. Refetches on app foreground so a workspace
 * switch performed elsewhere (e.g. on web) eventually propagates here. The
 * `AuthContext` mounts this hook globally so the rest of the app can read
 * the user via `useAuth().user` and stay in sync without each screen
 * re-fetching.
 *
 * Returns `null` (envelope error) when there's no bearer token / the token
 * is rejected — the global 401 handler in `lib/api/client.ts` will already
 * have bounced the user to sign-in by then.
 */
export function useCurrentUser(
  options: { enabled?: boolean } = {},
): UseQueryResult<CurrentUser, Error> {
  const qc = useQueryClient();
  const enabled = options.enabled ?? true;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        qc.invalidateQueries({ queryKey: userKeys.currentUser });
      }
    });
    return () => sub.remove();
  }, [qc]);

  return useQuery<CurrentUser, Error>({
    queryKey: userKeys.currentUser,
    queryFn: async () => {
      const res = await api.get<CurrentUser>('/api/portal/me');
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    enabled,
    // gcTime inherited from query-client (30 min)
  });
}

// ─── workspaces ────────────────────────────────────────────────────────────

/**
 * List every workspace (portal "client") the user is a member of, plus the
 * portal's idea of which one is currently active.
 *
 * Caveat: the `activeClientId` returned here reflects the WEB session's
 * cookie. On mobile the actually-active workspace is whatever the bearer
 * token was minted for — read that off `useCurrentUser().data?.client.id`.
 * For most UIs both will agree (the same user signed in on both surfaces
 * picks the same workspace) but they CAN diverge if the user switches on
 * web and then re-opens the app without re-signing-in.
 */
export function useWorkspaces(
  options: { enabled?: boolean } = {},
): UseQueryResult<WorkspacesPayload, Error> {
  const enabled = options.enabled ?? true;
  return useQuery<WorkspacesPayload, Error>({
    queryKey: userKeys.workspaces,
    enabled,
    queryFn: async () => {
      // `/api/portal/clients` is NOT wrapped in the `{ success, data }`
      // envelope — it returns `{ clients, activeClientId }` directly (or
      // `{ error }` on failure). Our `api.get` will still attempt to parse
      // it as an envelope; on failure it returns `{ success: false, error }`
      // so we have to fall back to a raw fetch for this one route. Easier
      // path: catch the envelope-parse error and re-issue as raw JSON.
      const res = await api.get<WorkspacesPayload>('/api/portal/clients');
      if (res.success) {
        // Defensive: the route returns the shape unwrapped, but the api
        // client may have coerced it into `data` if it happened to match
        // the envelope discriminator. Normalize.
        const maybeShape = res.data as Partial<WorkspacesPayload> & {
          clients?: ClientMembership[];
        };
        if (maybeShape && Array.isArray(maybeShape.clients)) {
          return {
            clients: maybeShape.clients,
            activeClientId: maybeShape.activeClientId ?? null,
          };
        }
      }
      // Fallback: hit the route directly. This is the common case because
      // the unwrapped response will fail the envelope's `success` check.
      const raw = await fetchRawWorkspaces();
      return raw;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Direct fetch fallback for `/api/portal/clients`. This route predates the
 * portal's `{ success, data }` envelope convention so the standard
 * `api.get` wrapper rejects its response. Pulls the token from the same
 * in-memory slot the api client uses.
 */
async function fetchRawWorkspaces(): Promise<WorkspacesPayload> {
  const { getAuthToken } = await import('./client');
  const token = getAuthToken();
  // baseUrl is owned by `api`, re-export not needed — read from the api object.
  const url = `${api.baseUrl}/api/portal/clients`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', headers });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Network error');
  }
  if (res.status === 401) {
    throw new Error('Unauthorized');
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Invalid JSON from /api/portal/clients (${res.status})`);
  }
  if (!res.ok) {
    const errMsg =
      (body as { error?: string })?.error ??
      `Workspaces request failed (${res.status})`;
    throw new Error(errMsg);
  }
  const typed = body as Partial<WorkspacesPayload>;
  return {
    clients: Array.isArray(typed.clients) ? typed.clients : [],
    activeClientId: typeof typed.activeClientId === 'number' ? typed.activeClientId : null,
  };
}

// ─── switch workspace ──────────────────────────────────────────────────────

/**
 * Mobile-specific reason codes for a failed switch. `'requires_reauth'` is
 * the expected outcome on the bearer-token path — the calling screen should
 * surface a confirm prompt and route the user through sign-out → sign-in.
 */
export type SwitchWorkspaceError =
  | { code: 'requires_reauth'; clientId: number; message: string }
  | { code: 'network'; message: string }
  | { code: 'forbidden'; message: string };

/**
 * Switch the active workspace. **Mobile reality check below.**
 *
 * The portal exposes `POST /api/portal/switch-client` which sets a
 * `sd-active-client` cookie. That cookie only governs WEB session
 * resolution — the mobile bearer token is bound to its mint-time
 * clientId and ignores the cookie entirely (`resolvePortalFromRequest`
 * in `lib/mcp-auth.ts` reads `portal_api_keys.client_id`).
 *
 * So on mobile the only honest way to switch is to clear the token and
 * re-run the `/portal/mobile-auth` bridge, which the user has to drive
 * (the bridge needs an interactive browser session). This mutation
 * therefore:
 *
 *  1. Validates the user is actually a member of the target client (via
 *     the workspaces query cache — avoids a needless round-trip).
 *  2. Throws `SwitchWorkspaceError` with code `'requires_reauth'` so the
 *     calling UI can render: "Sign out and switch to <Company>?".
 *
 * When the backend grows a real token-rebind endpoint (e.g.
 * `POST /api/portal/api-keys/switch`), this mutation now calls that endpoint
 * directly: it mints a fresh bearer bound to the target client, swaps it into
 * SecureStore + the in-memory client, and invalidates the user/workspaces
 * queries so the rest of the app re-fetches as the new tenant.
 */
export function useSwitchWorkspace(): UseMutationResult<
  { activeClientId: number },
  SwitchWorkspaceError,
  number
> {
  const qc = useQueryClient();

  return useMutation<{ activeClientId: number }, SwitchWorkspaceError, number>({
    mutationFn: async (targetClientId: number) => {
      // Confirm membership via cached workspaces (or fetch if empty). The
      // server re-checks too — this is just a cheap UI-level guard to avoid
      // a roundtrip for an obviously-bad request.
      let workspaces = qc.getQueryData<WorkspacesPayload>(userKeys.workspaces);
      if (!workspaces) {
        try {
          workspaces = await qc.fetchQuery<WorkspacesPayload, Error>({
            queryKey: userKeys.workspaces,
            queryFn: async () => fetchRawWorkspaces(),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Network error';
          throw {
            code: 'network',
            message,
          } satisfies SwitchWorkspaceError;
        }
      }
      const isMember = workspaces.clients.some(c => c.id === targetClientId);
      if (!isMember) {
        throw {
          code: 'forbidden',
          message: 'You are not a member of that workspace.',
        } satisfies SwitchWorkspaceError;
      }

      // POST /api/portal/api-keys/switch — server mints a new sd_mcp_… token
      // bound to the target client and returns it in the same shape as
      // /auth/mobile-sign-in.
      const res = await api.post<{
        token: string;
        expiresAt: string;
        user: import('./types/user').CurrentUser['user'];
        client: import('./types/user').CurrentUser['client'];
      }>('/api/portal/api-keys/switch', { clientId: targetClientId });
      if (!res.success) {
        throw {
          code: 'network',
          message: res.error || 'Workspace switch failed',
        } satisfies SwitchWorkspaceError;
      }

      // Swap the bearer in SecureStore + in-memory client. Dynamic import to
      // avoid pulling auth into this module's eager bundle (and to keep the
      // useMutation hook tree-shakeable from screens that never switch).
      // Also overwrite the cached Session blob so that a page reload doesn't
      // resurrect the old tenant from getCachedSession() before /me returns.
      const { setToken, persistSession } = await import('./auth');
      await setToken(res.data.token);
      await persistSession({
        user: res.data.user,
        client: res.data.client,
        expiresAt: res.data.expiresAt,
      });

      // Seed the currentUser cache so consumers see the new tenant
      // immediately, then invalidate so background refetches confirm.
      qc.setQueryData(userKeys.currentUser, {
        user: res.data.user,
        client: res.data.client,
      });
      await qc.invalidateQueries({ queryKey: userKeys.currentUser });
      await qc.invalidateQueries({ queryKey: userKeys.workspaces });

      return { activeClientId: targetClientId };
    },
  });
}

// ─── update profile ────────────────────────────────────────────────────────

/**
 * Edit the signed-in user's profile (display name / email; and the active
 * client's company / phone / website / address / emailPrefix).
 *
 * The portal PATCH validates name + email (required, ≤255 chars, email
 * uniqueness if changed). On success returns `{ success: true, message }`;
 * we then invalidate `['currentUser']` so the You tab + AuthContext pick
 * up the change.
 */
export function useUpdateProfile(): UseMutationResult<
  { message: string },
  Error,
  ProfileUpdateInput
> {
  const qc = useQueryClient();

  return useMutation<{ message: string }, Error, ProfileUpdateInput>({
    mutationFn: async (input) => {
      const res = await api.patch<{ message?: string } | string>(
        '/api/portal/settings/profile',
        input,
      );
      if (!res.success) throw new Error(res.error);
      const message =
        typeof res.data === 'string'
          ? res.data
          : res.data?.message ?? 'Profile updated';
      return { message };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.currentUser });
      qc.invalidateQueries({ queryKey: userKeys.profile });
    },
  });
}

/**
 * Optional read hook for the extended profile shape (phone / address /
 * emailPrefix) — useful for a future "edit profile" sheet. Not consumed
 * by the You tab today.
 */
export function useProfile(): UseQueryResult<ProfilePayload, Error> {
  return useQuery<ProfilePayload, Error>({
    queryKey: userKeys.profile,
    queryFn: async () => {
      const res = await api.get<ProfilePayload>('/api/portal/settings/profile');
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
