#!/usr/bin/env bun
/**
 * Portal role-gate ratchet (AUTH79-020).
 *
 * Every `app/api/portal/**\/route.ts` must reach a role gate: `authorizePortal(`,
 * `authorizePortalSite(` or `gatePortalRole(`. The sweep that adds those gates is
 * long, so the baseline in `scripts/portal-role-gates.baseline.json` pins the
 * routes that are STILL ungated and the ratchet only lets that list shrink:
 *
 *   (a) a new ungated, non-exempt route that is not in the baseline -> fail
 *   (b) a baseline entry that is now gated, exempt or deleted        -> fail
 *       (delete the line, so the list can never quietly grow back)
 *   (c) a gated file with a mutating handler that never names an action above
 *       'read' -> fail, unless the handler's export line carries
 *       `// role-gate: read-ok <reason>`. That is the "I gated it, at read, on
 *       purpose" escape hatch; it forces the reason to be written down.
 *
 * Regenerate the baseline after gating routes:
 *     bun scripts/check-portal-role-gates.ts --write-baseline
 *
 * Decision logic is the pure `evaluateRoleGates` below (unit-tested in
 * tests/unit/check-portal-role-gates.test.ts); the file IO is at the bottom.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PORTAL_DIR = 'app/api/portal';
const BASELINE = 'scripts/portal-role-gates.baseline.json';
const ADR = 'ADR portal-role-matrix (docs/design/auth79-020-role-matrix.md)';

/**
 * Routes that legitimately have NO company role gate. Each entry is a claim that
 * was checked against the route's source — keep the reason honest and specific,
 * because this map is how a route is allowed to skip the matrix.
 *
 * Do NOT add a route just to quiet the ratchet. "Shared with the whole team" is
 * not "own data": saved-views, realtime comments and onboarding PATCH/POST were
 * checked and are deliberately NOT here (see the PR for AUTH79-020).
 */
export const EXEMPT: Record<string, string> = {
  // -- Not session/role based at all
  'app/api/portal/sign-out/route.ts': 'touches no data; only clears the caller\'s own session cookies',
  'app/api/portal/reset-password/route.ts':
    'pre-session; authenticated by a hashed single-use reset token and IP rate-limited',
  'app/api/portal/cards/[id]/unsubscribe/route.ts':
    'public email-footer link; authenticated by an HMAC token bound to (cardId, userId), timing-safe compared (verifyUnsubscribe)',

  // -- OAuth callbacks: the signed `state` minted by the admin-gated /connect is the authorization
  'app/api/portal/integrations/google/callback/route.ts':
    'HMAC-signed state {clientId,userId,nonce,10min expiry} minted only by the admin-gated /connect; callback 403s unless session user === state.userId',
  'app/api/portal/integrations/microsoft/callback/route.ts':
    'HMAC-signed state {clientId,userId,nonce,10min expiry} minted only by the admin-gated /connect; callback 403s unless session user === state.userId',
  'app/api/portal/integrations/linkedin/callback/route.ts':
    'HMAC-signed state {clientId,userId,nonce,10min expiry} minted only by the admin-gated /connect; callback 403s unless session user === state.userId',

  // -- The caller's own account: every query is keyed by the session user id
  'app/api/portal/switch-client/route.ts':
    'only lets the caller pick a company from their OWN memberships (getPortalClients) and sets their cookie',
  'app/api/portal/my-tasks/route.ts': 'GET; collectors filter by assignee/owner === session user id',
  'app/api/portal/notifications/route.ts': 'GET; notifications table is per-user, every query is userId = session user',
  'app/api/portal/notifications/mark-read/route.ts': 'marks the caller\'s own notification rows read (userId = session user)',
  'app/api/portal/notifications/tick/route.ts':
    'GET poll; per-user notification counts plus CRM notifications keyed (clientId, userId)',
  'app/api/portal/crm/notifications/route.ts': 'every query keyed (clientId, userId = session user)',
  'app/api/portal/crm/notifications/mark-all-read/route.ts': 'every query keyed (clientId, userId = session user)',
  'app/api/portal/crm/notifications/[id]/route.ts': 'GET/PATCH/DELETE keyed (clientId, userId = session user); cannot touch another user\'s row',
  'app/api/portal/crm/notification-preferences/route.ts': 'upserts rows keyed (clientId, userId = session user)',
  'app/api/portal/onboarding/status/route.ts':
    'read-only GET of the caller\'s active-company setup checklist; "read" is satisfied by every member so a gate adds nothing',

  // -- Staff-only surface: company roles do not apply (platform staff are not company members)
  'app/api/portal/cards/[id]/time-logs/[logId]/route.ts':
    'DELETE is 403 unless session role is admin|employee (platform staff), and is tenant-scoped via the projects.clientId join; staff hold no company role to gate on',
};

// ---------------------------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------------------------

export interface RouteSource {
  /** Repo-relative path, e.g. app/api/portal/cards/route.ts */
  path: string;
  source: string;
}

export type ViolationKind = 'new-ungated' | 'stale-baseline' | 'gated-no-action';

export interface Violation {
  kind: ViolationKind;
  path: string;
  message: string;
}

export interface Evaluation {
  violations: Violation[];
  /** Sorted paths that are ungated and not exempt — what the baseline must equal. */
  ungated: string[];
}

const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const READ_OK_MARKER = /\/\/\s*role-gate:\s*read-ok\b/;

/** Drop comments so a doc-comment that MENTIONS authorizePortal( doesn't count as a gate. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** Split call arguments at top-level commas, honouring (), {}, [] and string literals. */
function splitArgs(src: string, openParenIdx: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let cur = '';
  let quote: string | null = null;
  for (let i = openParenIdx + 1; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      cur += ch;
      if (ch === '\\') {
        cur += src[++i] ?? '';
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    if (ch === ')' || ch === '}' || ch === ']') {
      if (depth === 0) {
        if (cur.trim()) args.push(cur.trim());
        return args;
      }
      depth--;
    }
    if (ch === ',' && depth === 0) {
      args.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

type Level = 'read' | 'above-read' | 'unknown';

/** Classify an action expression: a quoted literal is exact; anything else is dynamic (assume it is chosen deliberately). */
function classifyAction(expr: string | undefined): Level {
  if (expr === undefined) return 'read'; // no action given: authorizePortal defaults to 'read'
  const lit = expr.match(/^['"`](read|write|admin|owner)['"`]$/);
  if (lit) return lit[1] === 'read' ? 'read' : 'above-read';
  return 'unknown';
}

/** True when the (comment-stripped) source names an action above 'read' on any gate call. */
export function namesActionAboveRead(stripped: string): boolean {
  for (const m of stripped.matchAll(/\b(authorizePortalSite|authorizePortal)\s*\(/g)) {
    const args = splitArgs(stripped, m.index! + m[0].length - 1);
    if (args.length === 0) continue; // authorizePortal() -> default read
    const first = args[0];
    if (!first.startsWith('{')) return true; // options passed as a variable: can't see inside, assume deliberate
    const am = first.match(/\baction\s*:\s*([^,}]+)/);
    const level = classifyAction(am?.[1].trim());
    if (level !== 'read') return true;
  }
  for (const m of stripped.matchAll(/\bgatePortalRole\s*\(/g)) {
    const args = splitArgs(stripped, m.index! + m[0].length - 1);
    if (classifyAction(args[2]) !== 'read') return true;
  }
  return false;
}

export function isGated(stripped: string): boolean {
  return /\b(authorizePortalSite|authorizePortal|gatePortalRole)\s*\(/.test(stripped);
}

/**
 * Mutating handlers exported from the file, each with the raw line it is exported on (the
 * line a `// role-gate: read-ok` marker must sit on). Line-based, skipping comment lines, so a
 * doc-comment that says "export async function POST" is not mistaken for a handler.
 */
export function mutatingHandlers(source: string): { method: string; line: string }[] {
  const out: { method: string; line: string }[] = [];
  const alt = MUTATING.join('|');
  const decl = new RegExp(`^\\s*export\\s+(?:async\\s+function|function|const)\\s+(${alt})\\b`);
  const list = new RegExp(`^\\s*export\\s*\\{[^}]*\\bas\\s+(${alt})\\b`);
  let inBlock = false;
  for (const line of source.split('\n')) {
    const t = line.trim();
    if (inBlock) {
      if (t.includes('*/')) inBlock = false;
      continue;
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) inBlock = true;
      continue;
    }
    if (t.startsWith('//') || t.startsWith('*')) continue;
    const m = line.match(decl) ?? line.match(list);
    if (m) out.push({ method: m[1], line });
  }
  return out;
}

export function evaluateRoleGates(input: {
  routes: RouteSource[];
  baseline: string[];
  exempt: Record<string, string>;
}): Evaluation {
  const { routes, baseline, exempt } = input;
  const baselineSet = new Set(baseline);
  const byPath = new Map(routes.map((r) => [r.path, r] as const));
  const violations: Violation[] = [];
  const ungated: string[] = [];

  for (const { path, source } of routes) {
    const stripped = stripComments(source);
    const gated = isGated(stripped);
    const isExempt = Object.prototype.hasOwnProperty.call(exempt, path);

    if (!gated && !isExempt) {
      ungated.push(path);
      if (!baselineSet.has(path)) {
        violations.push({
          kind: 'new-ungated',
          path,
          message: `${path}: new portal route ships without a role gate — call gatePortalRole/authorizePortal (${ADR}). If it truly needs none (caller's own data, public token link), add it to EXEMPT in scripts/check-portal-role-gates.ts with the reason.`,
        });
      }
    }

    if (gated) {
      const muts = mutatingHandlers(source);
      if (muts.length > 0 && !namesActionAboveRead(stripped)) {
        for (const h of muts) {
          if (READ_OK_MARKER.test(h.line)) continue;
          violations.push({
            kind: 'gated-no-action',
            path,
            message: `${path}: ${h.method} is gated but never names an action above 'read' — a viewer still passes it. Use 'write' (content) / 'admin' / 'owner' per ${ADR}, or mark the export line with \`// role-gate: read-ok <reason>\`.`,
          });
        }
      }
    }
  }

  for (const entry of baseline) {
    const route = byPath.get(entry);
    const isExempt = Object.prototype.hasOwnProperty.call(exempt, entry);
    let why: string | null = null;
    if (!route) why = 'is deleted';
    else if (isExempt) why = 'is now exempt';
    else if (isGated(stripComments(route.source))) why = 'is now gated';
    if (why) {
      violations.push({
        kind: 'stale-baseline',
        path: entry,
        message: `${entry}: ${why} — remove it from ${BASELINE} (the list only shrinks; regenerate with \`bun scripts/check-portal-role-gates.ts --write-baseline\`).`,
      });
    }
  }

  return { violations, ungated: ungated.sort() };
}

// ---------------------------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------------------------

function listRouteFiles(): string[] {
  // Tracked + untracked-but-not-ignored, so a brand-new route is checked before it is `git add`ed.
  const out = execSync(`git ls-files --cached --others --exclude-standard -- ${PORTAL_DIR}`, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter((f) => f.endsWith('/route.ts') && existsSync(f))
    .sort();
}

function main(): void {
  const routes: RouteSource[] = listRouteFiles().map((path) => ({ path, source: readFileSync(path, 'utf8') }));

  if (process.argv.includes('--write-baseline')) {
    const { ungated } = evaluateRoleGates({ routes, baseline: [], exempt: EXEMPT });
    writeFileSync(BASELINE, JSON.stringify(ungated, null, 2) + '\n');
    console.log(`Wrote ${ungated.length} ungated route(s) to ${BASELINE}.`);
    return;
  }

  if (!existsSync(BASELINE)) {
    console.error(`Missing ${BASELINE}. Create it with: bun scripts/check-portal-role-gates.ts --write-baseline`);
    process.exit(1);
  }
  const baseline: string[] = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { violations, ungated } = evaluateRoleGates({ routes, baseline, exempt: EXEMPT });

  if (violations.length > 0) {
    console.error(`Portal role-gate ratchet failed (${violations.length}):`);
    for (const v of violations) console.error(`  - ${v.message}`);
    process.exit(1);
  }
  console.log(
    `Portal role gates OK — ${routes.length} routes, ${ungated.length} still ungated (baseline), ${Object.keys(EXEMPT).length} exempt.`,
  );
}

// Run only as a script, not when the unit test imports evaluateRoleGates.
if (process.argv[1] && /check-portal-role-gates\.ts$/.test(process.argv[1])) main();
