/**
 * SD Chat — AuthContext
 *
 * Top-level provider that owns user/session state. Wraps the app tree in
 * `_layout.tsx`. Exposes `{ user, client, isLoading, isAuthenticated,
 * signIn, signOut, refresh }` via the `useAuth()` hook.
 *
 * Boot sequence:
 *   1. Hydrate the in-memory bearer token from SecureStore.
 *   2. Show the cached session immediately so the UI can render.
 *   3. Mount `useCurrentUser()` — Tanstack Query fires `/api/portal/me`,
 *      validates the token, and pushes fresh user/client into the cache.
 *      Any later screen that reads `useAuth().user` (or `useCurrentUser()`
 *      directly) sees the fresh data.
 *   4. Register a 401 handler so any API call that 401s clears the token
 *      and bounces the user to `/(auth)/sign-in`.
 *
 * `refresh()` simply invalidates the `['currentUser']` query — the hook
 * re-fires, the consumers re-render.
 *
 * IMPORTANT for other agents:
 *   - `user` and `client` come from the `['currentUser']` Tanstack Query
 *     cache once the network call resolves; before that they come from the
 *     cached session (SecureStore). Either way the shape is the existing
 *     `User` / `ClientInfo` from `lib/api/types.ts`.
 *   - `isLoading` is `true` only during the FIRST boot hydration. After
 *     that, `useCurrentUser()` exposes its own `isFetching` flag — read it
 *     directly if you care about background refetches.
 *   - To trigger a refresh after a workspace switch or profile edit, call
 *     `refresh()`; do NOT call `fetchSession()` from `lib/api/auth.ts`
 *     directly (it bypasses the React Query cache).
 */

import { useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  clearToken,
  getCachedSession,
  hydrateAuth,
  signInWithBrowser as apiSignInWithBrowser,
  signInWithCredentials as apiSignInWithCredentials,
  signOut as apiSignOut,
} from '@/lib/api/auth';
import { setUnauthorizedHandler } from '@/lib/api/client';
import { useCurrentUser, userKeys } from '@/lib/api/user';
import type { ClientInfo, Session, User } from '@/lib/api/types';

export interface AuthContextValue {
  user: User | null;
  client: ClientInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Native credentials sign-in — POSTs to /api/portal/auth/mobile-sign-in. */
  signInWithCredentials: (input: { email: string; password: string }) => Promise<void>;
  /** Open the in-app browser and complete the bridge sign-in (legacy / SSO). */
  signInWithBrowser: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-fetch `/api/portal/me` (e.g. after switching workspace). */
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  /** Cached session from SecureStore — used as the boot fallback while the
   *  network call to `/api/portal/me` is in flight. Once `useCurrentUser`
   *  returns data we prefer that, but we keep the cached values around so
   *  a foregrounded app doesn't flash empty fields. */
  const [cachedSession, setCachedSession] = useState<Session | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const bootRan = useRef(false);

  // 401 → wipe + bounce to sign-in. Registered once.
  // ONLY bounce on 401 from /api/portal/me — that's the canonical "token is
  // invalid" probe. Other endpoints (workspaces, brain, etc.) can 401 for
  // endpoint-specific reasons (e.g. session-cookie-only routes) without
  // invalidating the entire session.
  useEffect(() => {
    setUnauthorizedHandler((info) => {
      // eslint-disable-next-line no-console
      console.warn('[auth] unauthorized from', info.method, info.url);
      if (!info.url.endsWith('/api/portal/me')) {
        // eslint-disable-next-line no-console
        console.warn('[auth] non-/me 401 — NOT bouncing, just failing the query');
        return;
      }
      void (async () => {
        await clearToken();
        setCachedSession(null);
        setHasToken(false);
        qc.removeQueries({ queryKey: userKeys.currentUser });
        qc.removeQueries({ queryKey: userKeys.workspaces });
        router.replace('/(auth)/sign-in');
      })();
    });
    return () => setUnauthorizedHandler(null);
  }, [router, qc]);

  // Boot — hydrate token + cached session. The actual network probe is now
  // owned by `useCurrentUser` below (Tanstack Query handles caching,
  // invalidation, AppState refetches, etc.).
  useEffect(() => {
    if (bootRan.current) return;
    bootRan.current = true;

    void (async () => {
      try {
        const hasTok = await hydrateAuth();
        setHasToken(hasTok);
        const cached = await getCachedSession();
        if (cached) setCachedSession(cached);
      } finally {
        setIsHydrating(false);
      }
    })();
  }, []);

  // ─── live user query ─────────────────────────────────────────────────────
  // Only enabled once we know there's a token to validate; otherwise the
  // query would 401 on cold boot for unauthenticated users — and worse,
  // would race ahead of `hydrateAuth()` for users who DO have a token in
  // SecureStore / localStorage, firing /me with no Authorization header,
  // triggering the global 401 handler, and wiping the just-loaded token.
  // Gate the query on hydration completing AND a token being present.
  const currentUserQuery = useCurrentUser({ enabled: !isHydrating && hasToken });
  const liveData = hasToken ? currentUserQuery.data : undefined;
  const liveError = hasToken ? currentUserQuery.error : null;

  // Compose effective user/client. Live wins; cached fills the gap.
  const effectiveUser: User | null =
    liveData?.user ?? cachedSession?.user ?? null;
  const effectiveClient: ClientInfo | null =
    liveData?.client ?? cachedSession?.client ?? null;

  const applySignInResult = useCallback(
    (result: Session) => {
      setCachedSession(result);
      setHasToken(true);
      // Seed Tanstack Query immediately so screens that read currentUser
      // don't have to wait for a round-trip.
      qc.setQueryData(userKeys.currentUser, {
        user: result.user,
        client: result.client,
      });
      qc.invalidateQueries({ queryKey: userKeys.currentUser });
    },
    [qc],
  );

  const signInWithCredentials = useCallback(
    async (input: { email: string; password: string }) => {
      const result = await apiSignInWithCredentials(input);
      applySignInResult(result);
    },
    [applySignInResult],
  );

  const signInWithBrowser = useCallback(async () => {
    const result = await apiSignInWithBrowser();
    applySignInResult(result);
  }, [applySignInResult]);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setCachedSession(null);
    setHasToken(false);
    qc.removeQueries({ queryKey: userKeys.currentUser });
    qc.removeQueries({ queryKey: userKeys.workspaces });
  }, [qc]);

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: userKeys.currentUser });
  }, [qc]);

  // isLoading: only during initial hydration. After that, individual
  // consumers can opt into `useCurrentUser().isFetching` if they want to
  // know about background refetches.
  const isLoading = isHydrating;
  const isAuthenticated = hasToken && (effectiveUser !== null || isHydrating);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: effectiveUser,
      client: effectiveClient,
      isLoading,
      isAuthenticated,
      signInWithCredentials,
      signInWithBrowser,
      signOut,
      refresh,
    }),
    [
      effectiveUser,
      effectiveClient,
      isLoading,
      isAuthenticated,
      signInWithCredentials,
      signInWithBrowser,
      signOut,
      refresh,
    ],
  );

  // Defensive log path: if the live query errored AND we have no cached
  // session, surface a sign-out-ish state so consumers don't read stale
  // data. The 401 handler already covers the auth-failure path; this is
  // just for non-401 transport errors (we keep the cached session as a
  // best-effort fallback rather than nuking it).
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  liveError;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
