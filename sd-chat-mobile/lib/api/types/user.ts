/**
 * SD Chat — user / workspace / profile types
 *
 * Mirrors the shapes returned by the SimplerDevelopment portal:
 *  - `GET  /api/portal/me`                → { user, client }
 *  - `GET  /api/portal/clients`           → { clients: ClientMembership[], activeClientId }
 *  - `GET  /api/portal/settings/profile`  → ProfilePayload
 *  - `PATCH /api/portal/settings/profile` → { success: true, message: string }
 *  - `POST /api/portal/switch-client`     → { activeClientId, company } (cookie-bound — see below)
 *
 * SHAPES MATCH THE PORTAL VERBATIM. If the portal's response shape changes
 * (e.g. starts returning `avatarUrl`), extend these interfaces — do NOT
 * re-shape inside the queryFn.
 *
 * IMPORTANT — mobile workspace-switch limitation:
 *   The mobile bearer token (`portal_api_keys`) is minted server-side bound
 *   to ONE specific clientId at sign-in (`/portal/mobile-auth` → callback).
 *   `POST /api/portal/switch-client` is cookie-backed and only flips the
 *   web session's active-client cookie — it does NOT re-mint a bearer
 *   token. From the mobile app a workspace switch therefore requires a
 *   full sign-out + sign-in re-flow (re-minting the token against the new
 *   client). See `useSwitchWorkspace` in `lib/api/user.ts` for the gory
 *   details and the gap to close on the backend.
 */

/** Returned from `/api/portal/me`. */
export interface User {
  id: number;
  email: string;
  name: string;
  /** Free-form portal role — 'owner' | 'admin' | 'editor' | 'viewer' | etc. */
  role: string;
}

/** The active client (workspace) embedded in `/api/portal/me`. */
export interface ClientInfo {
  id: number;
  company: string;
  subdomain: string | null;
}

/**
 * Combined "who am I" payload from `/api/portal/me`. The portal envelope
 * (`{ success, data }`) is unwrapped by the API client — these are the raw
 * fields under `data`.
 */
export interface CurrentUser {
  user: User;
  /** null if the user is signed in but has no client account yet. */
  client: ClientInfo | null;
}

/**
 * One workspace + the signing-in user's role on it. Returned as an array by
 * `/api/portal/clients`. The portal models a "workspace" as a `clients` row
 * — the user is a member via `client_members` (modern) or via legacy direct
 * ownership (`clients.user_id`). Either path yields a membership here.
 */
export interface ClientMembership {
  id: number;
  company: string | null;
  /** 'owner' | 'admin' | 'member' | 'viewer' — free-form on the portal. */
  role: string;
  website: string | null;
}

/** Response shape for `GET /api/portal/clients`. */
export interface WorkspacesPayload {
  clients: ClientMembership[];
  /** The portal's idea of "currently active" — derived from cookie or fallback. */
  activeClientId: number | null;
}

/**
 * Profile fields editable by the user. Returned by
 * `GET /api/portal/settings/profile` and accepted by the PATCH.
 *
 * `name` and `email` live on `users`; `company`, `phone`, `website`,
 * `address`, `emailPrefix` live on the active `clients` row. The portal
 * route updates both tables transactionally.
 */
export interface ProfilePayload {
  name: string;
  email: string;
  company: string;
  phone: string;
  website: string;
  address: string;
  emailPrefix: string;
}

/** Patch body — all fields optional; portal validates name + email. */
export interface ProfileUpdateInput {
  name?: string;
  email?: string;
  company?: string;
  phone?: string;
  website?: string;
  address?: string;
  emailPrefix?: string;
}
