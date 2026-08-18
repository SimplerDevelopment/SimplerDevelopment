---
type: runbook
domain: operations
status: active
date: 2026-06-09
sources:
  - vercel.json
  - lib/db/schema/cronHealth.ts
  - workers/email-inbound/wrangler.toml
  - workers/email-inbound/README.md
  - packages/realtime-server/railway.toml
  - packages/realtime-server/src/server.ts
---

# Cron Jobs & Workers

## Vercel cron jobs

All crons are defined in `vercel.json`. They hit Next.js API routes on the production deployment. The `CRON_SECRET` env var guards each handler — Vercel injects it as a header; handlers verify it before executing.

Health tracking: every cron handler upserts into the `cron_health` table (schema at `lib/db/schema/cronHealth.ts`). Dashboard: `/admin/system-health`.

### Cron inventory

| Path | Schedule (UTC) | Purpose |
|---|---|---|
| `/api/cron/process-embeddings` | every minute | Process Company Brain embedding backlog |
| `/api/cron/process-scheduled-automations` | every minute | Tick scheduled automation workflows |
| `/api/cron/plugin-runs-drain` | every minute | Drain pending plugin run queue |
| `/api/cron/plugin-jobs-tick` | every minute | Advance plugin job state machine |
| `/api/cron/pm-recurrences` | every 5 minutes | Create recurring PM tasks |
| `/api/cron/process-survey-email-followups` | every 15 minutes | Send survey follow-up emails |
| `/api/cron/process-playbook-waits` | every 5 minutes | Advance playbook wait steps |
| `/api/cron/renew-microsoft-subscriptions` | every 25 minutes | Renew Microsoft Graph webhook subscriptions |
| `/api/cron/stuck-booking-holds` | every 30 minutes | Release expired booking holds |
| `/api/cron/drive-sync` | every 10 minutes | Sync Google Drive changes |
| `/api/cron/booking-reminders` | top of every hour | Send booking reminder emails |
| `/api/cron/ticket-sla-breaches` | :07 every hour | Flag tickets that breached SLA |
| `/api/cron/surveys-zero-responses` | 10:30 Mon | Alert on surveys with zero responses |
| `/api/cron/stale-crm-deals` | 11:00 Mon | Flag stale CRM pipeline deals |
| `/api/cron/example-weekly-drop` | 14:00 Mon | Weekly content drop |
| `/api/cron/failing-automations-notify` | 12:00 daily | Notify on persistently failing automations |
| `/api/cron/brain-agent-per-tenant` | 07:30 daily | Per-tenant Brain agent processing |
| `/api/cron/brain-daily-notes` | 06:05 daily | Generate brain daily summary notes |
| `/api/cron/brain-empty-old-trash` | 07:15 daily | Purge old trashed brain items |
| `/api/cron/expire-mcp-pendings` | 03:17 daily | Expire stale MCP pending approvals |
| `/api/cron/renew-gmail-watches` | 03:47 daily | Renew Gmail push notification watches |
| `/api/cron/renew-drive-watches` | 04:13 daily | Renew Google Drive push notification watches |
| `/api/cron/resend-usage-sync` | 04:15 daily | Sync email usage from Resend to billing |
| `/api/cron/usage-rollup` | 04:45 daily | Roll up usage counters into billing records |
| `/api/cron/pm-column-snapshots` | 23:55 daily | Snapshot PM board column state for reporting |

### Checking cron health

```sql
-- Most recent run + last error for every cron job
SELECT name, last_run_at, last_success_at, last_error, last_error_at, run_count
FROM cron_health
ORDER BY last_run_at DESC NULLS LAST;
```

Or visit `/admin/system-health` in the portal.

### Manually triggering a cron (staging only)

```bash
curl -X POST https://staging.simplerdevelopment.com/api/cron/<job-name> \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Cloudflare email worker — `sd-email-inbound`

**What it does:** Catches all inbound mail to `*@simplerdevelopment.com` via Cloudflare Email Routing, parses MIME, streams attachments to an R2 bucket (`brain-email-attachments`), and POSTs a JSON payload to `https://www.simplerdevelopment.com/api/email/inbound`. The API dispatches on recipient address: `brain+<token>@...` ingests into Company Brain; other addresses route to the AI chat assistant.

**Where deployed:** Cloudflare Workers — worker name `sd-email-inbound`.

**Code:** `workers/email-inbound/`

**Config:** `workers/email-inbound/wrangler.toml`

### Deploying / updating

```bash
cd workers/email-inbound
npm install

# First deploy only — create R2 bucket and set secret
npx wrangler r2 bucket create brain-email-attachments
npx wrangler secret put INBOUND_EMAIL_SECRET   # must match INBOUND_EMAIL_SECRET in Next.js env

# Every subsequent deploy
npx wrangler deploy
```

### Checking health

```bash
# Wrangler tail streams live worker logs
cd workers/email-inbound
npx wrangler tail
```

In the Cloudflare dashboard: Workers & Pages > sd-email-inbound > Logs.

### Shared secret rotation

Both sides must be rotated together atomically:
1. Generate a new value: `openssl rand -base64 32`
2. Set in Vercel env (`INBOUND_EMAIL_SECRET`) and redeploy Next.js app.
3. `npx wrangler secret put INBOUND_EMAIL_SECRET` and redeploy worker.

---

## Railway realtime server — `@simplerdevelopment/realtime-server`

**What it does:** Yjs WebSocket collaboration server. Holds one `Y.Doc` per `(entityType, entityId)` pair in memory. Provides debounced Postgres snapshot persistence (writes to `posts.content`, `pitch_decks.slides`, `email_campaigns.block_content`). Also exposes an internal HTTP channel (`POST /internal/apply`) for MCP fan-out.

**Where deployed:** Railway — service built from `packages/realtime-server/` via its `Dockerfile`.

**Config:** `packages/realtime-server/railway.toml`

### Required env (set in Railway service)

| Variable | Purpose |
|---|---|
| `REALTIME_JWT_SECRET` | verifies WebSocket handshake tokens (shared with Next.js app) |
| `REALTIME_INTERNAL_SECRET` | guards `POST /internal/apply` endpoint (shared with Next.js app) |
| `DATABASE_URL` | same Postgres instance as the main app |

### Checking health

```bash
curl https://<RAILWAY_PUBLIC_DOMAIN>/health
# Expected: { "ok": true, "docs": <N> }
```

Or from the Railway dashboard: service logs + the `/health` healthcheck (configured in `railway.toml` with 30 s timeout, `ON_FAILURE` restart, max 5 retries).

### Deploying updates

Push to the branch Railway tracks (configured in Railway service settings). Railway rebuilds via the Dockerfile automatically.

To redeploy manually: Railway dashboard > realtime-server service > Redeploy.
