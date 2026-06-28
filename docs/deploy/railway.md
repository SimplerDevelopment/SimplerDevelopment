# Deploying SimplerDevelopment on Railway

This guide covers the two-service topology needed to run SimplerDevelopment on [Railway](https://railway.com).

> **TODO (maintainer):** A one-click Railway *gallery* template requires publishing a template on Railway's dashboard (Settings → Templates → Publish). Until that is done the "Deploy on Railway" button in the README links to Railway's generic deploy page. After publishing, update the button URL to `https://railway.com/template/<TEMPLATE_SLUG>`.

---

## Service topology

| Service | What it is | Railway setup |
|---|---|---|
| **app** | Next.js 16 + Bun | Deploy from this repo. `railway.json` at repo root configures Nixpacks build + start. |
| **db** | Postgres 16 with pgvector | Add the Railway **Postgres** plugin, then enable the `vector` extension (see below). |

Both services should live in the same Railway project so the `DATABASE_URL` reference variable is auto-wired.

---

## Step-by-step

### 1. Create the project

```bash
railway login
railway new            # creates a new project
```

Or use the Railway dashboard: **New Project → Deploy from GitHub repo**.

### 2. Add the Postgres plugin

In the Railway dashboard, inside your project: **+ New → Database → Postgres**. Railway will provision a Postgres 16 instance and inject `DATABASE_URL` into linked services automatically.

### 3. Enable pgvector

The Company Brain / RAG feature requires the `vector` extension. After the Postgres plugin is provisioned, open a shell to it and run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

You can do this from the Railway dashboard: **Postgres service → Connect → Query** (web SQL console), or via `railway run psql $DATABASE_URL`.

Alternatively, set the `DB_EXTENSIONS` environment variable on the Postgres service if your Railway Postgres template supports auto-provisioning — but the `CREATE EXTENSION` approach above is always reliable.

### 4. Run migrations

After the app is deployed (or from a local `railway run` shell):

```bash
railway run bun run db:migrate
```

### 5. Set required environment variables

Set these on the **app** service in Railway (Settings → Variables). Values marked **generate** mean you should produce a random secret with the command shown.

#### Minimum-to-boot (app will not start without these)

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Auto-injected by Railway if you use the Postgres plugin and the reference variable `${{Postgres.DATABASE_URL}}`. |
| `AUTH_SECRET` | NextAuth v5 session secret. **Generate:** `openssl rand -base64 32` |
| `NEXTAUTH_SECRET` | Same value as `AUTH_SECRET` (v4 fallback read by the code). |
| `NEXTAUTH_URL` | Your Railway app's public URL, e.g. `https://your-app.railway.app` |
| `NEXT_PUBLIC_APP_URL` | Same value as `NEXTAUTH_URL`. |
| `NEXT_PUBLIC_SITE_URL` | Same value as `NEXTAUTH_URL`. |
| `PORTAL_KMS_KEY` | AES-GCM key for plugin signing-key encryption. **Generate:** `openssl rand -base64 32` |
| `WORKSPACE_TENANT_SECRETS_KEY` | Google Workspace credential encryption key. **Generate:** `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | AES-256-GCM key for stored integration API keys. **Generate:** `openssl rand -hex 64` |
| `OAUTH_STATE_SECRET` | OAuth CSRF state nonce. **Generate:** `openssl rand -hex 32` |
| `CRON_SECRET` | Protects `/api/cron/*` endpoints. **Generate:** `openssl rand -hex 32` |

#### Required for AI features (Company Brain / RAG)

| Variable | Notes |
|---|---|
| `ANTHROPIC_API_KEY` | Platform-level Anthropic key. Required for AI features and plugin jobs. |
| `OPENAI_API_KEY` | Used for Company Brain embeddings (`text-embedding-3-small`). |

#### Optional (enable when you're ready)

See `.env.example` in the repo root for the full list, including Resend (email), Stripe (billing), S3 (file storage), Google / GitHub / LinkedIn / Zoom OAuth, Dropbox Sign, and Upstash Redis (rate limiting).

---

## Health check

The app exposes `GET /api/health` which returns `200 OK` when the server is up. `railway.json` configures Railway to use this path automatically with a 300-second timeout on cold boot.

---

## Build configuration

`railway.json` at the repo root drives the build:

- **Builder:** Nixpacks (auto-detects Bun via `bun.lock`)
- **Build command:** `bun install --frozen-lockfile && bun run build`
- **Start command:** `bun run start`
- **Healthcheck:** `GET /api/health`, 300 s timeout
- **Restart policy:** on failure, max 10 retries

No Dockerfile is required — Nixpacks handles the Node + Bun environment.

---

## Reference

- [Railway docs — Nixpacks](https://docs.railway.com/guides/nixpacks)
- [Railway docs — Variables](https://docs.railway.com/guides/variables)
- [Railway docs — Postgres plugin](https://docs.railway.com/databases/postgresql)
- Full env var reference: [`.env.example`](../../.env.example)
