// Plugin entitlement helpers.
//
// Canonical "is this client allowed to use this plugin?" check. Lives here
// (not in `lib/plugins/proxy.ts`) so server components, layouts, and the
// callback handler can all import the same logic without dragging
// edge-runtime middleware imports into the Node runtime. Worker 2C's
// `proxy.ts` may import these helpers directly if it's compiled for Node, or
// duplicate the logic if it's compiled for Edge — either way the rules here
// are the source of truth.
//
// Visibility rules (mirrors `.planning/plugin-registry-spec.md` §Entitlement):
//   • visibility='global'    → every authenticated tenant
//   • visibility='allowlist' → clientId must appear in app.allowedClientIds
//   • visibility='entitled'  → an active clientServices row must join to
//                              services.id = app.billingServiceId
//
// Test bypass: PLUGINS_ENTITLEMENT_BYPASS=1 short-circuits to `true`, so
// Playwright + vitest specs can exercise the proxied UI without seeding a
// services row + clientServices grant in every fixture. Mirrors the
// VITEST/POOL_ID bypasses in `lib/brain/entitlement.ts` and
// `app/portal/email/layout.tsx`.

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clientServices } from '@/lib/db/schema';
import { registeredApps, type RegisteredApp } from '@/lib/db/schema/plugins';

/**
 * True when the test runner is hosting this process. Mirrors the bypass used
 * by `lib/brain/entitlement.ts` so plugin specs don't need to seed a
 * `services` SKU + `client_services` grant on every run.
 */
function isTestRuntime(): boolean {
  if (process.env.PLUGINS_ENTITLEMENT_BYPASS === '1') return true;
  if (process.env.VITEST === 'true' || process.env.VITEST === '1') return true;
  if (process.env.VITEST_POOL_ID !== undefined) return true;
  return false;
}

/**
 * Returns true when the given client is allowed to access the given plugin
 * app. See module docstring for the three visibility modes.
 *
 * NOTE: This is intentionally a "may proceed" check. Tenant boundary
 * re-checks on individual callbacks (against JWT claims) still happen inside
 * `lib/plugins/callback-auth.ts` — JWT alone never grants authority.
 */
export async function isClientEntitledToApp(
  clientId: number,
  app: RegisteredApp,
): Promise<boolean> {
  if (isTestRuntime()) return true;

  if (app.status !== 'active') return false;

  switch (app.visibility) {
    case 'global':
      return true;

    case 'allowlist': {
      const allowed = app.allowedClientIds ?? [];
      return allowed.includes(clientId);
    }

    case 'entitled': {
      if (!app.billingServiceId) return false;
      const rows = await db
        .select({ id: clientServices.id })
        .from(clientServices)
        .where(and(
          eq(clientServices.clientId, clientId),
          eq(clientServices.serviceId, app.billingServiceId),
          eq(clientServices.status, 'active'),
        ))
        .limit(1);
      return rows.length > 0;
    }

    default:
      // Unknown visibility value — fail closed.
      return false;
  }
}

/**
 * Look up an active plugin by its slug. Returns null when the slug doesn't
 * match any row or when the matching row is `status='draft'` /
 * `status='disabled'`.
 *
 * Used by the entitlement layout to decide between "show the app" /
 * "show the upsell" / 404.
 */
export async function findActivePluginBySlug(
  slug: string,
): Promise<RegisteredApp | null> {
  const [row] = await db
    .select()
    .from(registeredApps)
    .where(and(
      eq(registeredApps.slug, slug),
      eq(registeredApps.status, 'active'),
    ))
    .limit(1);
  return row ?? null;
}
