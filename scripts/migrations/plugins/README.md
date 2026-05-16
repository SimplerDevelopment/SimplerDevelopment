# Plugin registry seeds

One-time / idempotent seed scripts for the `/portal/apps/**` plugin registry.

## `seed-postcaptain-tools.ts`

Seeds the **`postcaptain-tools`** plugin: services row, client_services grant for
client 103 (Post Captain Consulting), `registered_apps` row, and an initial
HMAC signing key.

### When to run

- Once per environment (staging + production), after Phase 1 schema has been
  applied to the target database.
- Re-running is safe (idempotent) — it upserts every row and skips minting a
  new signing key when one is already `status='active'` on the app.

### Required env vars

| Var | Why |
| --- | --- |
| `DATABASE_URL` | Standard Postgres connection (read from `.env`) |
| `PORTAL_KMS_KEY` | base64 of 32 random bytes — wraps the signing-key secret via AES-256-GCM. In `NODE_ENV !== 'production'` the script falls back to a dev key with a warning, but **production runs MUST set this**. Generate with `openssl rand -base64 32`. |

### How to run

```bash
bunx tsx scripts/migrations/plugins/seed-postcaptain-tools.ts
```

### Output

On a fresh run the script prints:

1. A line per upsert (services, client_services, registered_apps,
   registered_app_signing_keys).
2. **One-time-only**: the plaintext signing key, framed by a "WRITE THIS DOWN"
   banner. The plaintext is never logged to a file, never re-printed, and
   cannot be recovered from the database (only the AES-GCM ciphertext is
   stored).
3. A final JSON summary line — `{ serviceId, appId, kid, signingKeyId }`.

On an idempotent re-run (the active signing key already exists) the script
skips minting a new secret and prints the existing `kid` instead.

### Post-run manual steps

1. **Copy the printed `PORTAL_JWT_SECRET=…` line** into the
   `postcaptain-tools` Vercel project's env vars. Without this, the plugin
   cannot verify the JWT the portal proxies to it and will fail closed.
2. Once the plugin host is responding at the configured `hostUrl`, flip the
   `registered_apps.status` from `'draft'` to `'active'` (manual SQL for v1;
   an admin UI is reserved for v2):
   ```sql
   UPDATE registered_apps SET status = 'active' WHERE slug = 'postcaptain-tools';
   ```
3. Confirm the postcaptain client can see "Apps > Postcaptain Tools" in the
   portal sidebar (requires Worker 3C nav integration).

### Rotation

This seed script does **not** rotate keys. When a rotation is needed:

1. Mark the current key `status='retiring'`.
2. Mint a new key with `status='active'`.
3. After 60 seconds (JWT TTL) mark the retired key `status='revoked'`.

A dedicated rotation script is reserved for a follow-up (out of scope for
this seed).

## Operator runbook (full rollout for postcaptain-tools)

### 1. Apply the schema migration

The Drizzle tracker is out of sync in production (see project memory). Apply
`drizzle/0114_plugin_registry.sql` by hand via psql against the target DB:

```bash
psql "$DATABASE_URL" -f drizzle/0114_plugin_registry.sql
```

Idempotent (CREATE TABLE IF NOT EXISTS + EXCEPTION-handled FK adds).

### 2. Ensure `PORTAL_KMS_KEY` is set in the portal's environment

Generate once and store in Vercel project env vars:

```bash
openssl rand -base64 32
```

Set in BOTH preview and production Vercel envs. (Loss of this key revokes
ALL plugin signing keys it has encrypted — there is no recovery.)

### 3. Run the seed migration

```bash
bun run scripts/migrations/plugins/seed-postcaptain-tools.ts
```

This will:
- Insert the `plugin-postcaptain-tools` services row
- Grant it to client 103 (Post Captain Consulting)
- Insert the `postcaptain-tools` registered_apps row with status=`'draft'`
- Mint a 32-byte HMAC signing key, AES-GCM-encrypt it via `PORTAL_KMS_KEY`,
  insert into `registered_app_signing_keys`, and PRINT THE PLAINTEXT SECRET
  ONCE — copy it into the postcaptain-tools deploy's `PORTAL_JWT_SECRET` env var.

### 4. Deploy the postcaptain-tools plugin app

The plugin repo lives at `/Users/dancoyle/simplerdevelopment/postcaptain-tools/`
(separate from this repo). Deploy it to its own Vercel project. Required env:

```
PORTAL_JWT_SECRET=<the plaintext printed by step 3>
PORTAL_BASE_URL=https://simplerdevelopment.com
NEXT_PUBLIC_PLUGIN_ORIGIN=https://<plugin-host>
PLUGIN_DEV_BYPASS=0
```

Set the production domain to e.g. `postcaptain-tools.simplerdevelopment.com`.

### 5. Flip the app to active

After confirming the plugin host responds at `/sd-manifest.json`, flip the
app's status in the portal DB:

```sql
UPDATE registered_apps
   SET host_url = 'https://postcaptain-tools.simplerdevelopment.com',
       manifest_url = 'https://postcaptain-tools.simplerdevelopment.com/sd-manifest.json',
       status = 'active'
 WHERE slug = 'postcaptain-tools';
```

The plugin now appears in the postcaptain client's sidebar.

### 6. Sanity check

Log in as a postcaptain user. The sidebar should show "Apps → Postcaptain Tools"
with sub-items pulled from the plugin's manifest. Click in — the dashboard
loads via reverse-proxy. Trigger a test research brief; watch the run row in
`/portal/apps/postcaptain-tools/runs` reach `succeeded`.

### 7. Key rotation (optional, for verifying the flow works)

Generate a new signing key, mark the previous one `retiring`:

```sql
-- (run the rotation script or do it by hand; see kms.ts)
```

Update the postcaptain-tools env with the new secret. Old tokens minted before
rotation continue to verify against the retiring key until they expire (60s).
After the retiring key has been quiet for >60s, mark it `revoked`.

## Troubleshooting

- **"Plugin temporarily unavailable"** in the proxied page → check
  `registered_app_callbacks_audit` for recent rows + statuses. 401 in
  status column = signature mismatch (`PORTAL_JWT_SECRET` drift).
- **"unknown-kid"** in JWT verify → the plugin's `PORTAL_JWT_SECRET` is from
  a different signing-key row than the portal expects. Re-run rotation OR
  re-check the kid in `registered_app_signing_keys WHERE status='active'`.
- **Replay 409s** → expected if the plugin retries a request before its
  60s JWT expires. Plugin should mint a fresh request, not retry.
