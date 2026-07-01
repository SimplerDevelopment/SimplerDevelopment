# Dev Container (GitHub Codespaces / VS Code Dev Containers)

This folder configures a zero-install development environment for
[GitHub Codespaces](https://docs.github.com/en/codespaces) and
[VS Code Dev Containers](https://containers.dev).

## How it maps to the manual Quick Start

| Manual step (README) | Dev-container equivalent |
|---|---|
| `docker compose up -d` | Done automatically — the db and Mailpit services from `../docker-compose.yml` start with the container |
| `bun install` | Runs automatically via `postCreateCommand` |
| `cp .env.example .env.local` | **You do this once** (see below) |
| Set `DATABASE_URL` in `.env.local` | Pre-set to `postgresql://postgres:postgres@db:5432/simplerdev` via the Compose environment — you can skip this line in `.env.local` |
| Set `EMAIL_TRANSPORT=mailpit` | Pre-set via Compose; Mailpit SMTP is reachable as `mailpit:1025` inside the container |
| `bun run db:migrate` | **You run this once** after filling in `.env.local` |
| `bun dev` | **You run this** from the integrated terminal |

## First-time setup (inside the container terminal)

```bash
# 1. Copy the example env (DATABASE_URL and Mailpit are pre-filled by Compose; add real secrets below)
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
- **Mailpit:** outbound app email is captured by default via `EMAIL_TRANSPORT=mailpit`.
  Open the forwarded Mailpit UI on port 8025.
- **Networking:** the app container reaches Postgres at hostname `db` and Mailpit at hostname
  `mailpit` (Compose service names). `DATABASE_URL` and Mailpit env vars are pre-wired via the
  Compose environment; you do not need to set them in `.env.local` unless you want to override them.
- **Port forwarding:** ports 3000 (Next.js), 5432 (Postgres), and 8025 (Mailpit UI) are forwarded
  to the host automatically.

## Resetting

```bash
# Reset the database volume (wipes all data)
docker compose down -v
# Then re-run: bun run db:migrate (and optionally bun run db:seed:dev)
```
