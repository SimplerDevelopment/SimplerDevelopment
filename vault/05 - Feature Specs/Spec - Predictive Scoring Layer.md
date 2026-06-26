---
type: spec
domain: company-brain-ai
status: proposed
date: 2026-06-17
sources:
  - lib/db/schema/brain.ts
  - lib/db/schema/crm.ts
  - lib/db/schema/email.ts
  - lib/brain/embedding-extractors.ts
  - lib/brain/profiles.ts
  - lib/db/schema/billing.ts
---

# Feature: Predictive Scoring Layer

## Overview

A single shared ML/predictive service, grounded in Company Brain first-party data, that powers three surfaces simultaneously: **CRM deal forecasting** (win probability, deal health score), **email campaign intelligence** (CLV segment, churn risk, optimal send-time per contact), and **commerce cohort analysis** (customer lifetime value, repeat-purchase probability). Built once on top of SD's unique asset — integrated, tenant-owned first-party data in Company Brain — rather than added per-domain as point features.

Competitive context: **HubSpot** (AI deal scoring, predictive lead scoring), **Klaviyo** (predictive CLV, churn risk, send-time optimization) both surface ML-derived signals as core features. SD's wedge: predictions run on *the client's own* integrated first-party data, already structured and enriched by Company Brain — something point tools can only approximate via external integrations. Gap #8 in [[Competitive Gap Analysis 2026-06]] and Cross-Cutting Theme #1.

## Domain context

Read first: [[Company Brain & AI]] and [[CRM]]. Invariants:

- Company Brain embeddings and profiles are already structured: `lib/db/schema/brain.ts`, `lib/brain/embedding-extractors.ts`, `lib/brain/profiles.ts`. Contact/deal context is grounded in these.
- CRM schema: `lib/db/schema/crm.ts` — deals, contacts, activities, tags.
- Email schema: `lib/db/schema/email.ts` — campaigns, sends, opens, clicks, unsubscribes.
- Billing / usage: `lib/db/schema/billing.ts` — order and subscription rows are the commerce signal source.
- Tenancy is absolute: models trained on `clientId` A must never leak signals into `clientId` B's scores. All prediction rows are keyed by `clientId`.
- Never hand-edit `drizzle/*.sql`.

## Problem

CRM deal health is manual gut-feel. Email campaigns send at arbitrary times with no per-contact optimization. Commerce has no cohort analysis or repeat-purchase prediction. All three gaps were identified independently in the gap report but share the same root cause: SD has the first-party data (transactions, email engagement, Brain-enriched contact profiles) and does nothing predictive with it. Meanwhile HubSpot and Klaviyo ship these signals as table-stakes.

## Goal

- CRM: every open deal shows a win-probability score (0–100) and a "deal health" signal updated at least daily.
- Email: every contact has a CLV tier (low / medium / high), a churn-risk flag, and a recommended send-time window; campaign composer surfaces these to guide send decisions.
- Commerce: cohort report shows customer LTV distribution, repeat-purchase probability by segment, and a churned-buyer re-engagement list.
- All three surfaces draw from a single prediction service — one model per signal type, one schema extension, one cron, no per-domain reimplementation.

## Proposed approach

### Scoring schema

Add a `contact_scores` table to `lib/db/schema/crm.ts` (or a new `lib/db/schema/scoring.ts`):
- `id`, `clientId`, `entityType` (deal / contact / commerce_customer), `entityId`, `scoreType` (win_probability / deal_health / clv_tier / churn_risk / send_time_window), `score` (numeric or enum), `confidence` (0–1), `features` (JSONB — the signal inputs for explainability), `modelVersion`, `computedAt`.
- Index on `(clientId, entityType, entityId, scoreType)`.
- Generate migration: `bun run db:generate`.

### Signal extraction pipeline

A new `lib/scoring/` module:
- `lib/scoring/feature-extractor.ts` — per-entity feature builder. Pulls from: CRM activity log (days since last touch, deal age, stage velocity, open-task count), Brain profile completeness and recency, email engagement history (open rate, click rate, unsubscribe signals, days since last open), and commerce rows (order count, total spend, days since last purchase, AOV).
- `lib/scoring/models/` — lightweight in-process models (no external ML service required for v1): logistic regression or gradient-boosted decision tree coefficients serialized as JSON, trained offline and vendored into the repo. V2 can replace with an API call to a hosted model endpoint if accuracy demands it.
- Initial model signals (v1, rule/heuristic-based until enough tenant data exists for per-client ML): win probability = weighted sum of deal age, stage, activity recency, and Brain profile completeness. CLV tier = RFM (recency/frequency/monetary) segmentation from order rows. Churn risk = days-since-last-open threshold + unsubscribe signal. Send-time window = mode of the contact's historical open timestamps.

### Scoring cron

Add `app/api/cron/score-entities/route.ts`:
- Runs daily (or hourly for high-value deals). Iterates all active `clientId` tenants; for each, extracts features and writes/upserts `contact_scores` rows.
- Scoped strictly by `clientId` — no cross-tenant feature extraction.
- Logs run time and entity count to `cronHealth` table (existing pattern).

### CRM surface

- Deal list and deal detail: show win-probability badge + deal health signal. Pull from `contact_scores` where `entityType = deal`.
- Contact detail: show CLV tier badge + churn-risk flag.
- MCP tool: expose `crm_get_deal_score(dealId)` and `crm_list_at_risk_deals(clientId)` so Brain agents can reason about pipeline health in Company Brain queries.

### Email surface

- Campaign composer: show per-contact send-time recommendation and CLV tier distribution for the selected segment before scheduling.
- Contact list: CLV and churn-risk columns (opt-in view toggle).
- Suppress high-churn-risk contacts from campaigns as an optional campaign setting.

### Commerce surface

- New "Cohort Analytics" tab in the storefront/commerce portal section.
- LTV distribution histogram, repeat-purchase probability by segment, churned-buyer list (last purchase > N days + churn risk flag) with one-click "create re-engagement campaign" action.

## Scope

In scope:
- `contact_scores` schema + scoring cron.
- `lib/scoring/` feature extractor + v1 in-process models (RFM + logistic heuristics).
- CRM: deal win-probability + health badge; contact CLV + churn-risk.
- Email: send-time recommendation + CLV distribution in campaign composer.
- Commerce: cohort analytics tab.
- MCP tools for deal scoring.

Out of scope:
- Real-time scoring on every event (daily cron is v1; streaming updates are v2).
- Per-client custom model training (requires sufficient per-tenant data volume; phase-gate on client size).
- A/B-testing the predictions themselves (would require the [[AB Testing]] engine integration).
- External ML API calls (v1 is in-process; keep it zero-dependency for now).
- Auto-ingest connectors (Slack/Confluence/SharePoint) to enrich Brain data — separate gap ([[Company Brain AI E2E Audit]]).

## Risks

- Per-tenant data volume: heuristic/RFM models work with sparse data; proper ML models need hundreds of labeled examples per tenant. Ship heuristics first, label data as tenants grow, retrain offline.
- Score staleness UX: scores computed daily can be 24 hours stale. Surface `computedAt` in the UI to set expectations.
- Feature extraction performance: pulling engagement signals across all tenants in one cron pass could be slow. Add a `clientId` cursor (paginate tenants) and a `SCORING_BATCH_SIZE` env cap.
- Tenancy: the scoring cron must never mix feature signals across tenants. Audit the feature extractor query for `clientId` scoping and run `bun test:tenancy` after ship.
- Explainability: surfaces like "why is this deal at risk?" require storing the `features` JSONB and rendering it. Plan the UX before implementing — a score without explanation loses trust quickly.

## Effort

**L** (~4–6 engineer-weeks: schema + feature extractor + v1 models + cron + three UI surfaces + MCP tools + tests).

## Open questions

- V1 model strategy: start with hard-coded heuristics (rule-based thresholds) or implement proper RFM + logistic regression from the start? Heuristics ship faster but may feel arbitrary to users.
- Should the scoring cron share the existing cron health logging pattern (`lib/db/schema/cronHealth.ts`) or get its own observability table?
- Commerce cohort tab: which portal section owns it — storefront, CRM, or a new "Analytics" section?
- MCP exposure priority: deal scoring tools first, or contact CLV queries first — which does the Brain agent need most?

---

## Verified against dev (2026-06-17)

**Verdict: ABSENT confirmed — largest greenfield item in the next-ranked set.**

### What exists (rule-based only, not predictive)

- **CRM scoring:** `crmScoringRules` provides a point-tally system (additive integer score from user-defined rules). No probabilistic model, no ML, no deal win-probability.
- **Deal probability:** static per-pipeline-stage probability values configured at pipeline setup. Deterministic, not learned from historical outcomes.
- **Email segments:** Boolean filters on contact fields (tag, list membership, last-open date). No CLV tier, no churn-risk score, no per-contact send-time recommendation.
- **A/B testing:** deterministic variant assignment — the existing engine (`lib/db/schema/ab.ts`) allocates variants but does not use engagement predictions to optimize.
- **Analytics:** retrospective reporting only (e.g. Resend open/click events, order row aggregates). No forward-looking cohort predictions, no repeat-purchase probability.

### What is genuinely absent

The entire `lib/scoring/` module, `contact_scores` schema, scoring cron, and all three UI surfaces (CRM deal health badge, email CLV/churn columns, commerce cohort tab) are greenfield. No shared predictive/ML service of any kind exists. Zero ML or statistical model inference runs anywhere in the platform today.

### Scope confirmation

The original spec scope is fully valid — nothing has been partially built. This is a clean greenfield build. Effort **L** (~4–6 engineer-weeks) stands. This is the largest differentiator in the next-ranked set and the one with the longest build horizon — plan accordingly.
