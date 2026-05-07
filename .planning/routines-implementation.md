# Operational Routines — Implementation Status

_Last updated: 2026-05-06. Source of truth: this file plus the linked PRs._

This document captures what's been scaffolded as part of the operational-routines initiative — recurring checks, monitors, alerts, and Claude-driven content generation that run on schedules without manual prompting.

## Pull requests

| Repo | PR | Branch | Target |
|---|---|---|---|
| `DanielPCoyle/simplerdevelopment` | [#11](https://github.com/DanielPCoyle/simplerdevelopment/pull/11) | `feat/github-actions-routines` | `staging` |
| `DanielPCoyle/postcaptain-kb` | [#1](https://github.com/DanielPCoyle/postcaptain-kb/pull/1) | `feat/claude-judgment-routines` | `main` |

Worktree for the sd-side work: `/Users/dancoyle/simplerdevelopment-routines`. Remove with `git worktree remove` once PR #11 lands.

## Two architectural tracks

The routines split cleanly along audience:

- **Track A — SD-internal:** GitHub Actions in `simplerdevelopment` repo. Surface platform health and findings to SimplerDevelopment (the operator). Use the `setup-sd2026` composite action and `CLAUDE_CODE_OAUTH_TOKEN` secret. Path-scoped to `simplerdevelopment2026/**` so they don't trigger on `workfriends.ai` / `websocket-server` changes.
- **Track B — tenant-facing:** Vercel-cron handlers under `app/api/cron/<name>/route.ts`. Run inside the Next.js app context, write to each tenant's `crm_notifications` inbox via `notifyAllClientUsers` / `createCrmNotification`. Registered in `simplerdevelopment2026/vercel.json`. Activate on next deploy after merge.

Plus a Claude-judgment subset (Track C in spirit) that lives in `postcaptain-kb` because it operates on vault data.

## Infrastructure

- **Composite action** `simplerdevelopment/.github/actions/setup-sd2026/action.yml` — Bun + frozen-lockfile install + optional Playwright. Reused by every Track A workflow.
- **Secrets:**
  - `CLAUDE_CODE_OAUTH_TOKEN` set on both repos (Claude Max subscription token; bills against subscription rate limit, not pay-per-token API).
  - **Required to add before scheduled routines fire:** `DATABASE_URL_READONLY`, `RESEND_API_KEY`, `DIGEST_TO_EMAIL`, `STRIPE_SECRET_KEY`. See "Required follow-ups" below.

## Routines

### Track A — SD platform CI gates (5 workflows)

| Workflow | Trigger | Status |
|---|---|---|
| `sd2026-claude-smoke` | PR (temp) + dispatch | ✅ verified — proves OAuth wiring |
| `sd2026-tenancy` | dispatch only | ⚠ gated — migration drift blocks auto-trigger |
| `sd2026-claude-security-review` | PR on auth/billing/Stripe paths | ✅ wiring verified (skipped first-PR validation) |
| `sd2026-drizzle-drift` (schema sync) | PR + daily | ✅ verified |
| `sd2026-drizzle-drift` (prod tracker) | daily | ⏳ needs `DATABASE_URL_READONLY` |

The tenancy gate is parked because the on-disk drizzle migration set jumps `0003 → 0070` (schema changes have been hand-applied in prod), so `bun run db:migrate` fails on a fresh CI database. To re-enable per-PR auto-trigger, either:
- Regenerate the migration set from `lib/db/schema.ts` (squash the gaps), or
- Refactor `tests/helpers/test-db.ts:applyTestSchema()` to use `drizzle-kit push` instead of replaying `*.sql`.

### Track A — SD-internal monitoring (5 workflows)

| Workflow | Schedule | Recipient | Required secrets |
|---|---|---|---|
| `sd2026-stripe-webhook-health` | hourly :17 | SD via Resend | `STRIPE_SECRET_KEY`, `DATABASE_URL_READONLY`, `RESEND_API_KEY`, `DIGEST_TO_EMAIL` |
| `sd2026-embeddings-backlog` | hourly :23 | SD via Resend | DB readonly, Resend |
| `sd2026-failing-automations-digest` | daily 13:07 UTC | SD via Resend | DB readonly, Resend |
| `sd2026-dependency-audit` | weekly Mon + per-PR | GH issue (deduped) | none — uses `GITHUB_TOKEN` |
| `sd2026-block-controls-drift` | weekly Mon + per-PR | GH issue (deduped) | none |

Companion scripts under `simplerdevelopment2026/scripts/routines/`:
- `stripe-webhook-health.ts`
- `embeddings-backlog.ts`
- `failing-automations-digest.ts`
- `block-controls-drift.ts`
- `check-drizzle-tracker-drift.ts` (used by the drift workflow's daily job)

The CVE audit and block drift workflows already work — they only need `GITHUB_TOKEN` (auto-provided).

### Track B — tenant-facing in-app crons (4 routes)

| Cron route | Schedule (UTC) | Recipient | Mutation |
|---|---|---|---|
| `app/api/cron/failing-automations-notify` | daily 12:00 | all members of affected client | `crm_notifications` insert only |
| `app/api/cron/surveys-zero-responses` | Mon 10:30 | survey owner | `crm_notifications` insert only |
| `app/api/cron/stale-crm-deals` | Mon 11:00 | deal owner (fallback to `clients.userId`) | `crm_notifications` insert only |
| `app/api/cron/stuck-booking-holds` | every 30 min | booking-page owner | **none — preview mode** |

All four follow the existing `process-embeddings` cron pattern: `x-vercel-cron` header check + `CRON_SECRET` Bearer fallback, `dynamic = 'force-dynamic'`, `runtime = 'nodejs'`. Each enforces per-entity dedupe via lookback against `crm_notifications` so chronic conditions don't spam.

Stuck-booking-holds is intentionally preview-only — it detects but does not auto-cancel inventory. Auto-release is a follow-up after the detection has been observed in production.

Unit tests included for 3 of 4 (the booking handler is mostly SQL — covering it would mostly test mocks).

### Track A/C — Claude judgment (3 workflows)

| Workflow | Repo | Schedule | Output |
|---|---|---|---|
| `sd2026-audit-doc-decay` | `simplerdevelopment` | 1st of Mar/Jun/Sep/Dec, 14:00 UTC | GH issue (deduped 30d) |
| `weekly-competitor-pulse` | `postcaptain-kb` | Mon 13:00 UTC | `discoveries/YYYY-MM-DD-competitor-<slug>.md` |
| `weekly-blog-draft` | `postcaptain-kb` | Wed 13:00 UTC | `drafts/YYYY-MM-DD-<slug>.md` |

The two kb workflows include vendored skills under `postcaptain-kb/.claude/skills/` (`research-competitor`, `draft-blog-post`). User-global skills at `~/.claude/skills/` aren't visible to `claude-code-action` in CI; the vendored copies become the source of truth for CI runs.

Both kb workflows have **auto-pick** mode (used by the schedule) and **explicit-input** mode (`workflow_dispatch` with `competitor` or `topic` input):
- competitor auto-pick: oldest-or-missing `discoveries/YYYY-MM-DD-competitor-*.md`
- blog auto-pick: most promising recent discovery, skipping topics already drafted in the last 30 days

Both direct-push to `main`, matching the existing `daily.yml` / `monthly-refresh.yml` convention. The artifacts in `discoveries/` and `drafts/` are themselves drafts — review/edit in Obsidian, revert if Claude went sideways.

`audit-doc-decay` opens a GitHub _issue_ rather than committing — audits are protected files. The issue is a punch list for human follow-up: re-baseline (regenerate the audit) or move stale ones to a `historical/` subfolder.

## Findings surfaced by the routines themselves

- **38 HIGH/CRITICAL CVEs** caught by Trivy on the first scan:
  - `fast-xml-parser@5.2.5` — 1 CRITICAL XSS via DOCTYPE (CVE-2026-25896) + 4 HIGH DoS variants. Fix: ≥ 5.5.6.
  - `@xmldom/xmldom@0.8.11` — 5 HIGH XML injection / DoS. Fix: ≥ 0.9.10.
  - `minimatch@3.1.2` — 2 HIGH DoS via crafted glob patterns. Fix: ≥ 3.1.4.
- **Stripe webhook handler doesn't dedupe** — discovered while wiring webhook health. There is no `stripe_processed_events` table; `app/api/stripe/webhook/route.ts` only writes to `invoices.stripe_checkout_session_id` and `ai_credit_ledger.reference_id`. The routine uses the union of those as a proxy. **This is itself a finding** — webhook idempotency is best practice, worth a separate ticket.
- **Drizzle migration drift confirmed in CI** — see Track A gates above.

## Architectural decisions worth flagging

1. **Track B routines do NOT live in GitHub Actions.** Tenant-facing notifications go through the in-app notification path so they can respect each tenant's preferences, brand profile, and notification settings. GitHub Actions can't route through that path without bypassing the tenancy/branding context.
2. **Vendored skills.** `postcaptain-kb/.claude/skills/` holds copies of `research-competitor` and `draft-blog-post` skills. Source of truth is now the vendored version, not `~/.claude/skills/`. If you edit a skill, sync both copies.
3. **OAuth token, not API key.** `claude-code-action` is configured with `claude_code_oauth_token`, which bills against the Claude Max subscription rate limit instead of pay-per-token API metering. The current secret value is the keychain access token (short-lived); replace with the long-lived output of `claude setup-token` for stable scheduled runs.
4. **Trivy scope.** The CVE audit found vulns in `bun.lock`, `package-lock.json`, and `packages/realtime-server/bun.lock` — `scan-ref: simplerdevelopment2026` did not restrict scanning to the subproject as expected. Either tighten the scope (probably correct: explicitly target `simplerdevelopment2026/bun.lock`) or accept the broader sweep.

## Required follow-ups before any of this is fully live

1. **Replace the OAuth token** with `claude setup-token` output (the keychain access token is short-lived):
   ```bash
   claude setup-token   # paste output below
   echo "PASTE_HERE" | gh secret set CLAUDE_CODE_OAUTH_TOKEN \
     --repo DanielPCoyle/simplerdevelopment
   echo "PASTE_HERE" | gh secret set CLAUDE_CODE_OAUTH_TOKEN \
     --repo DanielPCoyle/postcaptain-kb
   ```
2. **Add the missing secrets** to `DanielPCoyle/simplerdevelopment`:
   ```
   DATABASE_URL_READONLY      # 5 routines depend on this
   RESEND_API_KEY             # 4 routines
   DIGEST_TO_EMAIL            # info@danielpcoyle.com
   STRIPE_SECRET_KEY          # webhook health only
   ```
3. **Address the CVE findings.** Without bumping `fast-xml-parser` / `@xmldom/xmldom` / `minimatch`, the `sd2026-dependency-audit` PR gate fails every PR — including this one.
4. **Merge PR #11 → `staging`** and PR #1 → `main` (postcaptain-kb).
5. **After merge:** remove the temporary `pull_request:` trigger from `sd2026-claude-smoke` so it returns to `workflow_dispatch`-only.
6. **Smoke-test the in-app crons** before they fire on schedule:
   ```bash
   for c in failing-automations-notify surveys-zero-responses \
            stale-crm-deals stuck-booking-holds; do
     echo "=== $c ==="
     curl -s -H "Authorization: Bearer $CRON_SECRET" \
       https://staging.simplerdevelopment.com/api/cron/$c
   done
   ```
   Each should return `{ success: true, data: { scanned, matched, notified, skippedDup, durationMs } }`.
7. **Smoke-test the kb Claude routines**:
   ```bash
   gh workflow run weekly-competitor-pulse.yml \
     --repo DanielPCoyle/postcaptain-kb -f competitor=enrollmentfuel
   gh workflow run weekly-blog-draft.yml \
     --repo DanielPCoyle/postcaptain-kb -f topic="What Slate's pricing model reveals about higher-ed budget priorities"
   ```

## Not implemented

Still open from the original list:
- **Vercel cron heartbeat watchdog** — needs each existing cron handler to write a heartbeat row, plus a GH Action that alerts on staleness.
- **Domain/SSL expiry** — script + DNS lookup, opens issues per expiring site.
- **Stripe Connect onboarding stalls** — script + Resend digest for sites where `chargesEnabled=false` for >7d.

## File index

### `simplerdevelopment-routines` worktree
```
.github/
├── actions/setup-sd2026/action.yml
└── workflows/
    ├── sd2026-claude-smoke.yml
    ├── sd2026-tenancy.yml
    ├── sd2026-claude-security-review.yml
    ├── sd2026-drizzle-drift.yml
    ├── sd2026-stripe-webhook-health.yml
    ├── sd2026-embeddings-backlog.yml
    ├── sd2026-failing-automations-digest.yml
    ├── sd2026-dependency-audit.yml
    ├── sd2026-block-controls-drift.yml
    └── sd2026-audit-doc-decay.yml

simplerdevelopment2026/
├── app/api/cron/
│   ├── failing-automations-notify/route.ts
│   ├── surveys-zero-responses/route.ts
│   ├── stale-crm-deals/route.ts
│   └── stuck-booking-holds/route.ts
├── scripts/routines/
│   ├── check-drizzle-tracker-drift.ts
│   ├── stripe-webhook-health.ts
│   ├── embeddings-backlog.ts
│   ├── failing-automations-digest.ts
│   └── block-controls-drift.ts
├── tests/unit/
│   ├── cron-failing-automations-notify.test.ts
│   ├── cron-stale-crm-deals.test.ts
│   └── cron-surveys-zero-responses.test.ts
└── vercel.json   # 4 new entries appended
```

### `postcaptain-kb` repo
```
.claude/skills/
├── research-competitor/SKILL.md   (vendored)
└── draft-blog-post/SKILL.md       (vendored)
.github/workflows/
├── weekly-competitor-pulse.yml
└── weekly-blog-draft.yml
```

## Counts

- **16 routines total** across 4 batches and 2 repos
- **5** SD platform gates
- **5** SD-internal monitoring
- **4** tenant-facing in-app crons
- **2** kb Claude judgment
- **0** in production yet — every routine is gated on PR merge + secret provisioning
