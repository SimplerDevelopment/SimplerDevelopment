---
type: architecture
domain: platform
status: active
date: 2026-06-09
sources:
  - vercel.json
  - next.config.ts
  - .nixpacks.toml
  - packages/realtime-server/railway.toml
  - packages/realtime-server/Dockerfile
  - workers/email-inbound/wrangler.toml
  - sentry.server.config.ts
  - sentry.edge.config.ts
  - instrumentation.ts
  - scripts/verify-db-target.ts
---

# Deployment Topology

The platform is split across three runtime environments: a Vercel-hosted Next.js application, a Railway-hosted Yjs realtime server, and a Cloudflare Workers email ingestion layer.

---

## What Runs Where

### Vercel — Next.js application

The main application (`app/`) deploys to Vercel. Config in `vercel.json`:

- **Framework:** nextjs
- **Build command:** `next build`
- **Install command:** `bun install --frozen-lockfile`
- **Region:** `iad1` (US East)
- **TypeScript in-build check:** disabled in `next.config.ts` (`typescript.ignoreBuildErrors: true`) — the repo is ~357k lines and in-build type-checking exhausts the heap. Types are enforced instead by `tsc --noEmit` in the pre-push hook and CI.
- **Static generation workers:** capped at 4 CPUs via `next.config.ts` `experimental.cpus: 4` to avoid exhausting Postgres connections during build.
- **Sentry integration:** `next.config.ts` wraps the config with `withSentryConfig` when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are all present. Local builds without these env vars behave normally. Runtime init in `sentry.server.config.ts` (Node runtime) and `sentry.edge.config.ts` (edge runtime), both gated on `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` being set and `NODE_ENV=production`. `instrumentation.ts` registers the correct Sentry config based on `NEXT_RUNTIME` and exports `onRequestError = Sentry.captureRequestError`.
- **Security headers:** applied in `next.config.ts`. `X-Frame-Options: SAMEORIGIN` is applied to `/portal/**`, `/admin/**`, and `/api/**` but intentionally omitted from `/sites/**` so the visual editor can embed tenant site previews in an iframe cross-origin.

### Railway — Yjs realtime server

`packages/realtime-server/` is a standalone Yjs WebSocket server deployed to Railway. It provides collaborative editing (block editor, pitch decks, email campaigns) and an internal HTTP write channel for MCP fan-out.

- **Config:** `packages/realtime-server/railway.toml`
- **Builder:** Dockerfile (`packages/realtime-server/Dockerfile`)
- **Base image:** `node:20-alpine`
- **Entry point:** `node --enable-source-maps node_modules/.bin/tsx src/server.ts`
- **Default port:** `3030` (overridable via `REALTIME_PORT`; Railway also injects `PORT`)
- **Health check:** `GET /health`, timeout 30 s, restart on failure (max 5 retries)
- **Required env (set in Railway service):**
  - `REALTIME_JWT_SECRET` — shared with the Next.js app
  - `REALTIME_INTERNAL_SECRET` — shared with MCP / internal write channel
  - `DATABASE_URL` — same Postgres instance as the main app; the realtime server writes snapshots to `posts.content`, `pitch_decks.slides`, and `email_campaigns.block_content`
- **nixpacks:** `.nixpacks.toml` at repo root sets `[phases.install] cmds = ["npm ci --legacy-peer-deps"]` for any nixpacks-based builds, but the realtime server uses its own Dockerfile.

### Cloudflare Workers — email inbound

`workers/email-inbound/` is a Cloudflare Worker that receives inbound email, optionally streams attachments to R2, then forwards the parsed payload to the main API.

- **Config:** `workers/email-inbound/wrangler.toml`
- **Entry:** `workers/email-inbound/src/index.ts`
- **Compatibility date:** 2024-09-01
- **Forward target:** `https://www.simplerdevelopment.com/api/email/inbound` (set via `vars.API_URL`)
- **Auth secret:** `INBOUND_EMAIL_SECRET` — set via `wrangler secret put INBOUND_EMAIL_SECRET` (not in config)
- **R2 bucket:** `brain-email-attachments` (binding: `ATTACHMENTS`) — meeting deck PDFs and other attachments sent to `brain+<token>@…` are streamed here; the API stores the R2 key on `brain_meetings.source_metadata`

---

## Cron Inventory

All crons are declared in `vercel.json` and run as Vercel-managed serverless functions. Schedules are UTC.

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/process-embeddings` | `* * * * *` (every minute) | Drain `brain_embedding_jobs` queue, generate pgvector embeddings |
| `/api/cron/process-scheduled-automations` | `* * * * *` (every minute) | Trigger time-based automation rules |
| `/api/cron/plugin-runs-drain` | `* * * * *` (every minute) | Process pending plugin run queue |
| `/api/cron/plugin-jobs-tick` | `* * * * *` (every minute) | Advance plugin job state machine |
| `/api/cron/pm-recurrences` | `*/5 * * * *` (every 5 min) | Materialise recurring kanban cards |
| `/api/cron/process-playbook-waits` | `*/5 * * * *` (every 5 min) | Resume paused Brain playbook runs |
| `/api/cron/drive-sync` | `*/10 * * * *` (every 10 min) | Sync Google Drive changes to Brain |
| `/api/cron/renew-microsoft-subscriptions` | `*/25 * * * *` (every 25 min) | Renew Microsoft Graph change subscriptions |
| `/api/cron/stuck-booking-holds` | `*/30 * * * *` (every 30 min) | Release expired booking holds |
| `/api/cron/process-survey-email-followups` | `*/15 * * * *` (every 15 min) | Send queued survey follow-up emails |
| `/api/cron/booking-reminders` | `0 * * * *` (every hour) | Send booking reminder notifications |
| `/api/cron/ticket-sla-breaches` | `7 * * * *` (every hour at :07) | Flag SLA-breaching support tickets |
| `/api/cron/expire-mcp-pendings` | `17 3 * * *` (daily 03:17 UTC) | Expire stale MCP approval links |
| `/api/cron/renew-gmail-watches` | `47 3 * * *` (daily 03:47 UTC) | Renew Gmail push notification watches |
| `/api/cron/renew-drive-watches` | `13 4 * * *` (daily 04:13 UTC) | Renew Google Drive push notification watches |
| `/api/cron/resend-usage-sync` | `15 4 * * *` (daily 04:15 UTC) | Sync Resend email usage to billing meters |
| `/api/cron/usage-rollup` | `45 4 * * *` (daily 04:45 UTC) | Roll up usage events into billing periods |
| `/api/cron/brain-12` | `30 7 * * *` (daily 07:30 UTC) | Brain daily digest / 12-item summary |
| `/api/cron/brain-daily-notes` | `5 6 * * *` (daily 06:05 UTC) | Generate Brain daily note templates |
| `/api/cron/brain-empty-old-trash` | `15 7 * * *` (daily 07:15 UTC) | Permanently delete old Brain trash items |
| `/api/cron/failing-automations-notify` | `0 12 * * *` (daily 12:00 UTC) | Notify on consistently failing automations |
| `/api/cron/pm-column-snapshots` | `55 23 * * *` (daily 23:55 UTC) | Snapshot kanban column card counts for analytics |
| `/api/cron/surveys-zero-responses` | `30 10 * * 1` (Mon 10:30 UTC) | Alert on surveys with zero responses |
| `/api/cron/stale-crm-deals` | `0 11 * * 1` (Mon 11:00 UTC) | Flag CRM deals with no recent activity |
| `/api/cron/magamommy-weekly-drop` | `0 14 * * 1` (Mon 14:00 UTC) | Publish weekly Magamommy content drop |

---

## Environment Boundaries and Safety Rails

### Staging vs production databases

`scripts/verify-db-target.ts` is prepended to `bun run db:migrate` and `bun run db:push`. It reads `DATABASE_URL` and refuses destructive commands if the URL matches known prod host substrings (`tramway.proxy.rlwy.net:43167` or `metro.proxy.rlwy.net:25565`) or if `RAILWAY_ENVIRONMENT_NAME=production`. The check can be bypassed with `ALLOW_PROD=1`.

Staging points at `nozomi.proxy.rlwy.net`. `.env.local` must use `override: true` when loading — without it, bun's pre-injected `.env` value silently wins.

**Vercel deploy does NOT run migrations.** Before merging staging → main, the new migration SQL must be hand-applied against the metro (prod) Postgres. The Drizzle migration tracker is also currently out of sync with disk in prod.

### Sentry environments

`sentry.server.config.ts` and `sentry.edge.config.ts` both read `SENTRY_ENVIRONMENT` (falling back to `NODE_ENV`) and only enable themselves when `NODE_ENV=production`. Traces are sampled at 10% by default (overridable via `SENTRY_TRACES_SAMPLE_RATE`).

---

## Build Pipeline Summary

```
bun install --frozen-lockfile
next build
  └─ Sentry plugin (source map upload + release tracking) — only when SENTRY_AUTH_TOKEN + ORG + PROJECT set
  └─ tsc --noEmit runs in pre-push hook / CI (not in-build — OOM risk on 357k-line repo)
```

---

## Related Notes

- [[Cron Jobs & Workers]]
- [[Deployment]]
- [[Chat, Realtime & Voice]]
