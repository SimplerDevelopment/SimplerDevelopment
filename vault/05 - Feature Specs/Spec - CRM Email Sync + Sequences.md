---
type: spec
domain: crm
status: in-progress
date: 2026-06-22
sources:
  - app/api/portal/crm/contacts/[id]/send-email/route.ts
  - app/api/portal/crm/contacts/[id]/emails/route.ts
  - lib/db/schema/crm.ts
  - lib/brain/ingest-gmail-message.ts
  - lib/brain/classify-crm.ts
  - lib/google/gmail-watch.ts
  - lib/google/gmail-history.ts
  - app/api/google-webhook/pubsub/route.ts
  - lib/db/schema/surveys.ts
  - app/api/cron/process-survey-email-followups/route.ts
  - lib/automation/event-bus.ts
  - lib/microsoft/scopes.ts
---

# Feature: CRM Email Sync + Sequences

## Overview

Two related but separable capabilities that close the most-cited CRM gap (the "most-used CRM surface" per [[Competitive Gap Analysis 2026-06]] — HubSpot / Salesforce / Close baseline):

1. **Two-way email sync** — a real per-contact/per-deal email *thread* (inbound + outbound messages stitched together), not just disconnected activity-log rows.
2. **Sequences / cadences** — multi-step, delay-scheduled outbound email series a contact is enrolled in (manually or by an automation trigger), with halt-on-reply.

These are sequenced so Part 2 builds on Part 1 (reply detection needs inbound threads). Both reuse existing infrastructure heavily — this is largely *wiring proven primitives together*, not greenfield.

## Domain context

Read first: [[CRM E2E Audit]]. What already exists (verified 2026-06-22 against `dev`):

- **Outbound:** `contacts/[id]/send-email` sends via Resend and logs a `crm_activities` row (`type='email'`). `contacts/[id]/emails` reads those email-type activities. There is **no thread model** — no direction, no message id, no in/out linkage.
- **Inbound (Gmail):** full watch infra — `gmail-watch.ts` / `gmail-history.ts` / pubsub webhook (`app/api/google-webhook/pubsub`) / `renew-gmail-watches` cron. Inbound messages are ingested into `brain_meetings` via `ingest-gmail-message.ts`; `classify-crm.ts` auto-upserts the CRM contact and logs an activity when `autoLinkCrm=true`. **Gmail inbound already lands in the CRM as an activity — it is not yet threaded.**
- **Outlook/Microsoft:** only Teams-transcript scopes exist (`lib/microsoft/scopes.ts`); **no `Mail.Read`/`Mail.Send`** — Outlook email is greenfield.
- **Cadence precedent (mirror this):** `survey_email_sequences` + `survey_email_sequence_sends` (idempotent unique `(sequenceId, responseId)` + `onConflictDoNothing`) + the `process-survey-email-followups` cron. This is the exact delay-step + idempotent-send + cron-tick pattern to copy for CRM sequences.
- **Auto-enrollment trigger:** the automation event-bus (`emitEvent(event, clientId, …)` / `onEvent`) already emits `crm.contact.created`, deal events, etc. — the hook for "enroll on event."
- **Tenancy:** every new table keyed by `clientId`; no cross-tenant rows.

## Problem

Sales users can't see a contact's email conversation in one place (inbound and outbound live in different systems / unthreaded activity rows), and there is no way to run a timed multi-touch outreach sequence from the CRM. Both are table-stakes for the "most-used CRM surface."

## Goal

- A contact (and deal) detail view shows a unified, chronological email **thread** — inbound (Gmail) + outbound — with subject/from/to/sentAt/direction.
- Staff can enroll a contact in a **sequence**: an ordered set of steps, each with a delay and optional send-condition; a cron sends due steps idempotently and **halts the sequence when the contact replies** or unsubscribes.
- Sequences can also auto-enroll via an automation event (e.g. `crm.contact.created`, deal stage change).

## Design

### Part 1 — Two-way email threads (Gmail first)

New table `crm_email_messages` (keyed by `clientId`, linked to `contactId` + optional `dealId`):

```
crm_email_messages
  id, clientId, contactId, dealId?,
  direction: 'inbound' | 'outbound',
  providerMessageId (Gmail message id / Resend id), threadKey (Gmail threadId or RFC Message-ID root),
  fromEmail, toEmail, subject, snippet, bodyText?, sentAt,
  createdAt
  UNIQUE (clientId, providerMessageId)   -- idempotent ingest
```

- **Inbound:** extend the existing Gmail ingest path (`ingest-gmail-message` → `classify-crm`) to ALSO upsert a `crm_email_messages` row (direction=inbound) against the matched contact, carrying Gmail `threadId`. No new polling — reuse the watch/pubsub pipeline.
- **Outbound:** in `contacts/[id]/send-email`, after the Resend send, also insert a `crm_email_messages` row (direction=outbound) with the Resend id + the same `threadKey` when replying. (Keep the existing activity-log write for backwards compat, or migrate the reader.)
- **Read API + UI:** `GET /api/portal/crm/contacts/[id]/thread` (and deal variant) returns messages ordered by `sentAt`. Portal renders the thread on the contact/deal page.

### Part 2 — Sequences / cadences

Mirror the survey-sequence tables exactly, at the CRM/contact grain:

```
crm_sequences          id, clientId, name, enabled, createdBy, timestamps
crm_sequence_steps     id, sequenceId, stepOrder, delayHours, subject, bodyHtml, conditionField?, conditionValue?, enabled
crm_sequence_enrollments
                       id, clientId, sequenceId, contactId, status('active'|'completed'|'halted'|'unsubscribed'),
                       currentStep, enrolledAt, lastSentAt?, haltedReason?
                       UNIQUE (sequenceId, contactId)   -- one active enrollment per contact per sequence
crm_sequence_sends     id, enrollmentId, stepId, sentAt, resendEmailId?, error?
                       UNIQUE (enrollmentId, stepId)     -- idempotency guard (mirrors survey_email_sequence_sends)
```

- **Cron** `app/api/cron/process-crm-sequences` mirrors `process-survey-email-followups`: for each `active` enrollment, if the next step's `delayHours` has elapsed since `enrolledAt`/`lastSentAt`, send via Resend, INSERT a `crm_sequence_sends` row (`onConflictDoNothing`), advance `currentStep`; mark `completed` when steps run out.
- **Halt-on-reply:** when Part 1 ingests an inbound message from an enrolled contact, flip matching `active` enrollments to `halted` (`haltedReason='replied'`). This is the dependency that orders Part 1 before Part 2.
- **Enrollment:** `POST /api/portal/crm/sequences/[id]/enroll` (manual) + an event-bus handler that auto-enrolls on configured events (reuse the `onEvent` pattern the site-webhooks dispatcher just established).
- **Unsubscribe:** honor the existing email unsubscribe surface; flip enrollment to `unsubscribed`.

## Phasing

- **Phase 1 — Gmail email threads** ✅ SHIPPED 2026-06-22 (c2c0886c): `crm_email_messages` table + migration, inbound wire (Gmail ingest → contact-email match), outbound wire (send-email), `GET …/contacts/[id]/thread`. (Thread *UI* + the outbound *send* e2e — blocked by Resend sandbox — remain as small follow-ups.)
- **Phase 2 — Sequences** (4 tables + cron + enroll API + event-bus auto-enroll + halt-on-reply). Mirrors survey sequences; depends on Phase 1 for reply detection.
- **Phase 3 — Outlook** (add `Mail.Read`/`Mail.Send` scopes + a Graph sync/send worker mirroring the Gmail pipeline). Greenfield; lowest priority.

## Key decisions (ADR-style)

- **Outbound channel = Resend (platform-sent), not send-as-the-user, in Phase 1–2.** Rationale: the current `send-email` already uses Resend; send-as-user requires `gmail.send`/`Mail.Send` scopes + per-user token send paths. "Two-way sync" is satisfied by *threading* inbound+outbound; true send-as-user is a Phase 3+ enhancement. **Open for confirmation.**
- **Reuse the survey-sequence pattern verbatim** rather than generalizing a shared sequence engine — matches the codebase's per-domain webhook/sequence precedent (survey vs project vs the new site webhooks); a shared engine is a later refactor if a third consumer appears.
- **Outlook deferred to Phase 3** — no Mail scopes today; not worth blocking Gmail value on it.
- **Sequences mirror, not extend, `survey_email_sequences`** (separate tables) — same reasoning as the webhook surfaces.

## Open questions (need a decision before/while building)

1. **Outbound identity:** Resend platform-send (recommended Phase 1–2) vs. send-as-the-connected-Gmail-user. Affects scopes + deliverability.
2. **Thread storage:** dedicated `crm_email_messages` (recommended) vs. extending `crm_activities` with thread columns. Dedicated keeps the activity feed clean and the thread query fast.
3. **Auto-enroll triggers:** which events seed enrollments by default (contact.created? deal stage → "nurture"?), and is enrollment config per-sequence UI or automation-rule-driven?
4. **Sending limits / throttling** per tenant (deliverability + abuse) — reuse any existing campaign send-rate guard?

## Verification plan

- Phase 1: integration test for inbound ingest → `crm_email_messages` upsert (idempotent on re-delivery); e2e for outbound send → thread row + `GET …/thread`; tenancy gate (new data-access).
- Phase 2: unit test for the cron due-calculation + idempotency (mirror `route-survey-email-sequences` / the survey cron tests); e2e for enroll → cron tick → send row → halt-on-reply; tenancy gate.
- Both: `--retries=0` determinism + cross-tenant 404s, matching this session's gap-coverage specs.
