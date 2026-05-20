# Magamommy Autonomous Shop — Build Plan

> **Goal:** A 100%-autonomous merch shop at `magamommy.com` that drops one new shirt every Monday based on the week's Republican-leaning news. Multi-agent pipeline runs unattended; no human in the loop between cron-fire and live product.

**Branch:** `feat/magamommy-autoshop` (based on `origin/staging`)
**Tenant:** new `clients` row "Magamommy" + `client_websites` row `magamommy.com`
**Run trigger:** Vercel cron Monday 14:00 UTC → `/api/cron/magamommy-weekly-drop` → orchestrator → 4 sequential agents

## Architecture — multi-agent pipeline

```
┌──────────────┐  topics    ┌──────────────┐  concepts  ┌──────────────┐  artwork   ┌──────────────┐  product
│  RESEARCHER  ├───────────►│   CONCEPT    ├───────────►│   DESIGNER   ├───────────►│  PUBLISHER   ├──► live
│  Anthropic + │  brief     │   WRITER     │  concept   │ GPT-image-1  │  design    │  products +  │
│  web_search  │            │  Anthropic   │            │  + composite │            │  variants    │
└──────────────┘            └──────────────┘            └──────────────┘            └──────────────┘
       │                            │                          │                          │
       ▼                            ▼                          ▼                          ▼
 magamommy_briefs           magamommy_concepts            S3 + designs            products + variants
```

### Agent contracts (immutable hand-offs)

| Agent | Input | Output table | Output shape |
|---|---|---|---|
| **researcher** | `{weekOf: Date}` | `magamommy_briefs` | `{topics: [{slug, headline, context, sourceUrls[]}]}` |
| **concept-writer** | `{briefId}` | `magamommy_concepts` | `{conceptId, slogan, tagline, visualPrompt, palette[], placement, style}` |
| **designer** | `{conceptId}` | `designs` + S3 | `{designId, artworkUrl, mockupUrl}` |
| **publisher** | `{conceptId, designId}` | `products` + `product_variants` + `product_images` | `{productId, slug, publicUrl}` |
| **orchestrator** | `{}` | `magamommy_drops` | `{dropId, week, stages: {research, concept, design, publish}, productId}` |

A failing stage halts the pipeline; `magamommy_drops` row reflects the partial state. Re-running the orchestrator picks up from the next-pending stage of the latest drop row (idempotent on partial failure).

## Data model additions (`lib/db/schema/magamommy.ts`)

```ts
// One row per Monday cron firing.
magamommyDrops {
  id: serial
  websiteId: int → client_websites(id)
  weekOf: date            // monday in UTC
  status: 'pending'|'researching'|'concepting'|'designing'|'publishing'|'live'|'failed'
  briefId: int? → magamommy_briefs(id)
  conceptId: int? → magamommy_concepts(id)
  designId: uuid? → designs(id)
  productId: int? → products(id)
  error: text?
  createdAt / updatedAt
  UNIQUE(websiteId, weekOf)   // exactly one drop per week per site
}

// Researcher output.
magamommyBriefs {
  id: serial
  websiteId: int
  weekOf: date
  topics: jsonb       // [{slug, headline, context, sourceUrls[]}]
  rawModelResponse: text
  createdAt
}

// Concept-writer output. One winning concept per drop.
magamommyConcepts {
  id: serial
  websiteId: int
  briefId: int → magamommy_briefs(id)
  topicSlug: varchar(120)
  slogan: varchar(120)          // ≤ 6 words, what goes on the shirt
  tagline: text                 // marketing copy for the product page
  visualPrompt: text            // fed to GPT-image-1
  palette: jsonb                // [{name, hex}]
  placement: varchar(20)        // 'front' | 'back'
  style: varchar(20)            // 'bold' | 'satire' | 'classic'
  alternatives: jsonb           // the 2 rejected concepts (audit trail)
  createdAt
}
```

## File map

```
lib/db/schema/magamommy.ts                                    NEW — three tables above
lib/db/schema/index.ts                                        EDIT — export *
drizzle/<NNNN>_magamommy_autoshop.sql                         GEN — bun run db:generate
                                                              ⚠ per project memory, prod migrations are hand-applied SQL

lib/magamommy/types.ts                                        NEW — shared types (Topic, Concept, DesignerResult)
lib/magamommy/agents/researcher.ts                            NEW — runResearcher()
lib/magamommy/agents/concept-writer.ts                        NEW — runConceptWriter()
lib/magamommy/agents/designer.ts                              NEW — runDesigner() — calls OpenAI + S3 + designs insert
lib/magamommy/agents/publisher.ts                             NEW — runPublisher() — products + variants + images
lib/magamommy/orchestrator.ts                                 NEW — runWeeklyDrop()
lib/magamommy/s3.ts                                           NEW — thin wrapper around lib/s3 for magamommy paths
lib/magamommy/composite.ts                                    NEW — server-side composite artwork-over-shirt mockup via sharp

app/api/cron/magamommy-weekly-drop/route.ts                   NEW — Vercel cron entrypoint, x-vercel-cron auth

scripts/magamommy/bootstrap-tenant.ts                         NEW — idempotent: user + client + clientMembers + clientWebsite
                                                              + storeSettings + brandingProfile + base "Heavyweight Tee" product
                                                              + productDesignSurfaces (front/back) + productOptions (size/color)
                                                              + productOptionValues
                                                              + base mockup images uploaded to S3
scripts/magamommy/run-weekly-drop.ts                          NEW — manual trigger for end-to-end test
assets/magamommy/                                             NEW — blank shirt mockup PNGs (white, black, red) used as composite base

vercel.json                                                   EDIT — add cron for /api/cron/magamommy-weekly-drop "0 14 * * 1"
```

## Constraints / non-goals

- **No POD integration.** Orders queue in the existing `orders` table; merchant manually fulfills. Adding Printful/Gelato is Phase 2.
- **No custom domain.** Site lives at `magamommy.simplerdevelopment.com` until DNS for `magamommy.com` is set up; the `domain` column is populated for branding only.
- **No human approval queue.** Pipeline is fire-and-forget. If quality is bad, the next week's drop overwrites the "featured" slot.
- **Server-side composite uses `sharp`.** The existing designer's client-side Fabric.js export isn't available headlessly; `sharp` is already a transitive dep via Next image optimisation — confirm and import directly.
- **Stripe Connect onboarding is a manual one-time admin step.** The bootstrap script seeds `store_settings` with `stripeAccountId: null`; checkout falls back to platform Stripe until onboarded.
- **No tests this pass.** This is a feature delivery sprint; we'll backfill `@critical` E2E + tenancy + a unit test for the orchestrator state machine in a follow-up.

## Open questions (answered for now, may revisit)

1. **Q: Should the orchestrator be the cron handler, or should each stage be its own queued run via the existing scheduler?**
   - **A:** Orchestrator is the cron handler. The existing scheduler's run kinds are fixed-string-dispatch (`'research-brief' | 'draft-blog-post'`); extending it cleanly is a refactor. Each magamommy stage takes <30s individually, all four total ~90-120s — too long for Vercel's 60s default function timeout, but the API route exports `export const maxDuration = 300` to bump to 5 minutes (Pro plan default). Each stage's output is persisted before the next runs, so a timeout mid-pipeline is recoverable.

2. **Q: How do we ensure the artwork doesn't contain copyrighted/trademarked imagery (e.g. real politicians' faces)?**
   - **A:** The visual prompt is constrained to "iconography, slogans, abstract scenes" in the concept-writer system prompt — never names of real people. GPT-image-1's policy filter is the second line of defense. If generation fails the safety filter, the drop is marked `failed` and the next Monday tries again.

3. **Q: What if web_search returns no Republican-flavored news that week?**
   - **A:** The researcher prompt seeds with anchor URLs (Fox News, Breitbart, Daily Wire, Newsmax RSS) so search always has something to chew. If all five anchors fail to return results, the drop is `failed` and is reported (Phase 2: alert via existing notification system).

## Manual verification checklist (after end-to-end test)

- [ ] `bun scripts/magamommy/bootstrap-tenant.ts` exits 0 and is idempotent on re-run
- [ ] `bun scripts/magamommy/run-weekly-drop.ts` produces a `magamommy_drops` row with `status: 'live'`
- [ ] The created product is visible at `https://magamommy.simplerdevelopment.com/shop` (post-storefront composition)
- [ ] The composite mockup image renders (not 404) at the URL stored in `product_images.url`
- [ ] Adding the product to cart → checkout → Stripe payment intent succeeds in test mode
- [ ] Re-running the orchestrator in the same week is a no-op (status remains `live`, no new product)
- [ ] `tsc --noEmit` clean

## Sequencing for this session

Phase 1 (foundation, sequential): schema → migration → bootstrap script
Phase 2 (agents, parallel): researcher | concept-writer | designer | publisher — independent files
Phase 3 (wiring, sequential): orchestrator → cron route → manual trigger CLI → end-to-end test
Phase 4 (parallel with phase 3 finishing): public storefront composition (sd-create-website sub-agent)
Phase 5 (deferred): Vercel cron registration + commit + PR

Status of each phase is tracked in TaskList (#1 – #12).
