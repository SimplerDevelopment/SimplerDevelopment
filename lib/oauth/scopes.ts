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
  // Destructive-action tier (MEB-004): deleting is a separate, opt-in scope
  // from writing. `*` and `projects:*` still grant it; `projects:write` alone
  // no longer does.
  'projects:delete',
  'tickets:read',
  'tickets:write',
  'crm:read',
  'crm:write',
  'crm:delete',
  'sites:read',
  'sites:write',
  'sites:delete',
  'media:read',
  'media:write',
  'media:delete',
  'email:read',
  'email:write',
  // Sending campaigns is a separate, higher-privilege scope from email:write
  // (which only drafts/edits). Gated on email_campaigns_send.
  'email:send',
  'email:delete',
  'decks:read',
  'decks:write',
  'decks:delete',
  'surveys:read',
  'surveys:write',
  'bookings:read',
  'bookings:write',
  'automations:read',
  'automations:write',
  'automations:delete',
  'team:read',
  'team:write',
  'integrations:read',
  'integrations:write',
  'services:read',
  'services:write',
  // Store / commerce (storefront tools use these; now grantable via OAuth)
  'store:read',
  'store:write',
  // E-signature / contracts (crm/contracts routes gate on requireService 'esign')
  'esign:read',
  'esign:write',
  'billing:read',
  'hosting:read',
  'ai:read',
  // Branding profile (brand colors / fonts / messaging tools use these)
  'branding:read',
  'branding:write',
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
  // SEO Intelligence (read-only MCP surface today; writes go through the portal)
  'seo:read',
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
  'esign:read',
  'billing:read',
  'hosting:read',
  'ai:read',
  // Branding (read-only by default; branding:write is opt-in)
  'branding:read',
  // Company Brain (read-only by default; brain:write and brain:approve are opt-in)
  'brain:read',
  // Approvals (read-only by default; approvals:manage is opt-in)
  'approvals:read',
  // Notifications (read-only by default)
  'notifications:read',
  // Chat (read-only by default)
  'chat:read',
  // SEO Intelligence (read-only; the module has no OAuth-writable surface yet)
  'seo:read',
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

/**
 * MEB-006 — whether an OAuth token holding these scopes should default to
 * requiring CMS approval (staging its writes for human review). True when the
 * token can perform any gated write, i.e. it holds `*` or any `:write` / `:send`
 * / `:delete` scope. Secure-by-default for NEW external connections; existing
 * tokens keep their stored `require_cms_approval` value. A read-only token
 * (no write scopes) stays un-gated so it can answer questions freely.
 */
export function scopesRequireApproval(scopes: string[]): boolean {
  return scopes.some(
    (s) => s === '*' || s.endsWith(':write') || s.endsWith(':send') || s.endsWith(':delete'),
  );
}
