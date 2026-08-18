---
type: playbook
domain: validation
status: active
date: 2026-06-09
sources:
  - tests/CI-GATES.md
  - tests/TESTING_PLAN.md
  - tests/integration/api/portal/email/render-cache-tenancy.test.ts
  - tests/helpers/session.ts (planned)
  - tests/helpers/test-db.ts (planned)
  - .githooks/pre-push
  - scripts/ci-local.sh
---

# Tenancy Regression

**Question to answer in 30 seconds:** what is a tenancy leak, when must I run the gate, how do I write a new test.

---

## Mandatory checklist

- [ ] Did this change touch `lib/db/`, `app/api/`, or `lib/active-client.ts`? — run `bun test:tenancy`
- [ ] Did you add a new table? — write a `@tenancy`-tagged spec for it
- [ ] Did the gate produce a failure? — do NOT retry; investigate the query

---

## What a tenancy leak is

Every data row is scoped to a `clientId` (portal) or `siteId` (public sites). A tenancy leak is any code path that returns or mutates rows belonging to a different tenant than the authenticated user's session.

Classes of leak (from the 2026-04-21 audit):

| Class | Example |
|---|---|
| Missing WHERE clause | `SELECT * FROM cards` instead of `WHERE client_id = $clientId` |
| Foreign-key trust without re-check | Accept `campaignId` from body, query rows by that ID without verifying `campaign.client_id = session.clientId` |
| Hash/key collision across tenants | Two tenants sharing the same cache key because tenant dimension was omitted |
| Junction table add/remove without scoping | Assigning a user to a card from another tenant |

There is **no acceptable "flaky" explanation** for a tenancy failure. A flaky tenancy test is a broken tenancy test.

---

## The gate

```bash
# Run the tenancy suite (integration layer, @tenancy tag)
bun test:tenancy
# equivalent: scripts/test.sh --layer=integration --tag=tenancy --no-coverage

# With a local DB spun up on the fly
bun test:integration:local
# equivalent: ./scripts/start-local-db.sh && DATABASE_URL=... scripts/test.sh --layer=integration --no-coverage
```

The gate is **automatically added** to `pre-push` whenever `lib/db/`, `app/api/`, or `lib/active-client.ts` appear in the push diff. No manual flag needed in that case.

If `DATABASE_URL_TEST` and `DATABASE_URL` are both unset, the gate **soft-skips** with a loud warning. This is intentional — a dev without a local DB must not be silently blocked. The warning is always visible on stdout, never silent.

---

## Database requirements

- Integration API tests require a real Postgres instance.
- `DATABASE_URL_TEST` is preferred; falls back to `DATABASE_URL`.
- Each vitest worker gets its own per-worker database cloned from the `simplerdev_test_template` schema (built once in `globalSetup` via `tests/helpers/global-setup.ts`). Workers are capped at 2 concurrent (`maxWorkers: 2` in `vitest.config.ts`).
- `beforeEach` truncates tables; `afterAll` drops the worker DB.
- Orphan cleanup runs in `globalSetup` on next run; manual sweep: `scripts/cleanup-test-schemas.ts`.

---

## How tenancy tests are structured

Pattern from `tests/integration/api/portal/email/render-cache-tenancy.test.ts`:

```ts
describe('resource tenancy @tenancy @feature', () => {
  it('Tenant A rows are scoped — B never sees them', async () => {
    const A = await sessionForNewClientUser('prefix-a');
    const B = await sessionForNewClientUser('prefix-b');
    // seed data scoped to A and B separately
    // call handler as A's session
    // assert B's query returns nothing
    // assert no rows resolved to B's client via FK
  });

  it('cross-tenant ID rejected — A cannot act on B resource', async () => {
    // call handler as A with B's resource ID
    // expect 404 (or 403)
    // assert no mutation occurred in DB
  });
});
```

Key helpers (from `tests/helpers/`):

| Helper | What it does |
|---|---|
| `sessionForNewClientUser(prefix)` | Creates a fresh client + user pair; returns `{ session, client, user, cleanup }` |
| `callHandler(route, method, { body })` | Invokes a Next route handler function directly with a forged session |
| `getTestSql()` | Returns a `postgres` client pointed at the worker's isolated test schema |
| `TEST_SCHEMA` | The current worker's schema name constant |

---

## Writing a tenancy test for a new table or route

1. Create `tests/integration/api/<feature>/tenancy.test.ts` (or add a describe block to an existing spec in that feature dir).
2. Describe block must contain `@tenancy` in its name: `describe('... @tenancy ...', () => {...})`.
3. Three cases minimum:
   - **Isolation:** A's rows not visible via B's session.
   - **FK trust:** A cannot pass B's resource ID in the request body to gain access.
   - **Write safety:** A's mutation does not affect B's rows.
4. Use `sessionForNewClientUser` for fresh, non-colliding tenants per test (avoids shared-state flake).
5. Assert at the DB level with `getTestSql()` — do not rely solely on the HTTP response code for isolation checks.

---

## Existing tenancy specs

Located in `tests/integration/api/`. Files with `@tenancy` tag confirmed present as of 2026-06-09:

- `tests/integration/api/settings/team.test.ts`
- `tests/integration/api/settings/profile.test.ts`
- `tests/integration/api/settings/integrations.test.ts`
- `tests/integration/api/settings/billing.test.ts`
- `tests/integration/api/branding/defaults.test.ts`
- `tests/integration/api/storefront.test.ts`
- `tests/integration/api/portal/integrations/api-keys/crud.test.ts`
- `tests/integration/api/portal/email/render-cache-tenancy.test.ts`

Count of `@tenancy`-tagged specs should only grow over time — track it in the weekly validation report.
