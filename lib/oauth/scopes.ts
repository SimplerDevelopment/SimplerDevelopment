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
  // Store / commerce (storefront tools use these; now grantable via OAuth)
  'store:read',
  'store:write',
  'billing:read',
  'hosting:read',
  'ai:read',
  // Company Brain
  'brain:read',
  'brain:write',
  'brain:approve',
  // Approvals workflow
  'approvals:read',
  'approvals:manage',
  // Chat
  'chat:read',
  'chat:write',
  // Notifications
  'notifications:read',
  'notifications:write',
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
  'store:read',
  'billing:read',
  'hosting:read',
  'ai:read',
  // Company Brain (read-only by default; brain:write and brain:approve are opt-in)
  'brain:read',
  // Approvals (read-only by default; approvals:manage is opt-in)
  'approvals:read',
  // Notifications (read-only by default)
  'notifications:read',
  // Chat (read-only by default)
  'chat:read',
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
