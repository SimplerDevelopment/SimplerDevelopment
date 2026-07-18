/**
 * AUTH79-020 guard: every mutating route under app/api/portal/** should call a
 * role guard. This catches the "membership-only, no role gate" gap where a
 * viewer/member could hit a write route (see docs/design/auth79-020-role-enforcement.md).
 *
 * REPORT MODE (default): prints the ungated mutating routes and exits 0, so it
 * doesn't block commits while the sweep is in progress. Run with --enforce (or
 * PORTAL_AUTHZ_ENFORCE=1) to exit non-zero when a non-excluded mutating route
 * lacks a role guard — flip that on once the sweep is complete.
 *
 * Usage: bun run scripts/check-portal-authz.ts [--enforce]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PORTAL_DIR = join(process.cwd(), 'app', 'api', 'portal');

// Guards that satisfy the role requirement.
const ROLE_GUARDS = [
  'authorizePortal(',
  'authorizePortalSite(',
  'requireBrainEntitlement(',
  'getPublishingSession(',
  'checkPublishingPermission(',
];

// Routes that are intentionally public / identity-level / gated by another
// mechanism — NOT a role-gap. Matched as substrings of the repo-relative path.
// (From the AUTH79-020 survey exclude list.)
const EXCLUDE = [
  'portal/sign-out/',
  'portal/forgot-password/',
  'portal/reset-password/',
  'portal/change-password/',
  'portal/invite/accept/',
  'portal/cards/[id]/unsubscribe/',
  'portal/auth/mobile-sign-in/',
  'portal/resolve-subdomain/',
  'portal/my-subdomain/',
  'portal/switch-client/',
  'portal/default-website/',
  'portal/default-portal/',
  'portal/settings/mfa/', // TOTP on the caller's own user row
  'portal/impersonate/',
  '/callback/', // OAuth callbacks are signed-state gated at /connect time
  'portal/publishing/', // gated by checkPublishingPermission
];

const MUTATING_METHOD = /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b|export\s+const\s+(POST|PUT|PATCH|DELETE)\b/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

const routes = walk(PORTAL_DIR);
const gaps: string[] = [];

for (const file of routes) {
  const rel = file.slice(file.indexOf('app/api/'));
  if (EXCLUDE.some((e) => rel.includes(e))) continue;
  const src = readFileSync(file, 'utf8');
  if (!MUTATING_METHOD.test(src)) continue; // no mutating handler → not required
  if (ROLE_GUARDS.some((g) => src.includes(g))) continue; // has a role guard
  gaps.push(rel);
}

const enforce = process.argv.includes('--enforce') || process.env.PORTAL_AUTHZ_ENFORCE === '1';

if (gaps.length === 0) {
  console.log(`[portal-authz] OK — all ${routes.length} portal routes with a mutating handler call a role guard.`);
  process.exit(0);
}

console.log(
  `[portal-authz] ${gaps.length} mutating route(s) under app/api/portal/** have NO role guard (AUTH79-020):`,
);
for (const g of gaps.sort()) console.log('  •', g);
console.log(
  `\n[portal-authz] ${enforce ? 'ENFORCE mode → failing.' : 'report-only (pass --enforce to fail). Sweep in progress.'}`,
);
process.exit(enforce ? 1 : 0);
