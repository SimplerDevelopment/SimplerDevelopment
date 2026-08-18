# ADR: internal_jobs is THE background queue — extend it, don't hand-roll a seventh

**Date:** 2026-08-12
**Status:** accepted
**Context:** 2026-08-12 mission "review the codebase for WebRTC / jobs-queue opportunities" (PUX-046, PUX-047, PUX-048 on board 153)

## Context

A full-codebase survey found the repo had grown **six independent hand-rolled
Postgres queues** (brain_embedding_jobs, automation_jobs, registered_app_jobs,
workflow_runs, eval_runs, playbook waits), each re-deriving the same
`FOR UPDATE SKIP LOCKED` / CAS-claim / backoff machinery with slight
variations — plus three workloads with none of that protection:

1. **Email campaign send** — a serial per-recipient Resend loop executed
   inside the request handler (portal route duplicated the whole loop from
   `lib/email/campaign-send.ts`; the MCP tool's description literally said
   "Synchronous — large lists will block the MCP call"). A timeout stranded
   the campaign in `status='sending'`; the scheduled-send cron cancelled a
   campaign on the FIRST transient error.
2. **Automation `delay` action** — `await setTimeout(delay)` inside a
   serverless invocation. The rule builder offers 1d/2d presets; anything
   beyond the function timeout silently never ran.
3. (Noted, not fixed) A/B remainder dispatch in `lib/email/ab-promotion.ts`
   has the same inline-loop shape.

PR #46 had just introduced `internal_jobs` (lease/CAS/backoff/dead-letter,
1-minute drain, dedupe keys) for POD fulfillment — a generalization of the
`automation_jobs` state machine.

## Decision

**`internal_jobs` + `lib/jobs` is the standing queue for internal deferred
work.** New "needs retry / needs delay / must survive the request" workloads
add a job type + handler there instead of a new table + cron + claim loop.
Implemented now (branch `feat/internal-jobs-adoption`, stacked on PR #46):

- `email.campaign_send` — all three producers (portal route, MCP tool's
  approval `apply`, scheduled-send cron) enqueue; the handler runs the
  resume-safe `executeCampaignSend`.
- `automation.delayed_action` — `enqueueJob` grew `runAt` (rides the existing
  dual-purpose `next_retry_at` column; the drain already honored it), and the
  engine defers instead of sleeping.

Two rules that were deliberate, not incidental:

- **Authorization is re-read at fire time, never replayed from the enqueue
  snapshot.** A delayed automation action re-loads the rule (enabled flag +
  current scopes) when it fires; a revocation during a multi-day delay window
  must win. Snapshotting scopes into the payload would be a privilege-escalation
  hole with a fuse as long as the longest delay.
- **Dedupe keys are cleaned up only for TERMINAL rows** (`completed` /
  `dead_letter`) at enqueue. The unique index spans the whole table, so
  without cleanup an entity could never legitimately re-run; deleting only
  terminal rows preserves live-dedupe of concurrent enqueues.

## Rejected

- **A queue library (pg-boss / BullMQ / graphile-worker):** BullMQ needs Redis
  (new infra + spend); pg-boss/graphile duplicate what `internal_jobs` already
  proved in prod via `automation_jobs`, and none of them get us off the
  1-minute Vercel-cron drain cadence anyway (no long-lived worker process in
  this deployment shape).
- **`waitUntil()` / `after()`:** keeps the invocation alive but is
  fire-and-forget with zero retry/durability — exactly the hole that lost POD
  orders. Usable for logging, not for money-adjacent work.
- **Extending `automation_jobs`:** its rows are keyed by AUTOMATION_EVENTS
  names and tenant `site_webhooks` may subscribe with `'*'` — internal job
  payloads would leak to tenant webhook endpoints (PR #46's original
  reasoning; reaffirmed).
- **Consolidating the six existing per-domain queues onto internal_jobs now:**
  they work; a big-bang migration is risk without a driving bug. The decision
  is about NEW work + the two broken paths.

## WebRTC half of the mission (no code shipped, on purpose)

The survey's verdict: **WebRTC already exists here** — the portal voice
assistant (`components/portal/voice/useRealtimeVoice.ts`) is a complete
RTCPeerConnection + getUserMedia + screen-audio implementation against OpenAI
Realtime, tested, and deliberately unmounted. Every other realtime surface
already uses the right transport (chat/inbox/flow-runs/pathviz = SSE over
Postgres LISTEN/NOTIFY; co-editing/presence = Yjs WebSocket via
packages/realtime-server; badges = slow polling, appropriately). There is no
gap WebRTC fills. Re-mounting the voice assistant is a product decision,
parked as PUX-048.

## Consequences

- Adding a background workload = one union member in `lib/db/schema/jobs.ts`
  + one handler entry in `lib/jobs/index.ts` (TS exhaustiveness couples them)
  + an enqueue call. No new table, no new cron.
- Campaign sends and delayed automation actions survive deploys, Resend
  outages, and function timeouts; failures land in `dead_letter` where an
  operator can see them instead of a log line.
- The drain is single-file sequential with `DRAIN_BATCH=50` and
  `maxDuration=60` — a very large campaign makes ~60s of progress per lease
  cycle worst-case. Known ceiling, noted in code; revisit only if real
  campaigns hit it.
- Follow-up candidates recorded on board 153: A/B remainder dispatch
  (`ab-promotion.ts`), HTML asset-import concurrency cap (not queue-shaped —
  it needs a bounded `Promise.all`, ~15 lines).
