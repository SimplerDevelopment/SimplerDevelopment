# Plugin callback integration tests

Tagged `@tenancy` so they run under `bun test:tenancy` (alias for
`scripts/test.sh --layer=integration --tag=tenancy`). The spec drives the real
`app/api/plugin-callback/[appId]/[...path]/route.ts` dispatcher against a
populated per-worker Postgres and asserts that:

- JWT verification (expiry, signature, kid lookup) holds
- The `Origin` check rejects cross-origin attackers
- `jti` UNIQUE constraint catches replays (409)
- The `allowedClientIds` allowlist on `registered_apps` is the source of truth
  for tenancy — JWT alone never grants access
- A disabled `registered_apps.status` fails closed
- `/briefs/:id` GET, `/drafts/:id` PATCH, and `/scripts/run` POST all enforce
  per-tenant IDOR + scope gating

## Running

```bash
# From the repo root, with a Postgres available at $DATABASE_URL_TEST
# (or $DATABASE_URL if DATABASE_URL_TEST is unset):
bun test:tenancy
```

That runs the integration projects (`integration-ui` + `integration-api`)
filtered to test names matching `@tenancy`, so this file's describe block
participates alongside `tests/integration/api/**/*@tenancy*` peers.

## Environment

| Var | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL_TEST` or `DATABASE_URL` | yes | Postgres connection string. `tests/helpers/test-bootstrap.ts` swaps the DB path to a per-worker name and clones it from `simplerdev_test_template` (built once by `tests/helpers/global-setup.ts`). |
| `PORTAL_KMS_KEY` | no | If set (base64 of 32 bytes), used to encrypt the signing-key secret. Otherwise the dev fallback in `lib/plugins/kms.ts` kicks in — fine for tests, fatal in production. |
| `PLUGINS_CALLBACK_ORIGIN_BYPASS` | no | Bypasses the `Origin` header check in `lib/plugins/callback-auth.ts`. Tests deliberately leave this UNSET so case 6 (wrong-origin) exercises the real check. |

## Fixture shape

`setupPluginFixture()` builds, per test:

- Two tenants (`clientA`, `clientB`) via `sessionForNewClientUser`
- One `services` row (`category='plugins'`) + a `client_services` grant ONLY
  for clientA
- One `registered_apps` row pinned to `visibility='allowlist'` with a
  parametrisable allowlist (`A`, `B`, `both`, or `none`)
- One active `registered_app_signing_keys` row, secret encrypted via
  `lib/plugins/kms.ts::encryptSecret` so the real verify path is exercised
- Two briefs + two drafts per tenant (each backed by a `registered_app_runs`
  row, since the result tables FK to runs)

Tokens are minted with `signPluginJwtTestOnly` from `lib/plugins/jwt.ts` so
each test can control claims (clientId, scopes, exp) without seeding key
rotations.
