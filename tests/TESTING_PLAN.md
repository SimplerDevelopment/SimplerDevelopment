# Testing Plan — simplerdevelopment2026

Goal: **measurable, reproducible coverage across three test layers** — unit, integration, E2E — driving both server and UI/UX quality. All layers re-runnable via one script.

---

## 1. Current state

| Layer | Runner | Specs | Coverage wired? |
|---|---|---|---|
| Unit | Vitest + jsdom / node | ~776 files in `tests/unit/` | `vitest --coverage` script exists; thresholds currently 0 (unenforced) |
| Integration API | Vitest + node + real DB | ~187 files in `tests/integration/api/` | no |
| Integration UI | Vitest + jsdom | ~24 files in `tests/integration/` (visual-editor, drag, keyboard, branding, surveys, etc.) | no |
| E2E | Playwright (chromium only) | ~243 files in `tests/e2e/` | no server-side coverage |

Note: these counts are indicative of current scale (as of 2026-06-24), not a frozen target. Run `find tests -name '*.test.{ts,tsx}' -path '*unit*' | wc -l` etc. for live figures.

Key gap: server code coverage is not yet collected in any automated run. The integration-API layer (`tests/integration/api/`) has extensive route-handler tests but they require a real DB.

## 2. Targets

| Metric | Unit | Integration (API + UI) | E2E | Combined |
|---|---|---|---|---|
| Line coverage | — | — | — | **≥ 80 % server, ≥ 70 % client** |
| Branch coverage — auth/authorisation paths | — | — | — | **≥ 90 %** |
| Wall-clock (unit) | ≤ 30 s | | | |
| Wall-clock (integration) | | ≤ 3 min | | |
| Wall-clock (E2E) | | | ≤ 25 min on 4 workers | |
| Flake rate (pass after 1 retry) | | | < 2 % | |
| Tenancy leak regression | — | — | 100 % of known classes | |
| Single-script re-run | | | | `./scripts/test.sh` |

Combined coverage is measured by merging v8 reports across all three layers.

Out of scope: load/perf, booking-app sub-workspace (has its own test harness).

---

## 3. Three-layer responsibility model

Picking the right layer matters — it's the difference between a fast, deterministic signal and a 25-minute flake.

### Layer 1 — Unit (Vitest)

**What to put here:** pure functions, single React component behaviour, custom hooks, small utility classes, schema validators, pricing/number formatters, brand-contrast calculations, survey-builder field-id generators, markdown parsers.

**Rule:** no network, no DB, no filesystem, no `next/*` imports that require the Next runtime. Mock `db` if absolutely needed; better, isolate the pure logic so it doesn't import `db`.

**Environment:** `jsdom` when the module touches DOM/React, `node` otherwise. Per-file override via comment:

```ts
// @vitest-environment node
```

**What goes here that doesn't today:**
- `lib/ssrf-guard.ts` — validateWebhookUrl with a table of inputs (just fixed IPv6 bug, needs regression tests)
- `lib/pm-webhooks.ts` — HMAC signer, delivery-failure bookkeeping (pure parts)
- `lib/portal-client.ts` — role resolution from mixed ownership/membership data
- `lib/email/*` — template builders, unsubscribe token generation/verification
- `lib/automation/nlp-parser.ts` — prompt → rule translation
- `lib/ai/*` — tool-schema validators
- Block-editor registry, block-prop serialisers
- All of `lib/branding/*` pure-logic helpers

**Sizing:** ~776 unit test files today (as of 2026-06-24), already well past the original ~200 target. Each < 50 ms.

### Layer 2 — Integration

Split cleanly into two sublayers.

#### 2a — UI integration (Vitest + jsdom + testing-library)

**What to put here:** multi-component flows inside a single page, component + store/context, drag-drop state machines, keyboard shortcuts, undo/redo, form validation, optimistic update rollback.

**Rule:** mock network calls (MSW or per-test `vi.mock('@/lib/api-client')`). No real DB. Render the smallest component subtree that exercises the behaviour.

**What lives here already:** ~24 UI-integration test files covering visual-editor, drag/drop, keyboard shortcuts, branding, surveys, CRM modals, pitch-deck panels, navigation, etc. — good reference template.

**To add:**
- Card detail modal — assign/unassign, comment submit with @ mentions, checklist toggle optimism, watcher state
- Kanban board — column drag reorder, card drag across columns, filter state sync
- CRM deal form — custom-field rendering, validation, submit/reset
- Pitch-deck slide editor — slide add/remove/reorder
- Branding profile editor — color-picker state, live preview, dirty-state warning
- Email block editor — insert/move/delete blocks, paste
- Survey builder — field add/edit/delete/reorder, logic rules

#### 2b — API integration (Vitest + node + real DB) — **NEW**

**What to put here:** route handlers tested as functions. Construct a `NextRequest`, pass through auth mock, call the handler, assert DB state + response. Real Postgres — a dedicated test schema seeded fresh per spec (or per describe block).

**Why not just use E2E for this?** Three reasons: (1) 10× faster than spinning up browser + server, (2) deterministic error injection (set `db` mock to throw), (3) finer-grained — exercise every branch of a handler in one file.

**Rule:** hits real DB on a test schema. Mocks third-party APIs (Stripe, Resend, Google, Zoom) via MSW. Does not render any UI. No cookie jar — session is constructed directly via the auth helper.

**Directory:** `tests/integration/api/*.test.ts`

**Scaffolding needed** (see §6):
- `withTestDb()` — boot isolated schema, run migrations, hand back db client + cleanup
- `callHandler(method, path, { session, body, query, params })` — thin wrapper that loads the matching `route.ts` and invokes the method export
- `sessionFor(user)` — forge a valid auth session object
- `mockStripe`, `mockResend`, `mockGoogle`, `mockZoom` — MSW handlers

**Priority handlers to cover first (ties directly to the leaks just fixed):**

| Handler | Cases to cover |
|---|---|
| `app/api/portal/mentionable-users/route.ts` | returns staff + active-client members; cross-tenant rejection |
| `app/api/portal/cards/[id]/files/[fileId]/route.ts` | PATCH authz, cross-card rejection, cross-tenant rejection, DELETE uploader-only |
| `app/api/portal/cards/[id]/comments/[commentId]/route.ts` | DELETE card-scoping, author-only for non-staff |
| `app/api/portal/automations/logs/route.ts` | ruleId param doesn't leak cross-tenant |
| `app/api/portal/crm/deals/[id]/artifacts/route.ts` | POST rejects cross-tenant artifactId |
| `app/api/portal/crm/custom-fields/values/route.ts` | GET + PUT reject cross-tenant entityId |
| `app/api/portal/websites/[siteId]/branding-profile/route.ts` | PATCH rejects cross-tenant profileId |
| `app/api/portal/cards/[id]/route.ts` | PATCH assignedTo → junction replace with correct add/remove events |
| `app/api/portal/projects/[id]/webhooks/route.ts` | create, list-secret-redaction, patch toggle, delete, SSRF rejection |
| `app/api/portal/my-tasks/route.ts` | assigned-to-me filter, openOnly param, staff bypass |

**Sizing:** ~150 integration specs at full coverage, each < 500 ms.

### Layer 3 — E2E (Playwright)

**What to put here:** multi-page flows, real cookies / sessions / CSRF, things that only break when browser JS meets server response (visual editor, drag across real iframes, upload flows, storefront checkout).

**Rule:** browser-driven. Most specs hit an already-running Next dev/start. Third-party APIs are stubbed at the network layer (MSW) or use sandbox credentials.

**Tag strategy** (runner selects by tag):

| Tag | Purpose | ~Count |
|---|---|---|
| `@critical` | Blocks commits on failure — smoke of each major flow | 15 |
| `@auth` | Sign-in, password, invite, session expiry | 3 |
| `@tenancy` | Cross-tenant isolation — one master spec, parameterised per resource | 1 |
| `@authz` | Role × resource × action matrix | 1 |
| `@api` | HTTP-only, no browser page — fastest path to coverage | ~40 |
| `@ui` | Browser-driven flows | ~20 |
| `@flaky` | Known-flaky; retries=3, doesn't block | — |
| `@slow` | > 30 s individual test; excluded from fast mode | — |
| feature tags | `@pm @crm @cms @email @booking @pitch @billing @hosting @automations @approvals @mcp @ecommerce` | — |

**Coverage for browser code:** Playwright's `page.coverage.startJSCoverage()` / `stopJSCoverage()` collects V8 coverage for client-side JS. Wrapper fixture auto-starts/stops per test and writes one JSON per test to `coverage/.v8-client/`. Merges with server coverage in final report.

**Coverage for server code:** run Next under `c8` with `NODE_V8_COVERAGE` — records all server-side executions.

---

## 4. Gap analysis — specs to add

(Subset listed; priority-ordered. "Layer" column picks the cheapest layer that meaningfully tests the thing.)

| Area | Status | Layer | Priority |
|---|---|---|---|
| Cross-tenant isolation (all leak classes from 2026-04-21 audit) | none | Integration API | **P0** |
| Auth flows: forgot / reset / invite / session expiry / CSRF | minimal | E2E `@auth` | **P0** |
| Role × resource × action matrix | scattered | Integration API | **P1** |
| SSRF guard (unit) | partial | Unit | **P0** |
| Webhook delivery end-to-end: signed POST, retries, failure counter | partial | E2E `@api` + Integration | **P0** |
| Automations rule execution: template interpolation, retries | partial | Integration API | P1 |
| CRM proposals/contracts: send, accept, reject, expiry | partial | Integration API | P1 |
| Booking Google/Zoom OAuth callback | partial | Integration API | P1 |
| Email send + bounce + unsubscribe token | partial | Integration API | P1 |
| Stripe webhooks: subscription lifecycle, dunning | partial | Integration API | **P0** |
| Storefront: cart + checkout + order | none | E2E | P1 |
| v1 public API: contract + rate-limit | none | Integration API | P1 |
| Pitch-deck slide generate / version restore | partial | Integration API | P2 |
| Visual editor: block lifecycle, drag, style persistence | partial | Integration UI + E2E | P2 |
| CMS posts: revisions, scheduled publish, permalinks | partial | Integration API | P2 |
| Cron jobs other than MCP-pendings | none | Integration API | P2 |
| File upload: size, MIME, S3 failure | partial | Integration API | P2 |

### P0 specs to write first

1. `tests/integration/api/security/tenancy.test.ts` — every leak class × two tenants × assert rejection.
2. `tests/integration/api/security/csrf.test.ts` — all mutating endpoints reject missing/bad origin / CSRF.
3. `tests/e2e/auth/auth-flows.ui.spec.ts` — forgot / reset / invite / session-expiry.
4. `tests/unit/ssrf-guard.test.ts` — table-driven (IPv4 private ranges, IPv6 `[::1]` with brackets, DNS-rebinding, userinfo, non-HTTP schemes).
5. `tests/integration/api/webhooks-delivery.test.ts` — HMAC, retry/backoff, failure threshold.
6. `tests/integration/api/stripe-webhooks.test.ts` — subscription lifecycle events, signature verification.

---

## 5. Coverage instrumentation

Two collectors, one merged report.

### Vitest (unit + integration)

Add `@vitest/coverage-v8` (already installed). Extend `vitest.config.ts`:

```ts
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./tests/setup.ts'],
  projects: [
    {
      name: 'unit',
      include: ['tests/unit/**/*.test.{ts,tsx}'],
    },
    {
      name: 'integration-ui',
      include: ['tests/integration/**/*.test.tsx'],
    },
    {
      name: 'integration-api',
      include: ['tests/integration/api/**/*.test.ts'],
      environment: 'node',
      setupFiles: ['./tests/setup-api.ts'],       // starts MSW + test DB
      pool: 'forks',                               // isolate process per file for DB safety
      poolOptions: { forks: { singleFork: false } },
    },
  ],
  coverage: {
    provider: 'v8',
    reporter: ['html', 'lcov', 'text-summary', 'json'],
    reportsDirectory: 'coverage/vitest',
    include: ['app/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    exclude: [
      '**/*.d.ts', '**/*.test.*', '**/*.spec.*',
      'components/booking-app/**', 'scripts/**', 'drizzle/**',
      'app/**/layout.tsx', 'app/**/loading.tsx', 'app/**/not-found.tsx', 'app/**/error.tsx',
    ],
    all: true,
    thresholds: { lines: 70, functions: 65, branches: 60 },
  },
}
```

### Playwright E2E (server + client)

**Server-side:** wrap `next start` with `c8`. V8 writes to `NODE_V8_COVERAGE` directory. On shutdown, `c8 report` remaps via build sourcemaps.

**Client-side:** a Playwright fixture auto-wraps every test:

```ts
// tests/e2e/setup/coverage-fixture.ts
import { test as base } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const enabled = process.env.COLLECT_CLIENT_COVERAGE === '1';
    if (enabled) await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await use(page);
    if (enabled) {
      const entries = await page.coverage.stopJSCoverage();
      const safe = testInfo.title.replace(/[^\w.-]+/g, '_').slice(0, 80);
      fs.writeFileSync(
        path.join('coverage', '.v8-client', `${process.pid}-${Date.now()}-${safe}.json`),
        JSON.stringify({ result: entries }),
      );
    }
  },
});
```

Specs import `{ test, expect }` from this fixture instead of `@playwright/test`. Existing spec migration is search-and-replace — should be safe.

### Merging all layers

```bash
# Vitest writes coverage/vitest/coverage-final.json
# Playwright server writes coverage/.v8-server/*.json (NODE_V8_COVERAGE format)
# Playwright client writes coverage/.v8-client/*.json (startJSCoverage format)

npx c8 report \
  --reporter=html --reporter=lcov --reporter=text-summary \
  --temp-directory coverage/.v8-server \
  --report-dir coverage/server

# Client coverage is a different V8 format — convert first
npx tsx scripts/convert-client-coverage.ts   # reads .v8-client/, writes coverage/.v8-merged/

# Merge all into one report
npx c8 report \
  --temp-directory coverage/.v8-merged \
  --report-dir coverage/combined
```

(`scripts/convert-client-coverage.ts` is a small translator: Playwright's `CDPCoverage` → c8's expected V8 `ProfileCoverage`. ~60 lines.)

---

## 6. Fixtures / helpers to add

### `tests/setup-api.ts` (NEW — for integration API layer)

```ts
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { applyTestSchema, resetTestData } from './helpers/test-db';
import { stripeHandlers, resendHandlers, googleHandlers, zoomHandlers } from './helpers/api-mocks';

export const server = setupServer(...stripeHandlers, ...resendHandlers, ...googleHandlers, ...zoomHandlers);

beforeAll(async () => {
  await applyTestSchema();
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(async () => { await resetTestData(); });
afterAll(async () => { server.close(); });
```

### `tests/helpers/call-handler.ts` (NEW)

Thin wrapper to invoke a route handler with a forged session + NextRequest. Avoids ever spinning up an HTTP server for integration API tests.

```ts
export async function callHandler<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  modulePath: string,          // e.g. '@/app/api/portal/cards/[id]/route'
  { session, body, query, params, cookies }: CallOpts = {},
): Promise<{ status: number; data: T | null; headers: Headers }> { ... }
```

### `tests/helpers/session.ts` (NEW)

```ts
export function sessionFor(user: { id: number; role?: string; email?: string }): Session;
export async function sessionForNewClientUser(): Promise<{ session: Session; client: Client; user: User; cleanup: () => Promise<void> }>;
export async function sessionForStaff(): Promise<{ session: Session; user: User; cleanup: () => Promise<void> }>;
export async function twoTenants(): Promise<{ A: TenantCtx; B: TenantCtx; cleanup: () => Promise<void> }>;
```

### E2E additions to `tests/e2e/setup/helpers.ts`

```ts
export async function startWebhookSink(): Promise<{ url: string; deliveries: Delivery[]; close(): Promise<void> }>;
export async function asRole(role: 'owner' | 'admin' | 'member' | 'viewer'): Promise<ApiClient>;
export async function purgeTestData(prefix: string): Promise<void>;
```

---

## 7. Runner script

`scripts/test.sh` — the single entry point.

```bash
#!/usr/bin/env bash
set -euo pipefail

LAYER="all"          # unit | integration | e2e | all
MODE="dev"           # dev | prod   (prod = next build + start; CI authority)
TAG=""               # playwright grep
SHARD=""
RESET_DB=0
NO_COVERAGE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --layer=*)      LAYER="${1#*=}";;
    --mode=*)       MODE="${1#*=}";;
    --tag=*)        TAG="${1#*=}";;
    --shard=*)      SHARD="${1#*=}";;
    --reset-db)     RESET_DB=1;;
    --no-coverage)  NO_COVERAGE=1;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac; shift
done

rm -rf coverage/
mkdir -p coverage/.v8-server coverage/.v8-client coverage/vitest

# ── DB prep ─────────────────────────────────────────────────────────────
if [[ "$RESET_DB" == "1" ]]; then
  npx tsx scripts/reset-e2e-db.ts
fi
npx tsx scripts/seed-admin-e2e.ts

fail() { echo "FAILED: $*"; exit 1; }

# ── Layer 1: Unit ───────────────────────────────────────────────────────
if [[ "$LAYER" == "all" || "$LAYER" == "unit" ]]; then
  if [[ "$NO_COVERAGE" == "1" ]]; then
    npx vitest run --project=unit || fail "unit"
  else
    npx vitest run --project=unit --coverage --coverage.reportsDirectory=coverage/vitest/unit
  fi
fi

# ── Layer 2: Integration (UI + API) ─────────────────────────────────────
if [[ "$LAYER" == "all" || "$LAYER" == "integration" ]]; then
  if [[ "$NO_COVERAGE" == "1" ]]; then
    npx vitest run --project=integration-ui --project=integration-api || fail "integration"
  else
    npx vitest run --project=integration-ui --project=integration-api \
      --coverage --coverage.reportsDirectory=coverage/vitest/integration
  fi
fi

# ── Layer 3: E2E (Playwright) ───────────────────────────────────────────
if [[ "$LAYER" == "all" || "$LAYER" == "e2e" ]]; then
  # Boot server under c8
  export NODE_V8_COVERAGE="$(pwd)/coverage/.v8-server"
  export COLLECT_CLIENT_COVERAGE="$([[ "$NO_COVERAGE" == "1" ]] && echo 0 || echo 1)"
  if [[ "$MODE" == "prod" ]]; then
    npm run build
    SERVER_CMD=(npm run start)
  else
    SERVER_CMD=(npm run dev)
  fi

  if [[ "$NO_COVERAGE" == "1" ]]; then
    "${SERVER_CMD[@]}" &
  else
    npx c8 --no-clean --reporter=none -- "${SERVER_CMD[@]}" &
  fi
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null || true; wait $SERVER_PID 2>/dev/null || true' EXIT

  npx wait-on http://localhost:3000/api/health -t 120000

  PW_ARGS=()
  [[ -n "$TAG"   ]] && PW_ARGS+=(--grep "$TAG")
  [[ -n "$SHARD" ]] && PW_ARGS+=(--shard="$SHARD")
  npx playwright test "${PW_ARGS[@]}" --reporter=list,html || E2E_EXIT=$?

  kill -SIGTERM $SERVER_PID 2>/dev/null || true
  wait $SERVER_PID 2>/dev/null || true
fi

# ── Merge + report ──────────────────────────────────────────────────────
if [[ "$NO_COVERAGE" != "1" ]]; then
  npx tsx scripts/convert-client-coverage.ts

  # Separate reports per layer
  npx c8 report --temp-directory coverage/.v8-server --reporter=html --reporter=lcov --report-dir coverage/server
  # Combined report from all V8 sources (Vitest json is a different schema — we surface it alongside)
  npx c8 report --temp-directory coverage/.v8-merged --reporter=html --reporter=lcov --reporter=text-summary --report-dir coverage/combined

  echo ""
  echo "Reports:"
  echo "  - Vitest (unit + integration): coverage/vitest/**/index.html"
  echo "  - E2E server:                  coverage/server/index.html"
  echo "  - Combined (server+client):    coverage/combined/index.html"
fi

if [[ "${CI:-}" == "1" && "$NO_COVERAGE" != "1" ]]; then
  npx c8 check-coverage --lines 80 --functions 70 --branches 65 \
    --temp-directory coverage/.v8-merged
fi

exit "${E2E_EXIT:-0}"
```

**package.json scripts:**

```json
{
  "test":            "scripts/test.sh --layer=unit --no-coverage",
  "test:integration":"scripts/test.sh --layer=integration --no-coverage",
  "test:e2e":        "scripts/test.sh --layer=e2e --no-coverage",
  "test:all":        "scripts/test.sh",
  "test:coverage":   "scripts/test.sh --mode=prod",
  "test:critical":   "scripts/test.sh --layer=e2e --tag=@critical",
  "test:tenancy":    "scripts/test.sh --layer=integration --tag=tenancy"
}
```

Dependencies to add: `c8`, `wait-on`, `msw`. Vitest coverage already installed.

---

## 8. Health endpoint

Add `app/api/health/route.ts` returning `{ ok, db: <ping>, uptime }`. Used by `wait-on` to eliminate boot races.

---

## 9. Test DB strategy

- **Unit:** no DB.
- **Integration UI:** no DB (mocked network).
- **Integration API:** dedicated Postgres schema `test_e2e_<worker>`, created in `setup-api.ts`, truncated (not dropped) in `beforeEach`. Fast: ~50 ms reset via `TRUNCATE ... CASCADE` of the known tables. Uses `DATABASE_URL_TEST` if set, else forks the main URL with schema suffix.
- **E2E:** shared Postgres (same as dev) with test-prefix stamping + `runCleanups`. Weekly CI cron runs `purgeTestData('E2E-')` to sweep orphans.

Per-worker schemas only if flake > 2 % persists.

---

## 10. CI integration (GitHub Actions)

Three jobs, parallelised:

```yaml
jobs:
  unit-and-integration:
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: scripts/test.sh --layer=unit
      - run: scripts/test.sh --layer=integration --reset-db
      - uses: actions/upload-artifact@v4
        with: { name: vitest-coverage, path: coverage/vitest }

  e2e:
    strategy:
      matrix: { shard: [1, 2, 3, 4] }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: scripts/test.sh --layer=e2e --mode=prod --shard=${{ matrix.shard }}/4 --reset-db
        env: { CI: 1 }
      - uses: actions/upload-artifact@v4
        with: { name: e2e-cov-${{ matrix.shard }}, path: coverage/.v8-server }
      - uses: actions/upload-artifact@v4
        with: { name: client-cov-${{ matrix.shard }}, path: coverage/.v8-client }

  combined-coverage:
    needs: [unit-and-integration, e2e]
    steps:
      - uses: actions/download-artifact@v4
        with: { pattern: '*-cov-*', merge-multiple: true, path: coverage/ }
      - run: npx tsx scripts/convert-client-coverage.ts
      - run: npx c8 report --temp-directory coverage/.v8-merged --reporter=lcov
      - uses: actions/upload-artifact@v4
        with: { name: coverage-combined, path: coverage }
      - run: npx c8 check-coverage --lines 80 --branches 65 --temp-directory coverage/.v8-merged
```

Target CI wall-clock: 15 min (unit+integration in parallel with 4 E2E shards; slowest wins).

---

## 11. Rollout phases

**Phase 1 — Instrumentation (2 days)**
- Add `c8`, `wait-on`, `msw`.
- Add health endpoint.
- Extend `vitest.config.ts` with projects + coverage config.
- Write `scripts/test.sh` + `scripts/convert-client-coverage.ts` + `scripts/reset-e2e-db.ts`.
- Baseline current coverage (commit the numbers).

**Phase 2 — P0 gaps (3-4 days)**
- Unit: `ssrf-guard.test.ts`, `pm-webhooks.test.ts` (HMAC + backoff), `portal-client.test.ts` (role resolution).
- Integration API: `tenancy.test.ts` (parameterised over leak classes), `csrf.test.ts`, `webhooks-delivery.test.ts`, `stripe-webhooks.test.ts`.
- E2E: `auth-flows.ui.spec.ts`.

**Phase 3 — P1 coverage (3-4 days)**
- Integration API: authz matrix, CRM proposals/contracts, booking OAuth callbacks, automations rule execution, email unsubscribe flow, v1 public API contract + rate-limit.
- E2E: storefront checkout.

**Phase 4 — P2 + raise thresholds (ongoing)**
- Fill P2 specs (pitch-deck generate, CMS revisions, cron jobs, file upload edges).
- Once combined coverage ≥ 80 % lines consistently, raise `check-coverage` thresholds to 85 / 75.

---

## 12. Success metrics — what we report weekly

- `coverage/combined/index.html` numbers (lines / functions / branches).
- Per-layer wall-clock (trend).
- Pass-on-first-try rate across CI runs.
- Count of specs tagged `@tenancy` + `@authz` (should only grow).
- Open `@flaky`-tagged items (should trend to zero).

---

## 13. Known risks

| Risk | Mitigation |
|---|---|
| c8 can't remap Next dev-mode sourcemaps cleanly | `test:coverage` uses `--mode=prod`; dev mode for local iteration only |
| Playwright webServer + c8 double-fork loses coverage | Runner explicitly boots server under c8; `playwright.config.ts.webServer.reuseExistingServer=true` |
| Integration API test DB contention across workers | Per-worker schema name; truncate not drop in `beforeEach` |
| MSW handler drift vs real APIs (Stripe, Resend) | Review handler fidelity on every SDK upgrade; snapshot real API responses into fixtures once, check in alongside handler. No live creds in any test. |
| V8 client coverage gets huge (one file per test) | Aggregate in a single Node process; delete raw inputs after merge |
| `NODE_V8_COVERAGE` leaks into unrelated `next` invocations | Scope env var to the test runner subshell |
