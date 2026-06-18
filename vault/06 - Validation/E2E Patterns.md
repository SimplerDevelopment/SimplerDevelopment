---
type: playbook
domain: validation
status: active
date: 2026-06-09
sources:
  - playwright.config.ts
  - tests/e2e/setup/fixtures.ts
  - tests/e2e/setup/helpers.ts
  - tests/e2e/setup/api-client.ts
  - tests/e2e/setup/coverage-fixture.ts
  - tests/e2e/portal-smoke-all-routes.spec.ts
  - tests/CLAUDE.md
  - tests/CI-GATES.md
---

# E2E Patterns

**Question to answer in 30 seconds:** where do specs live, how do I auth, how do I run one, what breaks.

---

## Quick checklist

- [ ] Import `{ test, expect }` from `./setup/fixtures` — not directly from `@playwright/test`
- [ ] Register cleanups with `runCleanups` from `./setup/helpers` in `afterAll`
- [ ] Prefix created data with `E2E-<timestamp>` for idempotent purge
- [ ] Tag specs appropriately (see tag table below)
- [ ] Use `test.skip(...)` when required env / seed data is absent — never hard-fail on missing setup

---

## Directory layout

```
tests/e2e/
  setup/
    fixtures.ts          # extended test object — clientApi, adminApi, unauthApi, login helpers
    api-client.ts        # HTTP-only ApiClient (no browser) with NextAuth session
    helpers.ts           # runCleanups, createTestTeamMember, createTestApiKey, etc.
    coverage-fixture.ts  # optional JS coverage wrapper (COLLECT_CLIENT_COVERAGE=1)
  *.spec.ts              # flat list — 65+ specs
```

Specs are flat in `tests/e2e/` — no subdirectory nesting.

---

## Playwright config (`playwright.config.ts`)

Chromium only, `baseURL` defaults to `http://localhost:3000` (override with `BASE_URL`). 60 s per-test timeout; retries: 1 local / 2 CI; workers: 4 local / 1 CI. `webServer` runs `npm run dev` with `reuseExistingServer: true`; trace on first retry.

---

## Auth / fixtures

All fixtures are defined in `tests/e2e/setup/fixtures.ts`. Import from there:

```ts
import { test, expect } from './setup/fixtures';
```

| Fixture | What it gives you |
|---|---|
| `clientApi` | Authenticated `ApiClient` as `client@example.com` |
| `adminApi` | Authenticated `ApiClient` as `admin@example.com` |
| `unauthApi` | Unauthenticated `ApiClient` |
| `loginAsPostcaptain(page)` | Logs `page` in as plugin client 103 — requires `POSTCAPTAIN_USER_EMAIL` / `POSTCAPTAIN_USER_PASSWORD` env vars; skip spec if absent |
| `loginAsOtherClient(page)` | Logs `page` in as `client@example.com` |

Browser-level login: fetch CSRF token from `/api/auth/csrf`, POST to `/api/auth/callback/credentials` — see `loginPage()` in `tests/e2e/setup/fixtures.ts`. Seed credentials: `admin@example.com / admin123`, `client@example.com / client123`.

---

## Idempotency and cleanup

- `runCleanups(cleanups)` from `tests/e2e/setup/helpers.ts` — call in `afterAll`, runs functions in reverse registration order, swallows errors.
- Push a `cleanup` function after every resource you create: `cleanups.push(async () => api.delete(...))`
- Prefix created resource names / emails with `E2E-${Date.now()}` so orphan sweeper (`purgeTestData('E2E-')`) can reclaim them.
- Weekly CI cron sweeps orphaned `E2E-` records from the shared dev DB.

---

## Tag strategy

| Tag | Purpose | Gate |
|---|---|---|
| `@critical` | Smoke of every major flow; blocks push via `bun test:critical` | `scripts/ci-local.sh --full` |
| `@tenancy` | Cross-tenant isolation; primarily integration layer | `bun test:tenancy` |
| `@auth` | Sign-in, invite, session expiry | manual |
| `@flaky` | Known-flaky; retries=3, NOT in `@critical` | quarantine — see flake protocol |
| `@slow` | > 30 s individual test; excluded from fast runs | manual only |
| feature tags | `@pm @crm @cms @email @billing @brain` etc. | manual / by area |

`@critical` is the QA gate before declaring work done. **Do not add `@critical` until a spec has run green 20+ consecutive times locally.**

---

## Running specs

```bash
# All E2E
scripts/test.sh --layer=e2e --no-coverage

# @critical subset only
bun test:critical
# equivalent: scripts/test.sh --layer=e2e --tag=@critical --no-coverage

# One spec file
npx playwright test tests/e2e/portal-smoke-all-routes.spec.ts

# Interactive UI mode
bun run test:e2e:ui
# equivalent: playwright test --ui

# Against a remote / staging BASE_URL
BASE_URL=https://staging.example.com bun test:critical
```

---

## Writing new E2E tests

Use the `/e2e-writer` skill — it generates `.spec.ts` files with correct fixtures, cleanup, and idempotent patterns. Do not hand-roll from scratch.

Running existing E2E: `/e2e-runner` skill.

---

## Flake sources and quarantine

Common causes: navigation races (use `waitForURL`/`waitForSelector` not `waitForTimeout`), shared DB state (prefix records + `runCleanups`), server cold start (`scripts/test.sh` already uses `wait-on`; do the same when starting Playwright manually), auth cookie not shared (reuse the same `page` in serial suites).

Quarantine protocol: tag `@flaky` immediately, remove `@critical`, file a tracked issue, fix on a separate branch, re-promote only after 20 consecutive green local runs. There is no acceptable "retry until green" on the critical path.
