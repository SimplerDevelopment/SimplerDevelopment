# A/B Testing Guide

> Reference for the polymorphic A/B testing engine in `simplerdevelopment2026`.
> Audience: engineers extending the engine, plus reviewers auditing what shipped on `feat/ab-engine-polymorphic`.

> **Verification note:** This document was authored against the code on the
> `feat/ab-engine-polymorphic` branch. A handful of items in the original spec
> (`MIN_SAMPLE_PER_ARM = 100`, an email-subject A/B surface on
> `email_campaigns`, `assignSurveyVariant`, the `+ New Experiment` picker on
> `/portal/experiments`, and several named test files) are **not yet on
> disk**. They are documented in section 10 (Roadmap) and flagged inline as
> *planned* so future engineers know which behaviors are live versus
> intended.

---

## 1. Overview

The A/B engine runs head-to-head experiments across multiple entity types — `post`, `deck`, and (reserved for future renderers) `survey` and `email`. A long-lived `sd_visitor` cookie gives every viewer a sticky bucket; the matching variant's payload override is substituted at render time so the visitor sees a consistent treatment across visits. Server-side `view` events are recorded as a detached write during the page render, and client-side `goal` events fire from a tiny inline script (`<AbGoalTracker>`) on `submit` or `click` matching a CSS selector. Significance is computed with a one-tailed two-proportion z-test (`lib/ab/stats.ts`); challengers vs the `a` control are surfaced on the experiment detail page with a <span class="material-icons">check_circle</span> when significant. Email-subject A/B and per-variant survey delivery live in their own tables and **do not** flow through the main render-path engine — those are tracked separately in section 10.

---

## 2. Architecture

### Render path

```
visitor browser
      |
      | (request)
      v
  sd_visitor cookie  ----- ensureVisitorId() -----> mints UUID if missing
      |                    (lib/ab/visitor.ts)
      v
  applyAbToPostContent / applyAbToDeckSlides
      |   (lib/ab/render.ts)
      v
  resolveAbContentForTarget(targetType, targetId, visitorId, content)
      |   (lib/ab/resolve.ts)
      |
      |--> findRunningExperimentForTarget()  -- ab_experiments (status='running')
      |--> assignVariant(experiment, visitorId)  ----- bucket = FNV-1a(eid:vid) % 100
      |       (lib/ab/assign.ts)                       sorted keys, cumulative ranges
      |--> SELECT block_tree_override FROM ab_variants
      |--> void recordExposure(...)  -- detached, never blocks first-byte
      |       INSERT ab_assignments  (ON CONFLICT DO NOTHING — sticky)
      |       INSERT ab_events (kind='view')
      v
  swapped content + AbResolution
      |
      v
  page render <PitchDeckPresentation /> or <SiteRenderer />
   followed by  <AbGoalTracker /> (only when ab.ab && ab.visitorId)
      |
      v
  inline <script> in browser
      | listens for 'submit' | 'click' matching goalSelector (parent chain)
      | OR auto-fires for goalMetric === 'page_view'
      v
  POST /api/public/ab/event  -> ab_events (kind='goal')
```

### Tables on the main render path (`lib/db/schema/ab.ts`)

| Table | Purpose | Notable columns |
|---|---|---|
| `ab_experiments` | One row per experiment. Polymorphic via `(target_type, target_id)`. | `target_type`, `target_id`, legacy mirror `post_id`, `status`, `variant_split` (JSON), `goal_metric`, `goal_selector`, `started_at`, `ended_at` |
| `ab_variants` | One row per arm (`a`, `b`, …). | `experiment_id`, `key` (unique per experiment), `label`, `block_tree_override` (JSON, NULL = control matches live content) |
| `ab_assignments` | Sticky visitor → variant mapping. Idempotent insert. | `experiment_id`, `variant_key`, `visitor_id` (unique on `(experiment_id, visitor_id)`) |
| `ab_events` | Append-only log of `view` and `goal` hits. | `experiment_id`, `variant_key`, `visitor_id`, `kind`, `occurred_at` |

Polymorphism is enforced only by the `target_type` enum (`'post' | 'deck' | 'survey' | 'email'`) and an index on `(target_type, target_id, status)`. The legacy `post_id` column is retained for back-compat and is mirrored on writes when `target_type='post'`; it is `NULL` for every other target type.

### Surfaces with their own tables (NOT on the main engine)

- **Email subject A/B** — *planned*. The user-facing intent is a 10/10/80 split on the recipient list with a `status` of `ab_testing` until promotion. As of this branch the `email_campaigns` schema does not yet carry `ab_*` columns and there is no `promote-winner` endpoint. Documented in section 6 with a *planned* flag.
- **Survey variants** — `survey_variants` exists in `lib/db/schema/surveys.ts` (id, surveyId, name, fields[], weight, enabled). The bucket helper (`assignSurveyVariant`) and per-variant stats endpoint are *planned*. Documented in section 7.

These two surfaces are kept off the main engine on purpose: their delivery semantics are different (server-driven email send vs. server-driven public form GET), they do not inject `<AbGoalTracker>`, and "view" / "goal" definitions on those surfaces map to domain-native events (`opened`, `clicked` for email; survey `submitted`). Pushing them through `ab_events` would force every send-path and form-submit handler to know about the engine; isolating them keeps the `posts.content` / `deck.slides` swap pipeline simple.

---

## 3. Adding a new target type (recipe)

Adding a new `target_type` to the engine touches a small, well-defined set of files. The schema does **not** change — `ab_experiments.target_type` is already a `varchar`-backed TS union. You only need to grow the union and wire authorization + render.

**The 3 files that change for a new target type:**

1. **`lib/db/schema/ab.ts`** — extend the `AbTargetType` union (`'post' | 'deck' | 'survey' | 'email' | <new>'`) and add the literal to `AB_TARGET_TYPES`.
2. **`lib/ab/access.ts`** — add `authorize<X>ForUser(userId, targetId)` that looks up the row, walks to its `clientId`, and verifies the user via `getPortalClients`. Then add the `case '<x>':` branch to `authorizeTargetForUser`. Mirror the shape of `authorizeDeckForUser`.
3. **The public render handler** — call `applyAbTo<X>Content` (a new wrapper analogous to `applyAbToDeckSlides` in `lib/ab/render.ts`). The wrapper should:
   - `JSON.stringify` the canonical payload before passing it through `resolveAbContentForTarget('<x>', id, visitorId, payload)`.
   - On `swapped`, attempt to `JSON.parse` the variant payload. If the shape doesn't match, **fall through to the original** — never blank the page.
   - Inject `<AbGoalTracker experimentId variantKey goalMetric goalSelector visitorId />` only when `ab.ab && ab.visitorId`.

If your target's variant override is just a string (HTML, Markdown), you can skip the wrapper entirely and call `resolveAbContentForTarget` directly from the page handler — see the post case (`applyAbToPostContent` is the smallest possible wrapper).

---

## 4. Public render pattern (post + deck cases)

Both renderers use the same shape: ensure visitor → resolve content → inject goal tracker.

### Post

`applyAbToPostContent({ postId, content, skip? })` (`lib/ab/render.ts`):

- `skip: true` (edit/preview mode) returns immediately with `ab: null`. Editors must always see canonical content.
- Otherwise, calls `ensureVisitorId()`, then `resolveAbContent(postId, visitorId, content)` which is a thin wrapper over `resolveAbContentForTarget('post', ...)`.
- Returns `{ content, ab, visitorId }`. Consumer renders `content` as the post's block tree and conditionally injects `<AbGoalTracker>`.

### Deck

`applyAbToDeckSlides({ deckId, slides, skip? })` (`lib/ab/render.ts`):

- Stringifies the slides array before calling `resolveAbContentForTarget('deck', deckId, visitorId, JSON.stringify(slides ?? []))`.
- On `resolved.ab.swapped`, parses the variant payload back. Anything not an `Array` falls back to the original slides — see safety contract below.
- Returns `{ slides, ab, visitorId }`.

### Goal-tracker injection (both cases)

The renderer injects `<AbGoalTracker>` **only when `ab.ab && ab.visitorId`**. This guards two things:

1. No experiment running ⇒ no script tag, no listeners.
2. No visitor id available (cookie store was read-only and `ensureVisitorId` returned a fresh in-memory UUID without persisting) ⇒ skip the script — there's nothing to bucket against.

The script (`components/blocks/AbGoalTracker.tsx`) handles three goal metrics:

| `goalMetric` | Trigger |
|---|---|
| `page_view` | Fires once on mount via `sendBeacon` (server-side `view` already recorded; this fallback covers CDN-cached SSR). |
| `form_submit` | Document-level capture-phase listener on `submit`. Matches `goalSelector` walking up the parent chain via `Element.matches()`. |
| `cta_click` | Same parent-chain match on `click`. Selector is required — without it, no fire. |

Goal beacons POST to `/api/public/ab/event` with `{ experimentId, variantKey, visitorId, kind: 'goal' }`. Beacon-first via `navigator.sendBeacon`, fetch fallback with `keepalive: true`.

### Safety contract (non-negotiable)

> A broken or malformed variant must **never** blank a presentation.

The engine enforces this in three places:

1. **`resolveAbContentForTarget`** wraps every DB call in `try/catch` and returns the unmodified `content` on any error.
2. **`applyAbToDeckSlides`** parses the variant payload behind a `try/catch` and falls back to `original` slides on `JSON.parse` failure or non-array shape.
3. **`recordExposure`** is fired with `void ... .catch(() => {})` — instrumentation latency or failure can never propagate to the response.

Any new target wrapper added in section 3 must repeat this contract.

---

## 5. Stats & significance

The dashboard's significance calculation lives in `lib/ab/stats.ts` (`twoProportionZTest`) and is consumed by `GET /api/portal/experiments/[id]/results`.

- **Test:** one-tailed two-proportion z-test with pooled variance under H0. Returns `{ z, p, lift }`. One-tailed because the buyer-facing question is *did B beat A*, not *is there any difference*.
- **CDF:** `normalCdf(x) = 0.5 * (1 + erf(x / √2))`, with `erf` implemented via the Abramowitz & Stegun 7.1.26 polynomial (max abs error ~1.5e-7).
- **Per-variant aggregates:** the results route uses `COUNT(DISTINCT visitor_id)` for both `view` and `goal` so refreshes don't multiply the funnel.

### Significance flag — current state

The results route in this branch flags `significant: result.p < 0.05` directly, with no minimum-sample guard. The `<ExperimentDetailClient>` UI shows a <span class="material-icons">check_circle</span> for `significant: true` and <span class="material-icons">remove_circle_outline</span> otherwise.

### Significance flag — intended (planned)

> **Planned, not yet on this branch:** add `MIN_SAMPLE_PER_ARM = 100` so significance is only flagged when **both** `p < 0.05` **and** each arm has ≥100 distinct visitors. Below the threshold the UI should render <span class="material-icons">hourglass_empty</span> ("collecting data") instead of the green check.

The reasoning is hard-won: a one-tailed p < 0.05 is *necessary but not sufficient* — small N flashes false positives. Two arms with 12 visitors and one extra conversion can clear `p < 0.05`; promoting that as a "winner" loses money. The 100/arm floor is a cheap, conservative gate that holds up under repeat-peeking. When the gate lands, document the constant in `lib/ab/stats.ts` and update both the API (`results/route.ts`) and the detail client.

---

## 6. Email subject A/B (separate surface, **planned**)

> **Status:** specced, **not yet implemented on this branch**. Documented here so the implementer doesn't reinvent the contract.

### Intended split

10/10/80 on a subscriber-id-sorted recipient list:

- 10% receive subject A.
- 10% receive subject B.
- 80% are held back and receive the winning subject after promotion.

The sort-by-id ordering is deterministic so re-running the splitter on the same campaign produces the same buckets. No cookie involvement — the surface is server-driven email send, not browser render.

### Status flow

```
draft -> scheduled -> ab_testing -> sent      (auto on cron promotion — TODO)
                              \--> ab_testing -> sent  (manual via promote-winner endpoint)
```

`status='ab_testing'` is the new value to add to the existing `email_campaigns.status` column when the surface ships. The 80% holdback waits on this status until promotion.

### Manual promotion endpoint

`POST /api/portal/email/campaigns/[id]/promote-winner` — takes a `winner: 'a' | 'b'` body, flips status, sends to the 80% holdback with the winning subject. (Cron-driven auto-promotion is on the roadmap; today only manual is intended.)

### Winner metric

`open` or `click`, configurable per campaign. Pulled from the existing `email_campaign_sends.opened_at` / `clicked_at` columns — no new event table needed.

### Why not on the main engine?

Email send is a queue-driven workflow with its own per-recipient state (`email_campaign_sends`). Mapping each send into `ab_events` would double-write every email and force every send hook to know about the experiment. Keeping it on `email_campaigns.ab_*` columns + `email_campaign_sends.variant` keeps the send pipeline self-contained.

---

## 7. Survey variants (separate surface, **partially planned**)

### Schema (live)

`survey_variants` exists in `lib/db/schema/surveys.ts`:

```ts
{ id, surveyId, name, fields[], weight (default 50), enabled (default true), createdAt }
```

### Intended assignment (planned)

`assignSurveyVariant(survey, visitorId)` — same FNV-1a deterministic bucket as `assignVariant` in `lib/ab/assign.ts`, but applied across enabled `survey_variants` weighted by `weight`. Because the public survey GET path is server-rendered, the variant is picked once at render time and the form is rendered with that variant's `fields` array.

### Submitted responses (planned)

When a respondent submits, the response row stores `variant_id` so per-variant counts are queryable without joining back through the visitor cookie.

### Per-variant stats endpoint (planned)

`GET /api/portal/surveys/[id]/variants/stats` — returns `{ variantId, name, responseCount, partialCount }` per variant. Per-variant funnel from `survey_partial_responses` is on the roadmap (see TODO(stats-deep) in section 10).

### Why not on the main engine?

Surveys have their own response lifecycle (`survey_responses`, `survey_partial_responses`, AI summaries). The variant *is* the form schema, not a content override. Forcing the engine's `block_tree_override` shape onto `SurveyFieldDef[]` would erase the type safety the survey schema enforces.

---

## 8. Authoring an experiment

### Two entry paths

1. **From the post editor** — the visual editor exposes a "Start A/B test" action that POSTs to `/api/portal/posts/[id]/experiments` (or, equivalently, to `/api/portal/experiments` with `targetType: 'post'`).
2. **From the pitch-deck editor** — the deck `EditorHeader` has an "A/B test" button that POSTs to `/api/portal/experiments` with `targetType: 'deck'`. See `app/portal/tools/pitch-decks/[id]/_components/EditorHeader.tsx` and the handler in `app/portal/tools/pitch-decks/[id]/page.tsx` around line 529.
3. *(Planned)* A `+ New Experiment` picker on `/portal/experiments` for creating against any supported target without leaving the experiments index. As of this branch the index page directs users to "Open any page in the visual editor or any pitch deck and use the 'A/B test' action to spin one up."

### Variant authoring

Variant `block_tree_override` is **JSON-only today**. There is no visual variant editor on this branch — engineers (and power users) edit the JSON in the experiment detail page or via API. A v2 visual editor is in the roadmap.

### Status transitions

```
draft -> running -> completed -> archived
                          ^
                          |
                          (re-open cycles back to running)
```

- `draft` — created, no `started_at`. Default state after POST.
- `running` — `started_at` set; the only status `findRunningExperimentForTarget` matches. Render path activates.
- `completed` — `ended_at` set. Render path stops swapping (returns control content); results page remains queryable.
- `archived` — hidden from default lists. Can be re-opened back to `running`.

Only one experiment per `(target_type, target_id)` should be `running` at a time. The resolver picks the most recent (`ORDER BY started_at DESC LIMIT 1`) if more than one is running, but concurrent experiments on the same target are out of scope.

---

## 9. Testing

### Unit tests (live)

- `tests/unit/ab-assign.test.ts` — bucket determinism, split renormalization, edge cases (empty splits, zero weights, single-arm).
- `tests/unit/ab-stats.test.ts` — z-test math, `erf` accuracy, `normalCdf` symmetry, lift edge cases (zero control rate).

### Unit tests (planned, named in spec but not yet present)

- `tests/unit/ab-render-deck.test.ts` — `applyAbToDeckSlides` swap path, malformed-variant fallback, `skip` mode.
- `tests/unit/ab-resolve-target.test.ts` — `resolveAbContentForTarget` per target type, missing-experiment short-circuit, recordExposure fire-and-forget contract.

### Integration tests (live)

- `tests/integration/api/portal/ab/experiments-crud.test.ts` — create/list/update flow, authorization rejection.
- `tests/integration/api/portal/ab/results.test.ts` — aggregate roll-up, z-test wiring.
- `tests/integration/api/public/ab/event.test.ts` — goal beacon, idempotency.
- `tests/integration/api/public/ab/render-variant.test.ts` — render-path swap, sticky bucket on repeat visit.

### E2E tests (live)

- `tests/e2e/ab-experiment.spec.ts` — end-to-end post-target experiment lifecycle.

### E2E tests (planned, named in spec but not yet present)

- `tests/e2e/ab-experiment-post-lifecycle.spec.ts` — split out from `ab-experiment.spec.ts` once the deck variant lands.
- `tests/e2e/ab-experiment-deck-lifecycle.spec.ts` — deck create/run/promote/archive.
- `tests/e2e/survey-variants-lifecycle.spec.ts` — once `assignSurveyVariant` ships.

Running the suite:

```bash
scripts/test.sh --layer=unit --no-coverage
scripts/test.sh --layer=integration --no-coverage
scripts/test.sh --layer=e2e --no-coverage
```

After data-access changes (anything in `lib/ab/resolve.ts`, `lib/ab/access.ts`, or the schema):

```bash
bun test:tenancy
```

---

## 10. Known gaps / roadmap

| Item | State | Notes |
|---|---|---|
| Visual variant editor (Tier 1) | Deferred. | JSON-only on this branch. v2 unblocks non-engineer authoring. |
| `MIN_SAMPLE_PER_ARM = 100` guard | Planned. | Today: significance = `p < 0.05`. Add the constant to `lib/ab/stats.ts`, gate both API + UI; UI shows <span class="material-icons">hourglass_empty</span> below threshold. |
| Email-subject A/B columns + endpoints | Planned. | `email_campaigns.ab_*` columns, `status='ab_testing'`, `POST /api/portal/email/campaigns/[id]/promote-winner` (manual). Cron auto-promote is a follow-up. |
| `assignSurveyVariant` + survey GET wiring | Planned. | Schema (`survey_variants`) is live; bucket helper and per-variant stats endpoint are not. |
| Per-variant funnel from `survey_partial_responses` | TODO(stats-deep). | Stats endpoint should expose drop-off curves, not just totals. |
| `+ New Experiment` picker on `/portal/experiments` | Planned. | Today users must enter from the post editor or pitch-deck editor. |
| Concurrent experiments on the same target | Out of scope. | Resolver picks most recent `running`. If product wants multi-armed bandits later, the bucket function changes, not the schema. |
| Cron auto-promote winner (email + render) | Planned. | Manual endpoint first, cron second. |
| Splitting `ab-experiment.spec.ts` into post + deck lifecycle specs | Planned. | Cleaner failure attribution. |

---

*Last updated: 2026-05-07. Source files referenced: `lib/ab/resolve.ts`, `lib/ab/render.ts`, `lib/ab/access.ts`, `lib/ab/assign.ts`, `lib/ab/stats.ts`, `lib/ab/visitor.ts`, `lib/db/schema/ab.ts`, `lib/db/schema/surveys.ts`, `lib/db/schema/email.ts`, `app/api/portal/experiments/route.ts`, `app/api/portal/experiments/[id]/results/route.ts`, `components/blocks/AbGoalTracker.tsx`, `app/sites/[domain]/pitch-deck/[slug]/page.tsx`.*
