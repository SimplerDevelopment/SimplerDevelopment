# Magamommy — Autonomous Merch Shop

A 100%-autonomous merch shop tenant on the SimplerDevelopment platform. Drops **one new shirt every Monday** based on the past week's trending political news, with zero human in the loop between cron-fire and live product page.

Implementation lives across:

```
lib/db/schema/magamommy.ts                # 3 tables: briefs, concepts, drops
lib/magamommy/types.ts                    # Shared agent contracts
lib/magamommy/composite.ts                # sharp-based artwork → mockup compositor
lib/magamommy/agents/researcher.ts        # Anthropic + web_search → topics
lib/magamommy/agents/concept-writer.ts    # Anthropic → shirt concept (slogan + visual prompt)
lib/magamommy/agents/designer.ts          # gpt-image-1 → artwork, composite, designs row
lib/magamommy/agents/publisher.ts         # products + variants + images → live drop
lib/magamommy/orchestrator.ts             # State-machine runner: research→concept→design→publish

scripts/magamommy/bootstrap-tenant.ts     # One-time: attach the magamommy site + template product to info@danielpcoyle.com
scripts/magamommy/generate-blank-mockups.ts  # One-time: regenerate blank shirt PNGs
scripts/magamommy/run-weekly-drop.ts      # Manual trigger for end-to-end testing

app/api/cron/magamommy-weekly-drop/route.ts  # Vercel cron entrypoint (Monday 14:00 UTC)
vercel.json                                # Registered cron schedule
drizzle/0116_magamommy_autoshop.sql       # Schema migration (hand-applied — see below)
public/assets/magamommy/blank-tee-*.png   # Six placeholder mockup PNGs
```

---

## How the pipeline works

```
  ┌──────────────┐  Topic[]      ┌──────────────┐  Concept    ┌──────────────┐  DesignerResult ┌──────────────┐  PublisherOutput
  │  RESEARCHER  │ ───────────►  │   CONCEPT    │ ──────────► │   DESIGNER   │ ──────────────► │  PUBLISHER   │ ───────► live product
  │ Anthropic +  │               │   WRITER     │             │ gpt-image-1  │                 │  products +  │
  │ web_search   │               │  Anthropic   │             │  + sharp     │                 │  variants    │
  └──────────────┘               └──────────────┘             └──────────────┘                 └──────────────┘
        │                              │                            │                                │
        ▼                              ▼                            ▼                                ▼
  magamommy_briefs              magamommy_concepts          S3 + designs row              products + variants + images
```

Each stage's output is persisted **before** the next stage runs. A mid-pipeline failure is recoverable: re-running the orchestrator picks up from the next-pending stage of the same `magamommy_drops` row.

**Idempotence:** one drop per (website, week). Re-running the orchestrator after a drop reaches `status='live'` is a no-op.

---

## Activating the pipeline (one-time setup)

This codebase's prod migration tracker is out-of-sync with disk, so migrations are hand-applied SQL (see `.planning` notes). Sequence:

```bash
# 1. Apply the schema migration to your target DB.
psql "$DATABASE_URL" -f drizzle/0116_magamommy_autoshop.sql

# 2. Regenerate the blank shirt mockups (already done; re-run only if you delete them).
bun scripts/magamommy/generate-blank-mockups.ts

# 3. Bootstrap the magamommy tenant under info@danielpcoyle.com — website, brand profile, template product.
#    Idempotent. Prints the generated password ONCE on initial create.
bun scripts/magamommy/bootstrap-tenant.ts

# 4. (Optional but recommended) Run the pipeline manually once to verify.
#    Requires: ANTHROPIC_API_KEY, OPENAI_API_KEY, AWS_*  in env.
bun scripts/magamommy/run-weekly-drop.ts
#    └─ For a forced retry within the same week:
#       bun scripts/magamommy/run-weekly-drop.ts --force

# 5. (Optional) Compose the public storefront pages — home, shop, about, contact.
bun scripts/magamommy/compose-storefront.ts
```

After step 4, you should see a new row in `products` named after the week's slogan, visible on the storefront at `https://magamommy.simplerdevelopment.com/shop/<slug>`.

After deploying to Vercel, the cron in `vercel.json` (`0 14 * * 1` — Monday 14:00 UTC) takes over and runs the orchestrator automatically every week.

---

## Configuration knobs

- **Schedule:** edit `vercel.json` `magamommy-weekly-drop` entry.
- **Anchor news sources** (researcher): system prompt in `lib/magamommy/agents/researcher.ts`. Add/remove domains from the search-anchors list.
- **Style families** (concept-writer): system prompt in `lib/magamommy/agents/concept-writer.ts`. Currently `bold | satire | classic`.
- **Pricing / inventory:** `publisher.ts` constants — `price: 2900`, `compareAtPrice: 3500`, `quantity: 100`.
- **Mockup colorways:** the bootstrap seeds `white`. Add more by extending the loop in `bootstrap-tenant.ts` step 9 (productDesignSurfaces) and the COLORWAYS array in `generate-blank-mockups.ts`.

---

## Safety filters

Both the researcher and concept-writer prompts include hard rules:

- No naming of individuals (politicians, public figures, journalists)
- No incitement to violence
- No discrimination by protected class
- No election denial
- Visual prompts must describe iconography, never people

These filters are layered (researcher rejects bad topics, concept-writer rejects bad concepts) and OpenAI's `gpt-image-1` policy filter is a third line of defense. If any layer rejects, the drop row is marked `status='failed'` with `errorStage` recording where it broke — next Monday's cron tick generates a fresh attempt.

---

## What this build does NOT include (phase 2 candidates)

- **Print-on-demand vendor integration** — orders queue in the existing `orders` table; merchant pulls them manually. Wire up Printful / Gelato as a follow-up.
- **Real shirt photography** — current mockups are SVG silhouettes generated by `sharp`. Replace files under `public/assets/magamommy/` with hi-fi product photos when available; no code changes needed.
- **Custom domain DNS for `magamommy.com`** — the site lives at `magamommy.simplerdevelopment.com` until DNS is pointed at Vercel.
- **Email notifications on drop** — no announcement email is sent. Hook into the existing email-campaign pipeline as a follow-up.
- **Tests** — no unit/integration/E2E coverage yet. Add: orchestrator state-machine unit tests, publisher tenancy regression, full-pipeline `@critical` E2E with mocked Anthropic/OpenAI.

---

## Tracing a drop

If a drop misbehaves, here's the audit trail:

```sql
-- Latest drop's full state
SELECT id, week_of, status, brief_id, concept_id, design_id, product_id, error, error_stage
FROM magamommy_drops
ORDER BY id DESC LIMIT 1;

-- Researcher's harvest
SELECT id, week_of, jsonb_array_length(topics) AS topic_count, raw_model_response
FROM magamommy_briefs WHERE id = <brief_id>;

-- Concept-writer's pick (and the rejected alternatives)
SELECT slogan, tagline, visual_prompt, palette, placement, style, alternatives
FROM magamommy_concepts WHERE id = <concept_id>;

-- Designer's persisted layers + S3 URLs
SELECT layers_by_surface, thumbnail_url, rendered_url
FROM designs WHERE id = '<design_id>';

-- Publisher's product + variants
SELECT id, name, slug, status, featured, quantity FROM products WHERE id = <product_id>;
SELECT name, sku, quantity, option_values FROM product_variants WHERE product_id = <product_id>;
```

All four agent files log with a `[<agent>]` prefix so `vercel logs` greps cleanly.
