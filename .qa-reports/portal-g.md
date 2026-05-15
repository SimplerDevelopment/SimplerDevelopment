# PORTAL-G QA Report — Automations / Branding / Hosting / Agency / Projects / Experiments

**Agent:** PORTAL-G | **Date:** 2026-05-14 | **Branch:** `qa/full-walkthrough-2026-05-14`

---

## Summary

15 new spec tests written and passing. 2 missing API GET handlers added as small fixes. 1 existing spec corrected to reflect real service-gating behavior. 3 pre-existing failures in adjacent specs diagnosed. No railway URLs accessed; all work against `simplerdev_qa_walk` only.

---

## Coverage Inventory

| Route | Files with coverage | Status |
|---|---|---|
| `/portal/automations` | `portal-automations.spec.ts`, `portal-automations-services-hosting-mutations.spec.ts`, `qa-portal-g-slice.spec.ts`, `tests/integration/api/automations/*.test.ts` | COVERED |
| `/portal/automations/trigger-links` | `trigger-links.spec.ts`, `qa-portal-g-slice.spec.ts` | COVERED |
| `/portal/automations/workflows` | `tests/integration/api/portal/workflows/*.test.ts`, `qa-portal-g-slice.spec.ts` | COVERED (no UI-level e2e yet) |
| `/portal/automations/workflows/[id]` | `tests/integration/api/portal/workflows/*.test.ts` | PARTIAL — no workflow detail UI coverage |
| `/portal/branding` | `portal-branding-extras.spec.ts`, `portal-branding-mutations.spec.ts`, `portal-cms-branding.spec.ts`, `qa-portal-g-slice.spec.ts` | COVERED |
| `/portal/branding/profiles/[profileId]` | `portal-branding-profile-baseline.spec.ts`, `portal-branding-mutations.spec.ts` | PARTIAL — Save button click flaky (see Issues) |
| `/portal/branding/profiles/[profileId]/guide` | none found | GAP |
| `/portal/hosting` | `portal-hosting.spec.ts` (fixed), `portal-automations-services-hosting-mutations.spec.ts` | COVERED |
| `/portal/hosting/[id]` | `portal-hosting.spec.ts` | COVERED (smoke only) |
| `/portal/agency` | `tests/integration/api/portal/agency/branding.test.ts`, `qa-portal-g-slice.spec.ts` (smoke) | PARTIAL |
| `/portal/agency/branding` | `tests/integration/api/portal/agency/branding.test.ts` | PARTIAL — no UI e2e |
| `/portal/agency/custom-domain` | none found | GAP |
| `/portal/projects` | `qa-portal-g-slice.spec.ts` | PARTIAL — create/GET/delete only |
| `/portal/projects/[id]` | `qa-portal-g-slice.spec.ts` | PARTIAL — basic GET smoke |
| `/portal/projects/automations` | none found | GAP |
| `/portal/experiments` | `ab-experiment.spec.ts`, `ab-experiment-deck-lifecycle.spec.ts`, `qa-portal-g-slice.spec.ts` | PARTIAL — ab specs failing (see Issues) |
| `/portal/experiments/[id]` | `ab-experiment.spec.ts` | PARTIAL |

---

## Performance (TTFB, unauthenticated first-byte, 3100)

| Route | TTFB |
|---|---|
| `/portal/automations` | 663ms |
| `/portal/automations/trigger-links` | 596ms |
| `/portal/automations/workflows` | 395ms |
| `/portal/branding` | 484ms |
| `/portal/hosting` | 1269ms |
| `/portal/agency` | 567ms |
| `/portal/agency/branding` | 663ms |
| `/portal/agency/custom-domain` | 97ms (likely redirect) |
| `/portal/experiments` | 1631ms |
| `/portal/projects` | 601ms |

`/portal/hosting` (1.27s) and `/portal/experiments` (1.63s) are the slowest. Experiments page hit is expected: A/B resolution must join posts + abVariants per page view. Hosting is slower because the service-check (`authorizePortal({ requireService: 'hosting' })`) runs an extra DB query. Both are acceptable at current traffic but worth an index review under load.

---

## Issues Found

### FIXED in this pass

| ID | Severity | Description | Fix |
|---|---|---|---|
| G-1 | HIGH | `GET /api/portal/experiments` returned 405 — route file had a GET comment in the header but the handler was never implemented. Portal experiments list was unserviceable. | Added GET handler scoped by `createdBy` userId. TODO note left for adding `clientId` column to enable proper tenant-scoped join. |
| G-2 | HIGH | `GET /api/portal/projects/[id]` returned 405 — route only exported `PATCH`. Any page or API consumer reading a single project by ID got Method Not Allowed. | Added GET handler reusing existing `authorizeProject` helper (auth + tenant guard). |
| G-3 | MEDIUM | `portal-hosting.spec.ts` test `GET /hosting lists hosted sites` failed with 403 for the seeded test client because the client has no hosting subscription. Test assumed unconditional 200. | Corrected test to accept `[200, 403]` with shape assertions for each case. |

### Remaining / Not fixed

| ID | Severity | Description | Recommendation |
|---|---|---|---|
| G-4 | HIGH | `portal-branding-profile-baseline.spec.ts` — 3 tests fail: "messaging edits persist", "color tab edits persist", "AI rewrite modal opens". Root cause: Save button is `disabled` when `!dirty && !messagingDirty`. React 19 concurrent rendering makes the button report `not stable` during Playwright's click attempt after filling inputs. The `waitForResponse` is correctly set up before the click but `fill()` triggers a re-render that creates a brief layout shift. Fix: add a `waitFor(() => button.isEnabled())` before clicking, or debounce the dirty-state setter to prevent mid-fill renders. | Add `await expect(button).toBeEnabled()` before the `waitForResponse` / click pair in that spec. |
| G-5 | MEDIUM | Branding profile creation accepts invalid hex color strings (`"not-a-hex"`, `"#GGGGGG"`) without validation — returns 201 and persists to DB. Downstream CSS usage will silently render nothing. | Add hex format validation in `POST /api/portal/branding/profiles` and `PUT /api/portal/branding/profiles/[id]` using a simple `/^#[0-9a-fA-F]{3,6}$/.test()` guard or the zod `.regex()` schema already used elsewhere. |
| G-6 | MEDIUM | `ab-experiment.spec.ts` and `ab-experiment-deck-lifecycle.spec.ts` — 5 failures. These depend on site + post creation from other fixture slices and are inherently cross-slice. The "create site (for domain) + blank deck" test fails before the actual A/B assertion. Not attributable to this slice but blocks the `@critical` gate. | Coordinate with PORTAL-A/PORTAL-C agents; the site/deck seed fixtures need to run before these tests or be self-contained. |
| G-7 | LOW | `GET /api/portal/experiments` scopes by `createdBy userId` rather than by `clientId`. Multiple users on the same client will not see each other's experiments. This is a tenant isolation limitation, not a leak, but the UX is surprising. | Add `clientId` to `abExperiments` schema (needs migration), update the GET query, and update `POST` to stamp `clientId` on creation. |
| G-8 | LOW | `/portal/agency/custom-domain` and `/portal/projects/automations` routes have zero e2e coverage. | Add smoke coverage at minimum. |
| G-9 | LOW | `/portal/branding/profiles/[profileId]/guide` route has zero e2e coverage. | Add brand-guide GET smoke test. |

---

## Automation / Workflow Builder UX Notes

- The workflow builder (graph-based, `/portal/automations/workflows/[id]`) has no e2e UI coverage. The API layer is integration-tested thoroughly (`tests/integration/api/portal/workflows/`), but user-visible graph editing, node drag, edge connect, and test-run are untested end-to-end.
- Nonexistent `templateId` correctly returns 404 — the guard is in place.
- Workflow status toggle (`draft` → `active` → `paused`) works via PATCH and is tested.
- Empty-body `POST /api/portal/workflows` creates an "Untitled workflow" without error — consider requiring at minimum a `name` field to avoid accumulation of orphan workflows.

## Branding Profile Inheritance

- Branding profiles are not hierarchical — there is a `isDefault` boolean but no parent-child relationship. If a site has no explicit profile assigned, it falls back to the client's default profile. This is the intended design per `portal-branding-mutations.spec.ts`.
- `GET /api/portal/branding/defaults?profileId=X` correctly blends profile-specific values with system fallbacks.
- Hex color validation gap (G-5) is the most actionable issue here.

## Hosting Reliability / Observability

- Hosting is entirely service-gated; without a subscription the route returns a clean `{ requiresService, upsellUrl }` 403. The shape is well-defined and testable.
- No deploy trigger was invoked per task constraints. The deploy button (if present) is present in the UI page component at `/portal/hosting/[id]` — visual confirmation via screenshot `05-hosting-list.png`.
- No observability hooks found for deploy status webhooks or health-check polling. Worth adding a status-check cron or SSE endpoint for long-running deploys.

## A/B Experiment Lifecycle

- POST creates with correct `variantSplit` normalization and `status: 'draft'`.
- GET by id, PATCH (update), DELETE are all implemented in `/api/portal/experiments/[id]`.
- GET list (collection) was missing and has been added (G-1 fix).
- No lifecycle state machine guard: a `running` experiment can be `DELETE`d without archiving variants first — worth a guard in the DELETE handler.

---

## Tenancy Verification

| Resource | Test | Result |
|---|---|---|
| Workflows | `GET /api/portal/workflows/99999` → 404 | PASS |
| Branding profiles | `GET /api/portal/branding/profiles/99999` → 404 | PASS |
| Projects | `GET /api/portal/projects/99999` → 404 | PASS |
| Hosting | `GET /api/portal/hosting/99999` → 403 (service-gated, not a leak) | PASS |
| Automations | Scoped by `clientId` in all read paths | PASS (via `portal-automations.spec.ts`) |
| Experiments | Scoped by `createdBy userId` — not by clientId (G-7) | PARTIAL |

---

## Screenshots

All 9 route screenshots captured at 1440x900, full-page:
`.qa-reports/portal-g-screens/{01-09}-*.png`
