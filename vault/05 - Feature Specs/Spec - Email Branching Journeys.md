---
type: spec
domain: email
status: proposed
date: 2026-06-22
sources:
  - lib/db/schema/email.ts
  - lib/db/schema/surveys.ts
  - lib/automation/engine.ts
  - lib/automation/event-bus.ts
  - lib/automation/schedule.ts
  - lib/email/index.ts
  - lib/email/campaign-send.ts
  - app/api/cron/process-scheduled-automations/route.ts
  - app/api/cron/process-survey-email-followups/route.ts
  - app/api/portal/email/campaigns/[id]/send/route.ts
---

# Feature: Email Branching Journeys + Deliverability Testing + Embedded Signup Forms

## Overview

Extend the existing email marketing stack with three complementary capabilities: (1) branching/drip journey automation that enrolls subscribers and advances them through timed, conditional steps using a cron-driven model already proven in `surveyEmailSequences`; (2) deliverability testing via an external seed-list service that grades inbox/spam placement before a campaign sends; (3) embeddable public signup forms that feed `email_lists` directly without a portal login.

## Domain context

Read first: [[Email Campaigns E2E Audit]]. The existing schema in `lib/db/schema/email.ts` provides: `emailLists`, `emailSubscribers` (status: active/unsubscribed/bounced/complained), `emailCampaigns` (A/B, scheduled, block-rendered), `emailCampaignSends` (per-subscriber send audit with openedAt/clickedAt), `emailTemplates`, `emailSegments` (rule-based), and `emailRenders` (sha256-keyed render cache). Resend is wired as a lazy proxy in `lib/email/index.ts`; actual dispatch runs through `lib/email/campaign-send.ts`.

A linear delay-only sequence pattern already exists in `lib/db/schema/surveys.ts` (`surveyEmailSequences` / `surveyEmailSequenceSends`) and its cron in `app/api/cron/process-survey-email-followups/route.ts`. The automation engine in `lib/automation/engine.ts` handles event-driven + scheduled rule execution; `lib/automation/event-bus.ts` is fire-and-forget in-process pub/sub; `app/api/cron/process-scheduled-automations/route.ts` uses a CAS/next_run_at claim model to prevent double-firing across concurrent workers. The CRM sequences shipped this session (`crmSequences`/`crmSequenceSteps`/`crmSequenceEnrollments`/`crmSequenceSends` in `lib/db/schema/crm.ts`) are the closest existing drip-enrollment precedent — the email journey runtime should mirror that enrollment/advance model.

No journey, drip-enrollment, or branching tables exist yet. No deliverability-testing or embedded-form tables exist yet.

## Problem

- Email campaigns are one-shot blasts. There is no way to enroll a subscriber into a multi-step timed sequence with conditional branching (e.g. "if opened step 2, send path A; otherwise path B after 3 days").
- There is no pre-send inbox/spam placement check. A client can send to 10k subscribers without knowing the email will land in spam.
- List growth requires a portal login to add subscribers. There is no public-facing embeddable signup widget for client websites.

## Goal

1. **Journeys**: trigger → ordered steps with per-step delays and optional open/click/no-engage branch conditions, driven by an enrollment table and a per-minute cron that advances ready enrollments. Reuse the CAS-claim advance pattern from `process-scheduled-automations` and the enrollment shape from the CRM sequences.
2. **Deliverability testing**: pre-send "inbox preview" that sends to a seed list via an external provider and returns inbox/spam placement scores. Stubbed behind a feature flag; real provider wired in Phase 2.
3. **Embedded forms**: per-list public signup form (UUID-keyed embed) rendered as a `<script>` snippet or `<iframe>` that POSTs to a public API route; double-opt-in optional.

## Design

### Phase 1 — Journeys (local-buildable)

New tables in `lib/db/schema/email.ts`:

- `emailJourneys` — id, clientId, name, description, status (draft|active|paused|archived), triggerType ('event'|'manual'|'list_join'), triggerConfig (json: { event?, listId?, filters? }), createdBy, timestamps.
- `emailJourneySteps` — id, journeyId, stepOrder (int, 0-based), stepType ('email'|'wait'|'condition'|'tag'|'exit'), config (json: EmailStepConfig | WaitConfig{delayHours} | ConditionConfig{metric:'opened'|'clicked'|'no_engage', windowHours, yesStepOrder, noStepOrder}).
- `emailJourneyEnrollments` — id, journeyId, subscriberId, clientId, status ('active'|'completed'|'exited'|'error'), currentStepOrder, nextRunAt (timestamptz), enrolledAt/completedAt; unique (journeyId, subscriberId).
- `emailJourneyStepSends` — id, enrollmentId, stepId, subscriberId, resendEmailId, sentAt/openedAt/clickedAt; unique (enrollmentId, stepId) for idempotency.

New cron `app/api/cron/process-journey-enrollments/route.ts` (every minute): query `status='active' AND nextRunAt <= now()` (limit 200), CAS-claim by bumping `nextRunAt` before processing, execute the current step (email → dispatch via `campaign-send`; wait → `nextRunAt = now()+delayHours`; condition → read step-send open/click and rewrite `currentStepOrder`; exit → `completed`). Per-enrollment error isolation.

Enrollment triggers: `list_join` (subscriber-add emits `email.subscriber.joined` → an `onEvent` handler in a new `lib/email/journey-engine.ts` inserts enrollments for matching active journeys); `event` (engine's processEvent path); `manual` (POST `/api/portal/email/journeys/[id]/enroll`). Portal CRUD routes for journeys/steps/enroll/analytics, `{success,data|error}` envelope, `authorizePortal` tenant scoping.

### Phase 2 — Deliverability testing (external dependency)

Provider: GlockApps or Mail-Tester seed-list API, behind `DELIVERABILITY_PROVIDER_API_KEY` (absent = disabled). New table `emailDeliverabilityChecks` (clientId, campaignId?, status, provider, providerCheckId, score, inbox/spam/missing counts, reportUrl, rawResult). Routes: POST submit, GET poll. Campaign send UI shows a non-blocking warning when score < 70.

### Phase 3 — Embedded signup forms (local-buildable)

New table `emailSignupForms` (clientId, listId, name, embedKey uuid unique, fields json, doubleOptIn, confirmation subject/html, redirectUrl, brandingProfileId?, enabled). Routes: portal CRUD; public `POST /api/public/email/signup/[embedKey]` (no auth — validate key, upsert subscriber, optional double-opt-in send, emit `email.subscriber.joined`); confirm route; `embed.js` snippet + an `app/s/signup/[embedKey]` iframe page. IP rate-limit (in-memory per instance); the `(listId,email)` unique index is the hard idempotency guard.

## Phasing

- **Phase 1** — journey tables + cron + engine + portal CRUD + analytics. No external dep. Gate: `bun test:tenancy` + integration on the advance cron + e2e on enroll/advance.
- **Phase 2** — deliverability check table + provider API. External (GlockApps/Mail-Tester); stub returns score=85 in test.
- **Phase 3** — signup form table + public API + embed. No external dep.

## Key decisions (ADR-style)

- **Separate journey tables, mirror the CRM-sequence enrollment/advance runtime** rather than mutate `surveyEmailSequences` (which is flat/linear, no branching). CAS-claim on `nextRunAt` copied from `process-scheduled-automations`.
- **Steps as ordered rows + integer branch targets** (condition step's `yesStepOrder`/`noStepOrder`) for a simple v1; full DAG is a later upgrade.
- **Deliverability provider decision deferred** behind a stub so Phase 1 ships without it.
- **Public signup rate-limit = in-memory per instance** for v1; the unique index is the real guard.

## Open questions

1. Allow journey re-enrollment (same subscriber re-enters after completing)? If yes, drop the unique index, guard on `completedAt`.
2. Deliverability provider: GlockApps vs Mail-Tester vs Litmus (API availability + cost).
3. Double-opt-in confirmation emails — per-site branded template vs hardcoded?
4. Emit `email.subscriber.joined` from the existing portal subscriber-add route too, so journeys trigger from imported subscribers?

## Verification plan

- Phase 1: integration — 2-step journey (wait 0h → email), enroll, run cron, assert step-send + completion; condition branch test (mark openedAt → advances to yes-branch); tenancy (cross-tenant enroll → 403); `bun test:critical` for CRUD + cron 200 shape.
- Phase 2: stub provider returns score; assert check row pending→complete; real provider behind `it.skipIf(env absent)`.
- Phase 3: public signup inserts subscriber (idempotent on dup, 404 on bad key); double-opt-in pending→active→event emitted; e2e embed render + submit.
