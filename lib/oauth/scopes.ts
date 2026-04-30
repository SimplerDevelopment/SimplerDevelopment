/** Scopes the OAuth authorization server advertises in discovery and accepts
 *  in /authorize requests. These mirror the strings the MCP tool layer checks
 *  via `hasScope` in `lib/mcp-auth.ts`. `*` is the catch-all granted to keys
 *  the user explicitly elevates. */
export const SUPPORTED_SCOPES = [
  '*',
  'profile:read',
  'profile:write',
  'projects:read',
  'projects:write',
  'tickets:read',
  'tickets:write',
  'crm:read',
  'crm:write',
  'sites:read',
  'sites:write',
  'media:read',
  'media:write',
  'email:read',
  'email:write',
  'decks:read',
  'decks:write',
  'surveys:read',
  'surveys:write',
  'bookings:read',
  'bookings:write',
  'automations:read',
  'automations:write',
  'team:read',
  'team:write',
  'integrations:read',
  'integrations:write',
  'services:read',
  'services:write',
  'billing:read',
  'hosting:read',
  'ai:read',
] as const;

export type SupportedScope = (typeof SUPPORTED_SCOPES)[number];

/** Default scope set for an OAuth grant when the client requests `scope=*` or
 *  omits the scope param. We grant full read across resources so Claude can
 *  navigate the portal; writes still require the user to opt in by checking
 *  the explicit write scopes on the consent screen. */
export const DEFAULT_GRANTED_SCOPES: string[] = [
  'profile:read',
  'projects:read',
  'tickets:read',
  'crm:read',
  'sites:read',
  'media:read',
  'email:read',
  'decks:read',
  'surveys:read',
  'bookings:read',
  'automations:read',
  'team:read',
  'integrations:read',
  'services:read',
  'billing:read',
  'hosting:read',
  'ai:read',
];

/** Parse the OAuth `scope` query/form param (space-separated) and intersect
 *  with what we support. Unknown scopes are silently dropped. */
export function parseRequestedScopes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter((s): s is SupportedScope => (SUPPORTED_SCOPES as readonly string[]).includes(s));
}
