# PORTAL-H QA Report — Tools (Booking / Pitch Decks / Gift Certs / Surveys / Media)

**Agent:** PORTAL-H (retry) | **Date:** 2026-05-14 | **Branch:** `qa/full-walkthrough-2026-05-14`
**Worktree:** `/private/tmp/sd2026-qa-walkthrough-20260514-183322/simplerdevelopment2026`
**DB:** `simplerdev_qa_walk` (local) | **Dev server:** :3100

## Summary
- 19 new E2E tests written and all passing — `tests/e2e/qa-portal-h-tools.spec.ts` (workers=1, ~85s).
- One environmental finding worth surfacing: the seed `client@example.com` has **zero `client_services` rows**, so every booking/pitch-deck/survey API returned 403 before the test could exercise the real flow. I granted the four required active subscriptions (`booking`, `pitch-decks`, `surveys`, `cms`) on `clients.id=1` for the duration of this run; nothing else was committed to the DB.
- One code-shape note: `PATCH /api/portal/tools/pitch-decks/[id]` (no `PUT` handler) and survey `status` must be `'active'` (not `'published'`) for the public submit endpoint at `/api/surveys/[slug]` to accept responses — both worth a docstring or alias.
- All 10 portal Tools pages returned HTTP 200 with TTFB between 514ms and 5.8s; the only slow route is `/portal/tools/booking/new` (cold dev-server compile).
- No prod / Railway / staging URLs touched. No `tsc --noEmit` errors introduced by the new spec (only the pre-existing `.next/dev/types/routes.d.ts` generator noise from the running dev server).

## Coverage Inventory

| Route | Existing E2E coverage | Status |
|---|---|---|
| `/portal/tools/booking` | `portal-booking.spec.ts`, `portal-booking-internals.spec.ts`, `portal-booking-detail-baseline.spec.ts`, **new `qa-portal-h-tools`** | COVERED |
| `/portal/tools/booking/new` | `portal-booking.spec.ts`, **new** | COVERED |
| `/portal/tools/booking/[id]` | `portal-booking-detail-baseline.spec.ts`, `portal-booking-internals.spec.ts` | COVERED |
| `/portal/tools/booking/quotes`, `/quotes/new` | **new** | NEW |
| `/portal/tools/booking/calendar` | `portal-smoke-all-routes.spec.ts`, **new** | COVERED (smoke only) |
| `/portal/tools/booking/checkin` | `portal-smoke-all-routes.spec.ts`, **new** | COVERED (smoke only) |
| `/portal/tools/booking/analytics` | `portal-smoke-all-routes.spec.ts`, **new** | COVERED (smoke only) |
| `/portal/tools/pitch-decks/new` | `portal-pitch-decks.spec.ts`, `portal-pitch-decks-v2.spec.ts`, **new** | COVERED |
| `/portal/tools/pitch-decks/[id]` | `portal-pitch-decks-v2.spec.ts`, `pitch-deck-columns.spec.ts`, `ab-experiment-deck-lifecycle.spec.ts`, **new** | COVERED |
| `/portal/tools/pitch-decks/[id]/presenter`, `/slide-preview` | none found | GAP — public renderers untested at slice level |
| `/portal/tools/gift-certificates` | `portal-tools-gift-certificates.spec.ts`, `portal-gift-certs-mutations.spec.ts`, **new** | COVERED |
| `/portal/surveys`, `/new`, `/[id]` | `portal-surveys.spec.ts`, `portal-surveys-mutations.spec.ts`, `portal-surveys-detail-baseline.spec.ts`, `survey-branding-qa.spec.ts`, `survey-variants-lifecycle.spec.ts`, **new** | COVERED |
| `/portal/media` | `portal-cms-media.spec.ts`, **new** | COVERED |

## Performance (logged-in, hydrated, dev mode)

| Route | TTFB |
|---|---|
| `/portal/tools/booking` | 1801 ms |
| `/portal/tools/booking/new` | **5783 ms** (cold compile) |
| `/portal/tools/booking/quotes` | 1479 ms |
| `/portal/tools/booking/calendar` | 850 ms |
| `/portal/tools/booking/analytics` | 782 ms |
| `/portal/tools/pitch-decks/new` | 618 ms |
| `/portal/tools/gift-certificates` | 694 ms |
| `/portal/surveys` | 597 ms |
| `/portal/surveys/new` | 682 ms |
| `/portal/media` | 514 ms |

Dev-mode numbers; not actionable as absolutes, but `/booking/new` is a noticeable outlier even after the warm-up dance — worth a prod-build re-measure.

## Issues

| # | Sev | Area | Repro | Fixed? |
|---|---|---|---|---|
| 1 | Medium | Test fixtures | The `client@example.com` seed user is set up with `clients` + role `client` but no `client_members` or `client_services` rows. Every service-gated portal API (`requireService: 'booking' / 'pitch-decks' / 'surveys'`) returns 403, so any e2e that tries to exercise these from the standard seed silently fails the gate. | Worked around in-run by inserting active `client_services` rows for `booking`, `pitch-decks`, `surveys`, `cms`. Not committed. Recommend folding into `scripts/seed-admin-e2e.ts` (or a dedicated `scripts/seed-portal-client-services.ts`) so future slices don't trip on it. |
| 2 | Low | API shape inconsistency | Most portal POST routes return `200` on create; `POST /api/portal/tools/booking/quotes` returns `201` and `POST /api/portal/tools/gift-certificates` also returns `201`. Both are fine REST, but the inconsistency made the test brittle — fixed by accepting `[200, 201]`. | Test fixed. Doc/audit candidate. |
| 3 | Low | API method | `app/api/portal/tools/pitch-decks/[id]/route.ts` exposes `PATCH` (not `PUT`). Every other portal `[id]` route in this slice uses `PUT`. Caller-side surprise. | Documented; test now uses PATCH. Optionally add a PUT alias or note in BLOCK_EDITOR_GUIDE. |
| 4 | Low | Survey status vocab | `surveys.status` accepts `'published'` via the portal PUT, but `/api/surveys/[slug]` only treats `'active'` as submittable. Setting `status='published'` looks correct from the editor side but silently breaks public submission with `Survey is not active`. | Test now uses `'active'`. Recommend either rejecting unsupported statuses on PUT or treating `published` and `active` as synonyms in the public route. |
| 5 | Info | Tenancy | `GET /api/portal/surveys/999999` returns 403 (service-gate) before 404 (not-found). Correct behavior; spec accepts either to keep semantic intent visible. | n/a |

## What I did not touch (out of time-box)
- Pitch-deck `presenter` / `slide-preview` public renderers — no e2e exists; would need its own pass.
- Booking `[id]/google` and `[id]/zoom` calendar-integration endpoints — depend on OAuth fixtures.
- Survey `/variants`, `/email-sequences`, `/ai-summary`, `/webhooks` — covered by their own specs; not duplicated.
- Media `upload` endpoint — multipart; existing `portal-cms-media.spec.ts` covers it.

## Recommendations
1. Add a `scripts/seed-portal-tools-services.ts` (idempotent) that grants the four service categories the portal-as-client persona needs. Run it from the QA worktree bootstrap so subsequent slices don't re-discover this 403 land-mine.
2. Standardize portal create-route status codes (pick one: all `200` or all `201`) — the inconsistency between booking-quotes/gift-certs and the rest makes tests fragile.
3. Switch `/api/portal/tools/pitch-decks/[id]` to `PUT` (or expose both) for consistency with siblings like `/api/portal/surveys/[id]`.
4. Either (a) reject `surveys.status = 'published'` on PUT or (b) treat `published` as a public-submit-allowed alias for `active` in `/api/surveys/[slug]`.

## Artifacts (absolute paths)
- Spec: `/private/tmp/sd2026-qa-walkthrough-20260514-183322/simplerdevelopment2026/tests/e2e/qa-portal-h-tools.spec.ts`
- Screenshots (13): `/private/tmp/sd2026-qa-walkthrough-20260514-183322/simplerdevelopment2026/.qa-reports/portal-h-screens/`
- This report: `/private/tmp/sd2026-qa-walkthrough-20260514-183322/simplerdevelopment2026/.qa-reports/portal-h.md`
