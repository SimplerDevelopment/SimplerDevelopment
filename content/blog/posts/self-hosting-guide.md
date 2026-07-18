---
title: "Self-Hosting SimplerDevelopment: Postgres, pgvector, and Bun"
slug: "self-hosting-simplerdevelopment"
description: "Step-by-step guide to running SimplerDevelopment yourself — Postgres with pgvector, environment variables, Drizzle migrations, and production deployment checklist."
date: 2026-06-27
tags:
  - self-hosting
  - postgres
  - pgvector
  - drizzle-orm
  - next-js
  - bun
author: "SimplerDevelopment Team"
draft: true
seo:
  title: "Self-Hosting SimplerDevelopment: Postgres, pgvector, and Bun"
  description: "Step-by-step guide to running SimplerDevelopment yourself — Postgres with pgvector, environment variables, Drizzle migrations, and production deployment checklist."
  keywords:
    - self-host Next.js SaaS
    - Postgres pgvector self-hosting
    - Drizzle ORM migration
    - Bun runtime
    - NextAuth v5
    - HNSW index
    - DATABASE_URL
---

SimplerDevelopment is Apache-2.0 licensed and built to run anywhere that can serve a Next.js application and connect to a Postgres database. This guide covers everything you need to go from `git clone` to a running production instance: the non-negotiable infrastructure prerequisites, how to wire the required environment variables, the Drizzle migration workflow, and the deployment options that work today.

The platform is not a toy project. The codebase is approximately 357k lines (app 157k / lib 81k / components 119k), and it supports three distinct audience trees from a single Next.js build: an internal admin panel, a per-tenant client portal, and per-tenant public websites. Provision and plan accordingly.

---

## What you need before you start

**Runtime prerequisites:**

- **Bun 1.3.11 or later** — the project uses `bun.lock`; always run `bun`, never `npm` or `yarn`.
- **Node.js 20+** — required by a small number of helper scripts that use `tsx`.
- **PostgreSQL 14+ with the `vector` (pgvector) extension** — this is a hard requirement on every database, including local dev. The Company Brain / RAG feature stores embeddings in a `brain_embeddings` table backed by an HNSW index. Migrations will fail if the extension is not present before you run them.

The easiest way to satisfy the Postgres prerequisite locally is Docker:

```bash
docker compose up -d
```

The included `docker-compose.yml` uses the `pgvector/pgvector:pg16` image and mounts an init script (`docker/initdb/`) that auto-provisions the `vector`, `pg_trgm`, and `pgcrypto` extensions on the first boot. You do not need to run `CREATE EXTENSION` manually when using this compose file.

If you prefer to point at an existing Postgres instance, you need to enable the extensions once before running migrations:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

---

## Quick start (local dev)

```bash
# 1. Start Postgres + pgvector (Docker — no local Postgres installation required)
docker compose up -d

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env.local
# See "Required environment variables" below for what to fill in.

# 4. Apply the schema
bun run db:migrate

# 5. (Optional) Seed development data
bun run db:seed:dev

# 6. Start the dev server
bun dev   # → http://localhost:3000
```

First-run sanity check: `GET /api/health` should return `200 OK` once the server is up. If it does not, verify your `DATABASE_URL` is reachable and that migrations completed without errors.

---

## Required environment variables

The full annotated list lives in `.env.example` at the repo root — read it before deploying. Most variables gate optional integrations (Stripe, Google Workspace, S3, Resend, Zoom) and the app boots without them; those features stay dormant until you configure their keys. The variables below are required to boot at all.

### Minimum to boot

| Variable | Purpose | How to generate |
|---|---|---|
| `DATABASE_URL` | Postgres connection string. Use `?sslmode=require` for remote hosts. | — |
| `AUTH_SECRET` | NextAuth v5 session secret. Also set `NEXTAUTH_SECRET` to the same value (v4 fallback). | `openssl rand -hex 32` |
| `NEXTAUTH_URL` | Canonical base URL of your app, e.g. `https://app.example.com`. | — |
| `NEXT_PUBLIC_APP_URL` | Same value as `NEXTAUTH_URL`. Affects client-side routing. | — |
| `NEXT_PUBLIC_SITE_URL` | Same value as `NEXTAUTH_URL`. | — |
| `WORKSPACE_TENANT_SECRETS_KEY` | AES-256 key for encrypting per-tenant Google Workspace credentials. | `openssl rand -hex 32` |
| `PORTAL_KMS_KEY` | AES-GCM key for plugin JWT signing-key encryption. Without it, plugin verification falls back to a dev key with a warning — unsafe in production. | `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | AES-256-GCM key for stored integration API keys. Must be exactly 64 hex characters (32 bytes). The integrations API-keys route returns 500 without it. | `openssl rand -hex 32` |
| `OAUTH_STATE_SECRET` | Signs OAuth CSRF state nonces. | `openssl rand -hex 32` |
| `CRON_SECRET` | Protects `/api/cron/*` endpoints from unauthenticated calls. | `openssl rand -hex 32` |

### Custom domain / subdomain sessions

If your deployment uses subdomains (e.g. `tenant.example.com` alongside `app.example.com`), set:

```
AUTH_COOKIE_DOMAIN=.example.com
```

The leading dot causes the session cookie to cover all subdomains. Leave this variable blank for `localhost` or single-host deployments — the cookie stays host-only by default.

### AI features (Company Brain / RAG)

```
ANTHROPIC_API_KEY=   # Platform-level Anthropic key; also the BYOK fallback
OPENAI_API_KEY=      # Used for embedding generation (text-embedding-3-small)
```

Both are required for the Company Brain / RAG feature. If every tenant supplies their own keys (BYOK), you can omit the platform-level keys — but the embedding pipeline will produce errors for any tenant that has not configured BYOK.

### Optional integrations

Add these as you enable each feature. The app boots and runs without them:

- **Email:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- **Billing:** `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- **File storage:** `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- **Auth providers:** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET`
- **Rate limiting:** `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — without these, the auth rate limiter falls back to per-instance in-memory windows (fine locally, weak in production under load-balanced deployments)

---

## Applying migrations

**Never hand-edit files in `drizzle/*.sql`.** They are generated artifacts. Manual edits become invisible to Drizzle and cause silent schema drift.

The correct workflow:

```bash
# If you are making schema changes, edit lib/db/schema/<domain>.ts first, then:
bun run db:generate   # emits drizzle/<NNNN>_*.sql

# Apply all pending migrations:
bun run db:migrate
```

`db:migrate` checks `DATABASE_URL` and refuses known production URL patterns as a safety rail — but that check is not a substitute for knowing which database you are pointing at. A local `.env.local` that references a remote staging or production connection string is not a local database. Double-check before running any migration command.

### The pgvector HNSW index — a known footgun

Migration `drizzle/0061_brain_embeddings.sql` creates the HNSW index on `brain_embeddings` outside the Drizzle schema definition file. Running `drizzle-kit push --force` silently drops this index. Do not use `push --force` against any database with real Brain / embedding data.

After restoring a database from backup, verify the index survived:

```bash
psql $DATABASE_URL -c '\d brain_embeddings'
```

The index should appear in the output. If it is missing, re-run the migration or re-apply the index from the SQL file.

---

## Deployment options

### Vercel (documented path)

Push the `main` branch. Vercel auto-deploys using Next.js framework mode with `bun install --frozen-lockfile` and `next build`. Any other pushed branch deploys as a preview automatically.

Set the environment variables above in the Vercel project dashboard under **Settings → Environment Variables**. Use separate variable sets per environment (production, preview, development).

One caveat: the `dev` branch intentionally relaxes build strictness (`ignoreBuildErrors` and `ignoreDuringBuilds` are enabled when `VERCEL_GIT_COMMIT_REF === 'dev'`). Do not rely on this behavior in production — point production at `main`.

### Railway (two-service topology)

Railway works well for teams that want the app and database in the same project with automatic connection wiring:

```bash
railway login
railway new
```

Inside the project: **+ New → Database → Postgres** to add a Postgres 16 instance. Railway injects `DATABASE_URL` automatically as a reference variable once linked.

After provisioning Postgres, enable the required extensions via the Railway web SQL console:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

Then run migrations through the Railway shell:

```bash
railway run bun run db:migrate
```

The repo root `railway.json` configures the Nixpacks builder (auto-detected from `bun.lock`), build command (`bun install --frozen-lockfile && bun run build`), start command (`bun run start`), and a `/api/health` healthcheck with a 300-second timeout for cold boot. No Dockerfile is required.

See [`docs/deploy/railway.md`](../../../docs/deploy/railway.md) for the full step-by-step Railway guide.

### Other platforms

Any platform that can run a Next.js 16 application with Bun works. On a self-managed VPS or Fly.io, use the `pgvector/pgvector:pg16` Docker image for the database (same as the local compose setup) and deploy the Next.js app from a standard Bun container.

---

## Production checklist

Before declaring an instance production-ready:

```
[ ] Postgres running with the vector, pg_trgm, and pgcrypto extensions enabled
[ ] DATABASE_URL verified (psql $DATABASE_URL -c '\l')
[ ] bun run db:migrate completes with no errors
[ ] HNSW index present on brain_embeddings (\d brain_embeddings in psql)
[ ] AUTH_SECRET and NEXTAUTH_SECRET set to the same generated value
[ ] NEXT_PUBLIC_APP_URL matches your actual domain
[ ] AUTH_COOKIE_DOMAIN set to .yourdomain.com if using subdomains
[ ] PORTAL_KMS_KEY, ENCRYPTION_KEY, WORKSPACE_TENANT_SECRETS_KEY, OAUTH_STATE_SECRET, CRON_SECRET all set
[ ] DISABLE_AUTH_RATE_LIMIT is NOT set (or set to 0) in production
[ ] Stripe seat product created via scripts/billing/create-seat-product.ts (billing go-live dependency)
[ ] Resend domain verified and DNS records propagated (if using email)
[ ] Google OAuth app configured with correct redirect URIs (if using Google sign-in)
[ ] bun test:critical passes against your staging environment before cutover
```

---

## Known gaps and honest caveats

Self-hosting is fully supported, but a few rough edges are worth knowing before you commit:

| Gap | Status |
|---|---|
| No official Docker image for the app | Use any Bun + Node 20 container base with Nixpacks, or the Railway/Vercel native build. No official image is published. |
| Stripe billing requires a seat product setup script | Run `scripts/billing/create-seat-product.ts` before going live with billing. This is not automated. |
| Rate limiter is per-instance without Upstash | The auth rate limiter (10 attempts / 15 min per IP) falls back to in-memory state without `UPSTASH_REDIS_REST_URL`. Under a load balancer with multiple instances, each instance has its own window. |
| No Railway gallery template yet | The one-click "Deploy on Railway" button links to Railway's generic deploy page. A published gallery template is a documented TODO — see `docs/deploy/railway.md` for the current step-by-step workaround. |
| Webhook delivery | Project webhooks do not have retry logic, signing-secret rotation, or a delivery log UI. |

---

## Further reading

- **Full environment variable reference:** `.env.example` in the repo root — annotated, with generation commands for every secret.
- **Drizzle setup and the posts/categories/tags REST API:** [`docs/guides/DATABASE.md`](../../../docs/guides/DATABASE.md)
- **Stack and deployment topology:** [`docs/agents/architecture-for-agents.md`](../../../docs/agents/architecture-for-agents.md)
- **API surfaces reference (for first-run health check):** [`docs/agents/api-index.md`](../../../docs/agents/api-index.md)
- **Railway deploy guide:** [`docs/deploy/railway.md`](../../../docs/deploy/railway.md)

---

**Questions about self-hosting?** [Open a support ticket](/support) — our engineering team can review your setup and environment variable configuration.
