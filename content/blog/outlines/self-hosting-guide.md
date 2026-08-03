# Outline: Self-Hosting SimplerDevelopment

---

## Meta

**SEO title:** Self-Hosting SimplerDevelopment: Postgres, pgvector, and Bun
**Meta description:** Step-by-step guide to running SimplerDevelopment yourself — Postgres with pgvector, environment variables, Drizzle migrations, and production deployment checklist.
**URL slug:** `self-hosting-simplerdevelopment`
**Target audience:** Agencies and developers who want to self-host the platform; engineers evaluating the stack before adopting it.
**Primary keywords:** self-host Next.js SaaS, Postgres pgvector self-hosting, Drizzle ORM migration
**Secondary keywords:** Bun runtime, NextAuth v5, HNSW index, DATABASE_URL, env vars

---

## Outline

### H2: What you're hosting

- **App layer:** Next.js 16.1.1 (App Router), React 19, TypeScript 5, Tailwind 4. Runtime: Bun. Lock file: `bun.lock` — use `bun`, not `npm`.
- **Database:** Postgres with the `vector` (pgvector) extension. Required on every database — including local dev — because the `brain_embeddings` table uses an HNSW vector index.
- **Scale context:** the codebase is ~357k lines (app 157k / lib 81k / components 119k). Not a toy project — provision accordingly.
- The platform supports three audience trees: an internal admin panel, a per-tenant client portal, and per-tenant public websites. All three run from the same Next.js build.

### H2: Choosing your host topology

#### H3: App host — any Next.js host

- Vercel is the documented production deployment path: push `main`, auto-deploy.
- Any platform that runs Next.js works: Fly.io (Dockerfile), Railway, Render, self-managed VPS.
- Preview deploys: any pushed branch other than `main` deploys as a preview automatically on Vercel.
- The `dev` branch relaxes build strictness: `next.config.ts` sets `ignoreBuildErrors` and `ignoreDuringBuilds` when `VERCEL_GIT_COMMIT_REF === 'dev'`. Do not rely on this in production.

#### H3: Database — Postgres with pgvector

Supported hosting options for Postgres:
- **Railway** — managed Postgres with pgvector available via extension enable.
- **Neon** — serverless Postgres; pgvector supported.
- **Supabase** — managed Postgres; pgvector enabled by default.
- **Self-managed on a VPS or Docker** — install `postgresql` + `postgresql-pgvector` package; run `CREATE EXTENSION IF NOT EXISTS vector;` in your database.

**Critical:** the `vector` extension must be enabled on every database before running migrations. The migration that creates `brain_embeddings` will fail without it.

### H2: Environment variables

Required variables (derived from the codebase — always verify against `.env.example` in the repo):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (with `?sslmode=require` for remote hosts) |
| `NEXTAUTH_SECRET` | NextAuth v5 JWT signing secret — generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` | The canonical app URL; sets the NextAuth cookie domain (`.yourdomain.com` in prod) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Required only if enabling Google OAuth sign-in |
| `OPENAI_API_KEY` | Required for embedding generation (`brain_embeddings`); or configure per-tenant BYOK |
| `ANTHROPIC_API_KEY` | Required for AI features unless every tenant uses BYOK |
| `RESEND_API_KEY` | Transactional and campaign email via Resend |

**Security rule:** Never point a local `.env` at a remote staging or production database. A local `.env` connecting to a remote DB is not local — running migrations or `db:push` against it modifies production data.

**Rate limiting:** `DISABLE_AUTH_RATE_LIMIT=1` disables the per-IP brute-force limiter (10 attempts / 15 min). Set only in E2E test environments.

### H2: Running migrations

#### H3: The migration workflow

```bash
# 1. Edit schema (if making schema changes)
#    Edit lib/db/schema/<domain>.ts

# 2. Generate migration (if schema changed)
bun run db:generate   # emits drizzle/<NNNN>_*.sql

# 3. Apply migrations
bun run db:migrate    # applies locally; auto-refuses prod URLs
```

**Hard rules:**
- Never hand-edit files in `drizzle/*.sql`. They are generated artifacts — manual edits become invisible to Drizzle and cause silent schema drift.
- `db:migrate` automatically checks `DATABASE_URL` and refuses known production URL patterns. This is a safety rail, not a substitute for knowing which DB you're connected to.
- In production, the migration tracker may be out of sync with the applied schema. Document any hand-applied migrations with a comment in the migration file and in your deployment log.

#### H3: The pgvector HNSW index footgun

- The HNSW index on `brain_embeddings` is managed via `drizzle/0061_brain_embeddings.sql` — it is **outside** the Drizzle schema definition file.
- `drizzle-kit push --force` silently drops this index. Never run `push --force` against a database that has real Brain/embedding data.
- After restoring a database from backup, verify the HNSW index is present: `\d brain_embeddings` in psql should show the index.

### H2: First-run checklist

```
[ ] Postgres running with `vector` extension enabled
[ ] DATABASE_URL set and verified (psql $DATABASE_URL -c '\l')
[ ] bun run db:migrate completes with no errors
[ ] NEXTAUTH_SECRET set (32+ bytes of random data)
[ ] NEXT_PUBLIC_APP_URL matches your actual domain (affects cookie domain)
[ ] bun dev starts without errors on localhost
[ ] /api/health returns 200
[ ] Can create a user and log in
[ ] Can create a site and see the portal
```

### H2: `dev` branch vs. `main` / `staging` — build discipline

| Branch | Build behavior | Git hooks |
|---|---|---|
| `dev` / `dev/*` | `ignoreBuildErrors`, `ignoreDuringBuilds` enabled | Pre-commit and pre-push hooks self-skip |
| `main` / `staging` | Strict builds — type errors and lint errors fail the build | Full hooks enforced |

- `dev` is a fast-iteration throwaway line. Use an isolated dev Postgres for it — schema changes pushed ad-hoc via `drizzle-kit push` against a dev DB only.
- Never use `drizzle-kit push` (as opposed to `db:migrate`) against a database with real data.

### H2: Production deployment checklist

```
[ ] All migrations applied and verified
[ ] HNSW index present on brain_embeddings (if Brain/AI features enabled)
[ ] Cookie domain configured: NEXT_PUBLIC_APP_URL = https://yourdomain.com
[ ] Stripe seat product created via scripts/billing/create-seat-product.ts (billing go-live dependency)
[ ] Google OAuth app configured (if using Google sign-in)
[ ] Resend domain verified and DNS records propagated
[ ] bun test:critical passes against staging before cutover
```

### H2: What's not in a single-command install (known gaps)

| Gap | Status |
|---|---|
| No official Dockerfile | Use any Bun + Node container base; no official image provided |
| No SDK / client library | No npm package; MCP clients connect directly to `/api/mcp` |
| Webhook delivery guarantees | Project webhooks lack retry, signing-secret rotation, and a delivery log |
| Public OAuth developer console | Management API at `/api/portal/oauth-clients` exists; no self-serve UI |

---

## Key code / concepts to show

- `CREATE EXTENSION IF NOT EXISTS vector;` — pgvector enable command
- `DATABASE_URL` connection string format for Railway / Neon / Supabase
- `bun run db:generate && bun run db:migrate` — migration command pair
- `\d brain_embeddings` in psql — verifying the HNSW index after migration
- `openssl rand -base64 32` — generating `NEXTAUTH_SECRET`

---

## Internal links

- `/docs/guides/DATABASE` — Drizzle setup + REST API for posts/categories/tags
- `/docs/agents/architecture-for-agents` — stack and deployment topology section
- `/docs/agents/api-index` — API surfaces reference (for first-run API health check)
- Feature inventory: Auth & Security (`vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md` §17)

---

## CTA

**Primary:** "Read the full environment variable reference in the repo's `.env.example` before deploying."
**Secondary:** "Questions about self-hosting? Open a ticket — our engineering team can review your setup."

---

## Screenshot / GIF requirements

1. Terminal screenshot: `bun run db:migrate` completing successfully with pgvector extension present.
2. Terminal screenshot: `bun test:critical` passing — golden-path E2E gate.
3. Diagram: Host topology — Next.js app host + Postgres (with pgvector) + external services (Resend, Stripe, OpenAI/Anthropic).
4. No fabricated load numbers or latency figures.
