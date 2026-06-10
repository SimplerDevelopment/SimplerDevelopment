---
type: domain-map
domain: ab-testing
status: active
date: 2026-06-09
sources:
  - lib/ab/assign.ts
  - lib/ab/resolve.ts
  - lib/ab/render.ts
  - lib/ab/visitor.ts
  - lib/ab/stats.ts
  - lib/ab/access.ts
  - lib/db/schema/ab.ts
  - app/api/portal/experiments/route.ts
  - app/api/portal/experiments/[id]/route.ts
  - app/api/portal/experiments/[id]/variants/route.ts
  - app/api/portal/experiments/[id]/variants/[variantKey]/route.ts
  - app/api/portal/experiments/[id]/results/route.ts
  - app/api/portal/posts/[id]/experiments/route.ts
  - app/api/public/ab/event/route.ts
  - app/portal/experiments/page.tsx
  - app/portal/experiments/[id]/page.tsx
  - app/sites/[domain]/[[...slug]]/page.tsx
  - docs/guides/AB_TESTING_GUIDE.md
  - .planning/ab-overnight-2026-05-07.md
  - tests/unit/ab-assign.test.ts
  - tests/unit/ab-stats.test.ts
  - tests/unit/ab-resolve-target.test.ts
  - tests/unit/ab-render-deck.test.ts
  - tests/e2e/ab-experiment.spec.ts
  - tests/e2e/ab-experiment-post-lifecycle.spec.ts
  - tests/e2e/ab-experiment-deck-lifecycle.spec.ts
  - tests/integration/api/portal/ab/experiments-crud.test.ts
  - tests/integration/api/public/ab/event.test.ts
  - tests/integration/api/public/ab/render-variant.test.ts
---

# Domain: AB Testing

## Purpose

Server-side split testing for public-facing content. An experiment attaches to a target entity (post or pitch deck today; survey and email reserved), assigns each visitor a deterministic variant via an FNV-1a hash of `(experimentId, visitorId)`, optionally swaps the target's content payload for the variant's `blockTreeOverride`, fires view events, and exposes a two-proportion z-test significance dashboard.

The system is entity-polymorphic: one experiment per `(target_type, target_id)` pair. The same variant model that replaces a post's block tree can replace a deck's slides array — the `blockTreeOverride` column stores whatever JSON shape the target type uses.

See `docs/guides/AB_TESTING_GUIDE.md` for the full reference (render patterns, adding a new target type, significance math, known gaps).

## Key entry points

| Path | Role |
|---|---|
| `lib/ab/assign.ts` | Pure FNV-1a bucket + `assignVariant` — no DB writes, safe in middleware/server components/tests |
| `lib/ab/resolve.ts` | DB lookup for running experiment + variant fetch + fire-and-forget exposure recording; `resolveAbContentForTarget` is the canonical API |
| `lib/ab/render.ts` | Public render-path helpers: `applyAbToPostContent`, `applyAbToDeckSlides`; skips AB in preview/edit mode |
| `lib/ab/visitor.ts` | `sd_visitor` cookie (HttpOnly, SameSite=Lax, 1-year UUID); `getVisitorId` (read-only) and `ensureVisitorId` (read or mint) |
| `lib/ab/stats.ts` | `twoProportionZTest` (pure JS, no external deps) + `normalCdf` + `erf` polynomial approximation |
| `lib/ab/access.ts` | Per-target tenant authorization: `authorizePostForUser`, `authorizeDeckForUser`, `authorizeExperimentForUser` |
| `lib/db/schema/ab.ts` | Four tables: `ab_experiments`, `ab_variants`, `ab_assignments`, `ab_events` |
| `app/portal/experiments/page.tsx` | Tenant experiment list (SSR + `ExperimentsTable` client component with status/type filters) |
| `app/portal/experiments/[id]/page.tsx` | Per-experiment detail: variant editor, traffic split, live results |
| `app/sites/[domain]/[[...slug]]/page.tsx` | Integration point — calls `applyAbToPostContent` for every post/page render |
| `docs/guides/AB_TESTING_GUIDE.md` | Primary reference doc — cite this, do not duplicate here |

## Data model

All tables in `lib/db/schema/ab.ts`. Not tenant-keyed directly; tenancy is enforced through the target entity (post → site → client; deck → client). See `lib/ab/access.ts` for the join chain.

### `ab_experiments`
| Column | Notes |
|---|---|
| `id` | serial PK |
| `target_type` | `'post' \| 'deck' \| 'survey' \| 'email'` — discriminator |
| `target_id` | Row id within the target's table |
| `post_id` | Legacy nullable FK to `posts.id`; mirrored from `target_id` when `target_type='post'`, NULL otherwise |
| `name`, `hypothesis` | Display metadata |
| `status` | `draft \| running \| completed \| archived` |
| `variant_split` | `{ a: 50, b: 50 }` JSON — keys match `ab_variants.key`; renormalized if sum != 100 |
| `goal_metric` | `page_view \| cta_click \| form_submit` |
| `goal_selector` | CSS selector or block id (used for `cta_click` / `form_submit` only) |
| `started_at`, `ended_at` | Status transition timestamps |

Indexes: `(target_type, target_id, status)`, `post_id`, `status`.

### `ab_variants`
Each row is one arm of an experiment. `key` is a single lowercase letter (`a`–`z`). `block_tree_override` is nullable: null means "show the live target content unchanged" (the control arm). Non-null replaces the target's entire content payload.

Unique index: `(experiment_id, key)`.

### `ab_assignments`
One row per `(experiment_id, visitor_id)`. Written once via `onConflictDoNothing`. Sticky: a visitor always gets the same variant for the lifetime of the experiment.

Unique index: `(experiment_id, visitor_id)`.

### `ab_events`
Append-only event log. `kind` is `'view'` (auto-fired server-side on render) or `'goal'` (fired client-side via the goal tracker component). Views are not de-duplicated; dashboards de-dupe by visitor when needed.

## API surface

### Portal (authenticated, tenant-scoped via `access.ts`)

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/portal/experiments` | List experiments for the active client (posts + decks) |
| `POST` | `/api/portal/experiments` | Create experiment; body: `{ targetType, targetId, name, ... }` |
| `GET/PATCH/DELETE` | `/api/portal/experiments/[id]` | Read / update status / delete |
| `GET/POST` | `/api/portal/experiments/[id]/variants` | List variants; auto-add next letter key |
| `PATCH/DELETE` | `/api/portal/experiments/[id]/variants/[variantKey]` | Edit label/weight; delete (guards: `a` protected, min 2, not running) |
| `GET` | `/api/portal/experiments/[id]/results` | Aggregated view + goal counts per variant, z-test result |
| `GET/POST` | `/api/portal/posts/[id]/experiments` | List or create experiment scoped to a post (back-compat path) |

### Public (unauthenticated, rate-limited)

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/api/public/ab/event` | Record a goal event from the client-side `AbGoalTracker` component; validates visitor cookie |

The public event endpoint does not create assignments — assignments are created server-side during render via `recordExposure`.

## MCP tools

None registered. Experiment management is portal-UI-only; no MCP surface exists today.

## UI surfaces

- `app/portal/experiments/page.tsx` — experiment list filtered by status and target type; "New Experiment" modal (`NewExperimentLauncher`); links to detail.
- `app/portal/experiments/[id]/page.tsx` — detail: variant card list with editable labels, per-variant weight inputs, traffic rebalance link, variant JSON editor (block tree), live results table with view/goal counts and significance column.
- `app/sites/[domain]/[[...slug]]/page.tsx` — public render integration; `applyAbToPostContent` is called on every post/page render; the returned `ab` resolution is injected into the page for the client-side `AbGoalTracker` component to read.

In edit/preview mode, the `skip: true` flag on `applyAbToPostContent` / `applyAbToDeckSlides` bypasses the entire AB pipeline so editors always see canonical content.

## Tests & gates

| File | Type | What it covers |
|---|---|---|
| `tests/unit/ab-assign.test.ts` | Unit | `fnv1a32` determinism, `assignVariant` buckets, `normalizeSplit` |
| `tests/unit/ab-stats.test.ts` | Unit | `twoProportionZTest`, `normalCdf`, `erf` polynomial |
| `tests/unit/ab-resolve-target.test.ts` | Unit | `resolveAbContentForTarget` fallback behavior, variant swap path |
| `tests/unit/ab-render-deck.test.ts` | Unit | `applyAbToDeckSlides` shape validation, fallback on malformed JSON |
| `tests/unit/components-portal-new-experiment-modal.test.tsx` | Unit | NewExperimentModal render |
| `tests/unit/components-portal-experiment-detail-client.test.tsx` | Unit | ExperimentDetailClient variant editor UI |
| `tests/unit/experiment-detail-client-coverage.test.tsx` | Unit | Coverage supplement |
| `tests/integration/api/portal/ab/experiments-crud.test.ts` | Integration | Full CRUD lifecycle, variant add/remove guards, split normalization |
| `tests/integration/api/public/ab/event.test.ts` | Integration | Goal event recording, rate-limit path |
| `tests/integration/api/public/ab/render-variant.test.ts` | Integration | Variant content swap on public render |
| `tests/e2e/ab-experiment.spec.ts` | E2E | Portal experiment creation + status transitions |
| `tests/e2e/ab-experiment-post-lifecycle.spec.ts` | E2E | Full post experiment lifecycle (create → run → goal → results) |
| `tests/e2e/ab-experiment-deck-lifecycle.spec.ts` | E2E | Deck experiment lifecycle |

The `@ab @critical` tags on E2E specs include them in the `bun test:critical` gate.

## Cross-domain dependencies

- **CMS / Posts** — `abExperiments.postId` has a cascade-delete FK on `posts.id`. When a post is deleted all its experiments, variants, assignments, and events are purged.
- **Pitch Decks** — `applyAbToDeckSlides` resolves experiments via `pitch_decks.client_id`; the `pitchDecks` table is joined in `lib/ab/access.ts` for tenant authorization.
- **Sites render path** — `app/sites/[domain]/[[...slug]]/page.tsx` is the only public integration point today. Adding AB to other public surfaces (e.g. store pages) requires wiring `applyAbToPostContent` or a new target-type equivalent.
- **`sd_visitor` cookie** — set / read by `lib/ab/visitor.ts`; no conflict with auth cookies. The visitor id is intentionally not tied to a user account.
- **Portal client resolution** — `lib/ab/access.ts` calls `getPortalClients` to enforce tenant boundaries. Experiments are not directly keyed by `clientId`; tenancy flows through the target entity's ownership chain.

## Invariants & gotchas

- **One running experiment per target at a time.** `findRunningExperimentForTarget` returns the most recent running row. Concurrent experiments on the same `(target_type, target_id)` are out of scope; the UI should prevent creation but the DB has no unique constraint on it.
- **Assignments are sticky for the experiment lifetime.** `ab_assignments` uses `onConflictDoNothing` — a visitor bucketed into variant `a` on day 1 stays in `a`. There is no re-bucketing mechanism.
- **Control arm (`a`) is protected.** The DELETE variants route rejects deleting key `a`; minimum two variants are required to delete any non-control arm; running experiments cannot have variants removed.
- **Variant swap is full-replacement.** A non-null `blockTreeOverride` replaces the entire post content or slide array — there is no partial/merge behavior. A null override means "show the live target as-is."
- **View events are append-only.** Every server-side render of an assigned visitor fires a view event. Dashboards must de-dupe by `visitor_id` if they want unique-visitor counts.
- **Significance is one-tailed.** `twoProportionZTest` tests "did B beat A" not "is there any difference." The pooled-variance formula matches the standard two-proportion z-test.
- **Survey and email AB are separate surfaces.** `AbTargetType` includes `'survey'` and `'email'` but `lib/ab/access.ts` explicitly returns `null` for both — they are not wired into the main engine. The email subject split (`email_ab_tests`, `email_ab_variants`) and survey variant split (`survey_variants`) are entirely separate schemas with their own logic. See `docs/guides/AB_TESTING_GUIDE.md` sections 6 and 7.
- **`post_id` back-compat column.** Older rows (before polymorphic target support) have `post_id` populated and `target_type='post'`. New code should always use `target_type` + `target_id`; `post_id` is kept to avoid breaking existing queries and the cascade-delete FK.

## Planning notes

`.planning/ab-overnight-2026-05-07.md` logs the W2.A / W3.D overnight work on `feat/ab-engine-polymorphic`:
- **W2.A** — Dynamic variant add/remove (auto-letter assignment, `floor(100/N)` auto-split, control-protected guard, min-two-variants guard, "Rebalance to even" UI).
- **W3.D** — Survey variants E2E spec (`tests/e2e/survey-variants-lifecycle.spec.ts`) — authored but left on a local-only branch; depends on `feat/ab-survey-variants` (ba435ceb3) being merged first.

From `docs/guides/AB_TESTING_GUIDE.md` section 10 (known gaps / roadmap):
- Statistical significance flag in the results table — stub exists, p-value threshold not yet wired to UI state.
- Email subject A/B promotion (planned) — separate surface, see guide section 6.
- Survey variant assignment + response recording (planned) — see guide section 7.
- Deck render integration at `app/(pages)/d/[slug]/page.tsx` — `applyAbToDeckSlides` is implemented but not yet called on the public deck render path as of the last audit.

## Related

- `docs/guides/AB_TESTING_GUIDE.md` — full reference; authoritative on render patterns, new target type recipe, significance math
- `lib/db/schema/ab.ts` — canonical schema (import from `@/lib/db/schema`)
- `vault/03 - Domains/CMS & Blocks.md` — blocks / posts domain (AB experiments live on top of posts)
- `vault/03 - Domains/Sites, Hosting & Publishing.md` — public site render path where AB is injected
