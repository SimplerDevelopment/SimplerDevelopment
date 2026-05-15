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
