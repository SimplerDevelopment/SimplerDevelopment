---
type: spec
domain: surveys
status: proposed
date: 2026-06-22
sources:
  - lib/db/schema/surveys.ts
  - app/api/surveys/[slug]/route.ts
  - lib/stripe/index.ts
  - lib/stripe/site-stripe.ts
  - app/api/public/booking/[slug]/book/route.ts
  - lib/esign/dropbox-sign.ts
  - lib/esign/status-machine.ts
  - lib/mcp/tools/surveys.ts
---

# Feature: Surveys In-Form Payment + E-Signature Fields

## Overview

Add two `SurveyFieldDef` types — `payment` and `esignature` — that gate survey completion behind a Stripe payment and/or a DropboxSign embedded signature. Both block the response from being marked `completedAt` until their external dependency resolves.

## Domain context

Read first: [[Surveys E2E Audit]]. The survey field-type union is `SurveyFieldDef.type` in `lib/db/schema/surveys.ts` (~line 117) — a TypeScript-only union, no Postgres enum, so new field types need no migration on `surveys.fields` (json). Responses store a flat `answers: json` keyed by field id in `survey_responses`; `completedAt` is nullable and set during INSERT by `app/api/surveys/[slug]/route.ts`. No `paymentIntentId`/`signatureRequestId` columns exist. Stripe is used inline via `resolveSiteStripe(websiteId)` (`lib/stripe/site-stripe.ts`) then `stripe.paymentIntents.create(...)` (canonical: the booking book route). DropboxSign: `createSignatureRequest` + `getEmbeddedSignUrl` + `verifyWebhookSignature` in `lib/esign/dropbox-sign.ts`.

## Problem

Forms commonly need to collect a fee (deposit/registration/application) or a legal signature in the same flow. Today both require a separate page or manual follow-up, increasing drop-off.

## Goal

1. `payment` field — Stripe payment (fixed or respondent-entered) tied to the response; not `completedAt` until payment succeeds.
2. `esignature` field — DropboxSign embedded signature bound to the response with an audit trail; not `completedAt` until the webhook confirms signed.

## Design

### Field-type union + config (`lib/db/schema/surveys.ts`)

Add `'payment'` | `'esignature'` to `SurveyFieldDef.type`; add optional `paymentConfig` ({ mode:'fixed'|'respondent_enters', amount?, currency, description? }) and `esignatureConfig` ({ mode:'embedded', documentTitle, documentMessage?, documentUrl? }). No migration for `surveys.fields`.

### `survey_responses` columns (one migration)

`paymentIntentId` varchar, `paymentStatus` varchar ('pending'|'succeeded'|'failed'|null), `signatureRequestId` varchar, `signatureStatus` varchar ('pending'|'signed'|'declined'|null). `completedAt` stays null until all blocking fields resolve.

### New table `survey_response_gate_events`

Audit of gate lifecycle (surveyResponseId fk cascade, type, externalId, payload json, createdAt) — keeps operational state out of `answers`.

### Public submit flow (`app/api/surveys/[slug]/route.ts`)

Two-phase: (A) validate + INSERT, omitting `completedAt` when a payment/esign field is present; (B) gate-init within the same request — payment field ⇒ `resolveSiteStripe` + `paymentIntents.create` (metadata: surveyResponseId/surveyId/clientId), store pending, return `clientSecret`; esign field ⇒ `createSignatureRequest` + `getEmbeddedSignUrl`, store pending, return `signUrl`. New routes: `POST .../payment-confirm`, `GET .../sign-url` (fresh embedded URL), `POST /api/webhooks/stripe/survey` (PI succeeded/failed), `POST /api/webhooks/dropboxsign/survey` (signed/declined, HMAC-verified). `_tryCompleteResponse(responseId)` sets `completedAt` only when all gates pass, then fires the existing `survey.response_submitted` event/webhooks. Frontend renderer mounts a Stripe PaymentElement / DropboxSign iframe in a post-submit modal.

### MCP

`surveys_create`/`surveys_update` in `lib/mcp/tools/surveys.ts`: add the two field types to the description string (no schema change).

## Phasing

- **Phase 1 (local — existing keys)** — columns + gate-events table + union/config + two-phase handler + `_tryCompleteResponse` + confirm/sign-url routes + Stripe & DropboxSign survey webhooks + portal field-builder options.
- **Phase 2 (external-gated)** — drawn/typed signature mode (canvas → base64, no provider call; needs legal review); per-tenant Stripe Connect onboarding gate.
- **Phase 3** — respondent-entered amount UI; payment retry; signature certificate/PDF embed.

## Key decisions (ADR-style)

- **Gate state as columns + `survey_response_gate_events`**, not in `answers` (operational vs respondent data; enables "pending payments?" queries).
- **`completedAt` gates completion** — reuses existing semantics; avoids a new status enum; webhooks/sequences only fire on true completion. Risk: dangling pending responses ⇒ a 24h expiry sweep.
- **Reuse `resolveSiteStripe` + inline PaymentIntent** (matches booking).
- **DropboxSign embedded mode only in Phase 1** (functions already exist); drawn signatures need legal sign-off.
- **Separate Stripe + DropboxSign webhook routes** (different verification).

## Open questions

1. Require `requireEmail` when a payment field is present (for receipt email)?
2. Expiry policy for `pending` payment/signature responses — 24h sweep proposed.
3. Multi-page surveys: gate only at the last page, or allowed on an intermediate page?
4. Per-tenant DropboxSign sub-account vs platform master key (quota)?
5. `resolveSiteStripe` fallback for surveys not tied to a `siteId`?

## Verification plan

- Integration: POST with payment field ⇒ completedAt null, PI stored pending; `/payment-confirm` (stub `paymentIntents.retrieve` succeeded) ⇒ completedAt set + event fired; Stripe webhook succeeded ⇒ same; esign field ⇒ signatureRequestId stored pending; DropboxSign webhook signed ⇒ completedAt set; both fields ⇒ completedAt only after both; tenancy (no cross-tenant response read).
- E2E: fill → submit → PaymentElement (test card) → thank-you; fill → submit → DropboxSign iframe → webhook → thank-you. Stubs: `pk_test_*`, DropboxSign `test_mode:true` (default outside prod).
