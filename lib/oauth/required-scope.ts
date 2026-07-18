// Pure OAuth consent-scope derivation for the portal REST surface (AUTH79-011).
// Deliberately free of auth/db imports so it's unit-testable in isolation and
// safe to import from anywhere. See lib/portal-auth.ts for how it's enforced.

// Services whose billing category name differs from the OAuth scope resource.
export const SERVICE_TO_SCOPE_RESOURCE: Record<string, string> = {
  booking: 'bookings',
  'pitch-decks': 'decks',
  'help-desk': 'tickets',
  websites: 'sites',
  // identity for the rest (email, surveys, store, hosting, ai, esign, …)
};

/**
 * The OAuth scope a request must carry, or null when the route is scope-exempt
 * (no requireService and no explicit scope — e.g. pure profile/session routes).
 * `write`/`admin`/`owner` actions all map to the resource's `:write` scope.
 */
export function requiredScopeFor(opts?: {
  action?: string;
  requireService?: string;
  scope?: string;
}): string | null {
  if (opts?.scope) return opts.scope;
  if (!opts?.requireService) return null;
  const resource = SERVICE_TO_SCOPE_RESOURCE[opts.requireService] ?? opts.requireService;
  const verb = (opts.action ?? 'read') === 'read' ? 'read' : 'write';
  return `${resource}:${verb}`;
}
