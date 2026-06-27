# SimplerDevelopment

[![CI](https://github.com/DanielPCoyle/simplerdevelopment2026/actions/workflows/ci.yml/badge.svg)](https://github.com/DanielPCoyle/simplerdevelopment2026/actions/workflows/ci.yml) [![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE) [![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md) [![Built with Bun](https://img.shields.io/badge/built%20with-Bun-14151a.svg)](https://bun.sh) [![Tenancy gate](https://img.shields.io/badge/tenancy-required-blue)](tests/CI-GATES.md)

**An open-source, MCP-native, all-in-one platform for agencies and operators.** Run per-tenant client **websites**, a **CRM**, an AI-powered **Company Brain** (RAG over client knowledge), workflow **automations**, **bookings**, a **storefront**, **email** campaigns, **surveys**, e-signatures, and **Stripe billing** — from one multi-tenant portal. Then drive *all* of it through an AI agent: the platform ships **200+ Model Context Protocol (MCP) tools**, so Claude, Cursor, or any MCP client can build pages, manage the CRM, send campaigns, and operate the whole system programmatically.

Think *"open-source, agent-operable alternative to the usual stack of a site builder + CRM + email tool + booking app + knowledge base"* — unbundled into one self-hostable codebase.

<!-- HERO: record this GIF before launch — `vhs docs/launch/demo.tape` (see docs/launch/demo.tape). It is the #1 conversion asset above the fold. -->
<p align="center">
  <img src="docs/launch/demo.gif" alt="An MCP client building a page, CRM record, and booking by talking to an agent" width="800" />
</p>

<p align="center">
  <a href="#quick-start"><b>⚡ Self-host in 5 minutes</b></a>
  &nbsp;·&nbsp;
  <!-- TODO(launch): publish this as a Railway gallery template (dashboard → Settings → Templates → Publish) and update the href to https://railway.com/template/<SLUG> -->
  <a href="https://railway.com/deploy?template=https://github.com/DanielPCoyle/simplerdevelopment2026"><img src="https://railway.com/button.svg" alt="Deploy on Railway" height="28" /></a>
  &nbsp;·&nbsp;
  <a href="https://vercel.com/new/clone?repository-url=https://github.com/DanielPCoyle/simplerdevelopment2026"><img src="https://vercel.com/button" alt="Deploy with Vercel" height="28" /></a>
</p>

> ℹ️ One-click deploy stands up the app, but the platform needs **Postgres + pgvector** and a few secrets — see [Quick start](#quick-start) and **[`docs/deploy/railway.md`](docs/deploy/railway.md)** for the full Railway two-service setup (app + Postgres-with-pgvector, required env vars, pgvector extension step). A published Railway gallery template (one true one-click experience) is a **TODO** for the maintainer — see the deploy guide for instructions.

## Why it's different

- [x] **MCP-native, not MCP-bolted-on.** 200+ scoped MCP tools span the entire platform surface (content, CRM, brain, commerce, email, bookings, billing). Build a site or run an outreach campaign by *talking to an agent*. → [`docs/mcp.md`](docs/mcp.md)
- [x] **All-in-one & multi-tenant.** A single Next.js codebase serves an internal admin panel, a per-tenant client portal, and per-tenant public websites. → [Architecture](#architecture-overview)
- [x] **Block-based CMS + visual editor.** Content is typed JSON blocks edited in an iframe visual page builder. → [`docs/guides/BLOCK_EDITOR_GUIDE.md`](docs/guides/BLOCK_EDITOR_GUIDE.md)
- [x] **AI Company Brain.** Per-tenant retrieval-augmented knowledge base over client material. → [`docs/guides/BRAIN.md`](docs/guides/BRAIN.md)
- [x] **Self-hostable.** Apache-2.0 licensed. Bring your own Postgres and API keys. → [Quick start](#quick-start)

> Open-sourced from a production codebase. See **[CONTRIBUTING.md](CONTRIBUTING.md)** for how the codebase is organized (it has an unusually rich set of contributor/architecture docs) and **[SECURITY.md](SECURITY.md)** to report a vulnerability.

---

## Architecture overview

### Three route trees, three audiences

| Route prefix | Audience | Purpose |
|---|---|---|
| `app/admin/**` | Internal (us) | Global admin panel — super-admin operations, cross-tenant views, system health |
| `app/portal/**` | Per-tenant client | Client-facing portal — websites, CRM, brain, automations, billing, settings |
| `app/sites/**` and `app/s/**` | Public | Per-tenant public websites rendered from block-based post content |

### API envelope

Every API route returns `{ success: true, data: ... }` on success or `{ success: false, error: "..." }` on failure. Tenant routes resolve the active site via `lib/active-client.ts` plus site-resolver middleware — never derive tenant identity from the request body or query params. Use `simplerdev-feature-scaffold` to generate routes in lockstep; do not hand-roll the pattern.

### Tenancy

All data is keyed by `clientId` and `siteId`. Row-level queries must filter on these columns. Run `bun test:tenancy` after any data-access change to verify there is no cross-tenant data leakage.

### Block-based CMS

Content is stored as typed JSON arrays in `posts.content`. Block schemas live in `lib/blocks/registry.ts`; render cases live in `app/sites/`. Blocks are universal — no block type is client-specific. Use `simplerdev-block-type` to scaffold a new block type (interface, render component, registry entry, and production renderer case all move together).

### Visual editor

The block editor lives at `app/portal/websites/[siteId]/posts/[id]/edit`. It uses an iframe preview with selection/resize overlays and a postMessage protocol between the host shell and the preview frame. See `components/portal/visual-editor/CLAUDE.md` before touching this area.

### Company Brain

AI-powered knowledge base per tenant. Embeddings are generated via OpenAI (`text-embedding-3-small`) and stored in Postgres. Retrieval-augmented generation (RAG) queries route through `lib/ai/` and `lib/brain/`. See `lib/ai/CLAUDE.md` for patterns and the 70% coverage floor that applies to this domain.

### MCP server

An in-repo Model Context Protocol server (`app/api/mcp/route.ts` + `lib/mcp/`) exposes 200+ scoped platform tools to AI agents (Claude Code, Claude Desktop, Cursor, any MCP client). Tools are registered per-domain with a scope guard on every tool.

- **Connect a client:** [`docs/mcp.md`](docs/mcp.md) (Claude.ai OAuth, API key, Claude Desktop/Code config)
- **Tool catalog:** [`docs/api/mcp/overview.md`](docs/api/mcp/overview.md)
- **Add a tool (contributors):** [`docs/guides/MCP_TOOLS.md`](docs/guides/MCP_TOOLS.md)

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.1.1 (App Router) |
| UI | React 19.2.3 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| ORM / DB | Drizzle ORM + PostgreSQL |
| Auth | NextAuth v5 beta |
| Package manager | Bun (lock file: `bun.lock`) — always use `bun`, never `npm` |
| Unit / integration tests | Vitest 4 |
| E2E tests | Playwright |
| Realtime | Yjs + y-websocket (packages/realtime-server) |
| Billing | Stripe |
| File storage | AWS S3 |
| Email | Resend |
| AI | Anthropic SDK + OpenAI (embeddings) |
| Error tracking | Sentry |
| Deployments | Vercel (region: iad1) |

---

## Prerequisites and setup

**Requirements:** Bun 1.3.11+, **PostgreSQL 14+ with the [`pgvector`](https://github.com/pgvector/pgvector) extension** (the Company Brain / RAG needs it), Node.js 20+ (for scripts that use `tsx`), and optionally Docker.

### Quick start

> **Zero-install option:** open in [GitHub Codespaces](https://codespaces.new/DanielPCoyle/simplerdevelopment2026) or any [Dev Container](https://containers.dev)-aware editor — Postgres + Bun start automatically. See [`.devcontainer/README.md`](.devcontainer/README.md) for first-time steps.

```bash
# 1. Start Postgres + pgvector (Docker — easiest, no local Postgres needed)
docker compose up -d

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env.local
#   For the Docker DB above, set in .env.local:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/simplerdev
#   Generate the required secrets:
#   AUTH_SECRET / NEXTAUTH_SECRET / OAUTH_STATE_SECRET → openssl rand -hex 32
#   WORKSPACE_TENANT_SECRETS_KEY                       → openssl rand -hex 32
#   PORTAL_KMS_KEY                                     → openssl rand -base64 32
#   ENCRYPTION_KEY                                     → openssl rand -hex 64

# 4. Create the schema and seed dev data
#    (pgvector + pg_trgm + pgcrypto are auto-provisioned on first Docker boot)
bun run db:migrate
bun run db:seed:dev      # optional

# 5. Run it
bun dev                  # http://localhost:3000
```

> Not using Docker? Point `DATABASE_URL` at any Postgres that has `pgvector` available, then enable the extensions once before migrating:
> ```sql
> CREATE EXTENSION IF NOT EXISTS vector;
> CREATE EXTENSION IF NOT EXISTS pg_trgm;
> CREATE EXTENSION IF NOT EXISTS pgcrypto;
> ```
> Reset the Docker DB anytime with `docker compose down -v`.

### Minimum env to boot

Most variables in `.env.example` gate **optional integrations** (Stripe, Google Workspace, S3, Resend, Zoom, etc.) — the app boots without them; those features stay dormant until configured. The minimum to start:

| Variable | Purpose | Generate |
|---|---|---|
| `DATABASE_URL` | Postgres (with pgvector) connection string | — |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | NextAuth session secret | `openssl rand -hex 32` |
| `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` | Base URL, e.g. `http://localhost:3000` | — |
| `WORKSPACE_TENANT_SECRETS_KEY` | 32-byte hex — encrypts per-tenant BYOK secrets | `openssl rand -hex 32` |
| `PORTAL_KMS_KEY` | Base64 key for plugin JWT signing | `openssl rand -base64 32` |
| `OAUTH_STATE_SECRET` | OAuth state signing | `openssl rand -hex 32` |

Then add integration keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, …) as you enable each feature. See `.env.example` for the full annotated list.

---

## Development

```bash
bun dev            # start the Next.js dev server at http://localhost:3000
bun run lint       # ESLint
bun run typecheck  # tsc --noEmit — run after any non-trivial edit batch
```

---

## Testing

Tests are split into three layers driven by a single runner script.

| Layer | Path | Runner | Command |
|---|---|---|---|
| Unit | `tests/unit/` | Vitest | `bun test` |
| Integration | `tests/integration/` | Vitest + real DB | `bun test:integration:local` |
| E2E | `tests/e2e/` | Playwright | `bun run test:e2e` |

### Gate commands

```bash
# Unit tests
scripts/test.sh --layer=unit --no-coverage          # alias: bun test

# Integration tests (requires a running DB)
bun test:integration:local                          # spins up a local DB, then runs

# E2E tests
scripts/test.sh --layer=e2e --no-coverage

# QA gate — run before declaring any feature done
bun test:critical                                   # Playwright @critical golden-path subset

# Tenancy regression — run after every data-access change
bun test:tenancy                                    # integration suite @tenancy tag
```

### Local CI gate

`scripts/ci-local.sh` runs the full suite of checks locally (architecture boundaries, file-size budgets, doc drift, lint, typecheck, unit tests). It is wired into git pre-commit and pre-push hooks under `.githooks/`.

```bash
scripts/ci-local.sh           # full gate
scripts/ci-local.sh --quick   # fast checks only (no tsc/tests)
scripts/ci-local.sh --full    # + tenancy + critical e2e (needs DB + Playwright)
```

### Coverage floors

Defined in `vitest.config.ts`. Project-wide: 60% lines/statements/functions, 50% branches. Higher floors apply to `lib/billing`, `lib/ai`, `lib/agency`, `lib/esign`, `lib/chat` (70%) and `lib/crypto` (90%). See [`tests/CI-GATES.md`](tests/CI-GATES.md) for details.

---

## Database and migrations

Schema is defined as per-domain Drizzle modules under `lib/db/schema/`. Migration SQL in `drizzle/*.sql` is **generated — never edit it by hand**.

```bash
# After editing lib/db/schema/ files:
bun run db:generate    # generates new migration files under drizzle/

# Apply pending migrations (refuses prod DATABASE_URLs via db:verify-target):
bun run db:migrate

# Interactive schema browser:
bun run db:studio
```

See [`lib/db/CLAUDE.md`](lib/db/CLAUDE.md) for tenancy invariants and footguns.

---

## Project structure

```
simplerdevelopment2026/
├── app/                    # Next.js App Router
│   ├── admin/              # Global internal admin panel
│   ├── portal/             # Per-tenant client portal
│   ├── sites/              # Per-tenant public websites (block renderer)
│   ├── s/                  # Short-URL / alternate public site entry point
│   ├── api/                # API routes (NextAuth + site-resolver pattern)
│   └── (pages)/            # Marketing / public pages
├── components/             # Shared React components
│   └── portal/visual-editor/  # Visual block editor (iframe + postMessage)
├── lib/                    # Business logic, utilities, integrations
│   ├── ai/                 # Company Brain, RAG, embeddings
│   ├── billing/            # Stripe billing
│   ├── blocks/             # Block registry and schemas
│   ├── brain/              # Brain knowledge graph
│   ├── crm/                # CRM contacts, deals, pipelines
│   ├── db/                 # Drizzle ORM, schema modules
│   ├── mcp/                # In-repo MCP server tools
│   ├── crypto/             # API-key encryption primitives (90% coverage floor)
│   ├── google/             # Google Workspace integration
│   └── ...                 # Other feature domains
├── drizzle/                # Generated migration SQL — do not edit
├── scripts/                # Dev and CI scripts (test.sh, ci-local.sh, db scripts)
├── tests/                  # Test suite
│   ├── unit/               # Vitest unit tests
│   ├── integration/        # Vitest integration tests (real DB)
│   └── e2e/                # Playwright E2E tests
├── workers/                # Background workers (email-inbound)
├── packages/               # Workspace packages
│   ├── realtime-server/    # Yjs WebSocket server
│   ├── sdk/                # Client SDK
│   └── starter/            # Starter template
├── docs/                   # Developer documentation
├── workflows/              # Automation workflow definitions
├── public/                 # Static assets
└── vercel.json             # Vercel deployment config (build, crons)
```

---

## Agentic development

This repo is built to be worked on by AI agents (primarily Claude Code) alongside humans. The agent tooling is first-class infrastructure, not an add-on.

### Agent navigation

- [`CLAUDE.md`](CLAUDE.md) — the root agent operating guide: architecture invariants, commands, conventions, don't-touch zones.
- Nested `CLAUDE.md` files carry per-area invariants and god-file warnings, loaded automatically when an agent works in that subtree: `app/portal/`, `app/admin/`, `lib/blocks/`, `lib/mcp/`, `lib/db/`, `lib/ai/`, `components/portal/visual-editor/`, `tests/`.
- [`.claude/index.md`](.claude/index.md) — the navigation map: "I need to work on X" → the right nested guide, skill, or doc.

### Skills (scaffolding workflows)

Repeatable engineering tasks are encoded as Claude Code skills so the lockstep pieces never drift apart:

| Skill | Produces |
|---|---|
| `simplerdev-feature-scaffold` | CRUD resource: schema + API route (envelope pattern) + e2e test |
| `simplerdev-block-type` | CMS block: TS interface, render component, registry entry, production renderer case, `/api/blocks` metadata |
| `simplerdev-mcp-tool` | MCP tool: handler + input schema + scope guard, registered in lockstep |
| `site-migration` | Imports an existing external website into the platform |
| `sd-create-page` / `-deck` / `-email` / `-survey` | Portal content authored via the in-repo MCP server, returned as draft + approval URL |

See `docs/skills/` for the full reference.

### Subagents and orchestration

Larger work runs through an orchestration hierarchy: a planning model decomposes work and dispatches well-scoped units to worker agents in parallel (e.g. `block-orchestrator` driving `block-implementer` workers for the CMS-blocks audit). Workers operate under an escalation contract — anything beyond a mechanical change is promoted back to the planner rather than guessed at (see `CLAUDE.md` § Agent operating rules).

### Guardrails (architecture fitness functions)

Agent- and human-authored changes are held to the same automated invariants, wired into the `.githooks/` pre-commit and pre-push hooks:

- `scripts/check-doc-drift.ts` — agent-facing docs may not reference moved or deleted files
- `scripts/check-file-budget.ts` — file-size budget with a god-file ratchet (new-file cap 800 lines)
- `.dependency-cruiser.cjs` — architectural boundary rules (route trees, layering)
- `knip.json` — dead-code detection
- `scripts/ci-local.sh` — the local CI gate (lint, typecheck, unit tests) run at pre-push

---

## Documentation index

| Document | Contents |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Agent and contributor operating guide — architecture invariants, commands, conventions, don't-touch zones |
| [`docs/guides/DATABASE.md`](docs/guides/DATABASE.md) | Drizzle setup, posts/categories/tags REST API |
| [`docs/guides/BLOCK_EDITOR_GUIDE.md`](docs/guides/BLOCK_EDITOR_GUIDE.md) | Block JSON schema, examples, troubleshooting |
| [`docs/guides/USER_MANAGEMENT.md`](docs/guides/USER_MANAGEMENT.md) | Auth, roles, NextAuth configuration |
| [`docs/guides/BRAIN.md`](docs/guides/BRAIN.md) | Company Brain architecture, embedding pipeline, RAG patterns |
| [`docs/mcp.md`](docs/mcp.md) | Connect an AI client to the MCP server (OAuth / API key / Claude config) |
| [`docs/api/mcp/overview.md`](docs/api/mcp/overview.md) | MCP tool catalog by domain |
| [`docs/guides/MCP_TOOLS.md`](docs/guides/MCP_TOOLS.md) | Extending the MCP server — adding a tool (handler, schema, scope guard, token budget) |
| [`docs/guides/AB_TESTING_GUIDE.md`](docs/guides/AB_TESTING_GUIDE.md) | A/B testing setup and usage |
| [`tests/TESTING_PLAN.md`](tests/TESTING_PLAN.md) | Full test responsibility model, layer targets |
| [`tests/CI-GATES.md`](tests/CI-GATES.md) | Gate definitions, coverage floors, local git hook setup |

---

## Deployment

The platform deploys to Vercel (region `iad1`) using Next.js framework mode. Install uses `bun install --frozen-lockfile`; build uses `next build`. A set of Vercel cron jobs (defined in `vercel.json`) drive background work including embedding processing, Gmail/Drive watch renewal, automation scheduling, brain daily notes, usage rollup, and booking reminders. See [`vercel.json`](vercel.json) for the full cron schedule.

---

## Contributing

Contributions are welcome. This codebase ships with an unusually rich set of contributor docs: **[`CONTRIBUTING.md`](CONTRIBUTING.md)** explains how the monorepo is organized and how to add a block type, an MCP tool, or a CRUD resource; the root [`CLAUDE.md`](CLAUDE.md) plus per-subsystem nested `CLAUDE.md` files document the architecture invariants. New here? Start with a [`good first issue`](../../issues?q=label%3A%22good+first+issue%22).

Use conventional commits (`feat(scope):`, `fix(scope):`, …). Run `bun run typecheck` and `bun test` before opening a PR; any change touching tenant data must pass `bun test:tenancy`.

## Security

Found a vulnerability? Please **don't** open a public issue — see **[`SECURITY.md`](SECURITY.md)** for private disclosure.

## License

[Apache License 2.0](LICENSE) © SimplerDevelopment.
