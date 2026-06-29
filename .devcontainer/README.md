# Dev Container (GitHub Codespaces / VS Code Dev Containers)

This folder configures a zero-install development environment for
[GitHub Codespaces](https://docs.github.com/en/codespaces) and
[VS Code Dev Containers](https://containers.dev).

## How it maps to the manual Quick Start

| Manual step (README) | Dev-container equivalent |
|---|---|
| `docker compose up -d` | Done automatically — the db service from `../docker-compose.yml` starts with the container |
| `bun install` | Runs automatically via `postCreateCommand` |
| `cp .env.example .env.local` | **You do this once** (see below) |
| Set `DATABASE_URL` in `.env.local` | Pre-set to `postgresql://postgres:postgres@db:5432/simplerdev` via the Compose environment — you can skip this line in `.env.local` |
| `bun run db:migrate` | **You run this once** after filling in `.env.local` |
| `bun dev` | **You run this** from the integrated terminal |

## First-time setup (inside the container terminal)

```bash
# 1. Copy the example env (pre-filled DATABASE_URL; add real secrets below)
cp .env.example .env.local

# 2. Open .env.local and fill in the required secrets:
#      AUTH_SECRET / NEXTAUTH_SECRET / OAUTH_STATE_SECRET  → openssl rand -hex 32
#      WORKSPACE_TENANT_SECRETS_KEY                        → openssl rand -hex 32
#      PORTAL_KMS_KEY                                      → openssl rand -base64 32
#      ENCRYPTION_KEY                                      → openssl rand -hex 64
#      NEXTAUTH_URL / NEXT_PUBLIC_APP_URL                  → http://localhost:3000
#   Optional integrations (Stripe, S3, Google, Anthropic, …) stay dormant until set.

# 3. Apply the schema (pgvector is already enabled via docker/initdb/01-extensions.sql)
bun run db:migrate

# 4. Optionally seed dev data
bun run db:seed:dev

# 5. Start the dev server
bun dev   # → http://localhost:3000 (auto-forwarded by Codespaces)
```

## Architecture notes

- **Database:** `pgvector/pgvector:pg16` from `../docker-compose.yml` — same image as the
  README quick start, so schema and extension behavior are identical.
- **App container:** `oven/bun:1-debian` — Bun is pre-installed; no extra install step.
- **Networking:** the app container reaches Postgres at hostname `db` (Compose service name).
  `DATABASE_URL` is pre-wired via the Compose environment; you do not need to set it in `.env.local`
  unless you want to override it.
- **Port forwarding:** port 3000 (Next.js) and 5432 (Postgres) are forwarded to the host
  automatically.

## Resetting

```bash
# Reset the database volume (wipes all data)
docker compose down -v
# Then re-run: bun run db:migrate (and optionally bun run db:seed:dev)
```
