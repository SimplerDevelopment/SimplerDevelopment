// Per-client beta gates ("feature flags") — PUX-135.
//
// Two halves, deliberately split:
//   - WHICH flags exist is CODE — this registry. A flag is scaffolding for a
//     feature in flight, not configuration, so it lives (and dies) with the
//     code it gates. The admin matrix at /admin/feature-flags renders from
//     this list, so a flag the code doesn't know about can never be set.
//   - WHICH clients have a flag is DATA — clients.feature_flags (jsonb
//     string[]). Toggled by staff at /admin/feature-flags; flips instantly
//     with no redeploy (same reasoning as clientWebsites.cdnCacheEnabled).
//
// Targeting is per CLIENT (tenant), never per user. Every gated surface —
// authorizePortal, PortalShell, PortalMcpContext.client, the site resolver —
// already holds the full clients row, so hasFlag() is a sync array lookup
// with zero extra queries. Staff dogfood by flagging client 104
// (SimplerDevelopment) and impersonating; there is deliberately NO
// "staff always on" rule, so impersonation shows exactly what the customer
// sees. Not covered by billing entitlements on purpose: those are PAID gating
// and billingMode='agency' bypasses them, so they can't hide a beta.
//
// Lifecycle (scripts/doctor.ts nags when a flag breaks it):
//   1. add an entry here with today's `since`       → nobody has it
//   2. flag client 104 at /admin/feature-flags      → dogfood in prod
//   3. flag the beta clients                         → beta
//   4. set defaultOn: true                           → GA; the column is ignored
//   5. delete the entry, the `if`s it gated, and the stored values:
//        UPDATE clients SET feature_flags = feature_flags - '<key>';
// A flag older than STALE_AFTER_DAYS, or already defaultOn, is debt.
//
// Denial surfaces:
//   API route   → authorizePortal({ requireFlag }) → 403 { error:'feature_not_enabled', flag }
//   MCP tool    → requireFlag(ctx, key) / flagDenied(key) in lib/mcp/types.ts
//   portal page → if (!hasFlag(client, key)) notFound()
//   sidebar     → `requiredFlag` on a PortalNavItem (lib/portal-nav.ts)
//   client UI   → SerializableEntitlements.flags (app/portal/PortalShell.tsx)

export interface FlagDef {
  /** ISO date (YYYY-MM-DD) the flag was added. Drives the doctor staleness check. */
  since: string;
  /** GA switch: true = on for every client regardless of the column. Delete the flag soon after. */
  defaultOn: boolean;
}

export const FLAGS = {
  // PUX-134 — the Harbor-palette portal redesign. Gates nothing yet; it exists
  // to prove the admin toggle end-to-end on client 104.
  'portal-redesign': { since: '2026-08-27', defaultOn: false },
} as const satisfies Record<string, FlagDef>;

export type FlagKey = keyof typeof FLAGS;
export const FLAG_KEYS = Object.keys(FLAGS) as FlagKey[];
export const STALE_AFTER_DAYS = 60;

export function isFlagKey(v: unknown): v is FlagKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(FLAGS, v);
}

/** Anything carrying the clients.feature_flags column (the full row, or a projection). */
export type Flagged = { featureFlags?: string[] | null } | null | undefined;

/** Sync — pass the already-loaded clients row. Unknown/deleted keys in the column are ignored. */
export function hasFlag(client: Flagged, key: FlagKey): boolean {
  if (FLAGS[key].defaultOn) return true;
  return (client?.featureFlags ?? []).includes(key);
}

/** Flags on for this client, as a serializable list for nav / client components. */
export function activeFlags(client: Flagged): FlagKey[] {
  return FLAG_KEYS.filter((k) => hasFlag(client, k));
}

/** Flags that have outlived their purpose. scripts/doctor.ts prints one warning each. */
export function staleFlags(now: Date = new Date()): { key: FlagKey; reason: string }[] {
  const out: { key: FlagKey; reason: string }[] = [];
  for (const key of FLAG_KEYS) {
    const def: FlagDef = FLAGS[key];
    if (def.defaultOn) {
      out.push({ key, reason: 'is defaultOn (GA) — delete the flag, its branches, and the stored values' });
      continue;
    }
    const ageDays = Math.floor((now.getTime() - new Date(def.since).getTime()) / 86_400_000);
    if (Number.isNaN(ageDays)) {
      out.push({ key, reason: `has an unparseable since date "${def.since}"` });
    } else if (ageDays > STALE_AFTER_DAYS) {
      out.push({ key, reason: `is ${ageDays} days old (> ${STALE_AFTER_DAYS}) — ship it (defaultOn) or kill it` });
    }
  }
  return out;
}
