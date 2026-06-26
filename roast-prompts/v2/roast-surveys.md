# Roast: Surveys — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea

Multi-page, multi-field forms with 14 field types, per-field branching logic (`showIf` + `goToPage`), A/B variant assignment (FNV-1a visitor hash), configurable scoring rules, and a post-submission CRM auto-routing pipeline that creates a `crmDeals` row when a response score hits a threshold. Responses trigger HMAC-signed outbound webhooks, post-submission email drip sequences, and an AI summary (themes / sentiment / per-question synthesis cached in `surveyAiSummaries`). A public recommendation engine (`recommendation` JSON config) surfaces personalised outputs on the results page. Surveys are linkable to CRM deals, booking pages, email campaigns, and pitch decks — including embedding a live survey flow as a branching slide inside a deck.

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies running SD as their business OS — they build lead-qualification, onboarding, feedback, and NPS surveys for themselves and as client deliververs.
- **End user:** The agency's clients and their clients' customers who fill out the public `/s/<slug>` form.
- **Monetization:** Bundled into the SD subscription and gated per-tenant via `requireService(clientId, 'surveys')` — surveys become an upsellable feature line within the agency's own SD service catalog, the same mechanism as bookings.

## The edge

- **Survey answer → branched personalized pitch-deck slide.** `PitchDeckSlideV2.surveyId` links a survey directly into a deck slide; `SurveySlideRenderer` + `SurveyRecommendationRenderer` present the form and then branch the deck based on the result — an interactive, personalized proposal flow no incumbent offers. This primitive requires SD's own deck engine; it cannot be replicated by combining a standalone form tool with an external deck service because the branch logic runs inside the deck render pipeline at runtime. This is the one genuinely irreplaceable edge.
- **Draft/approval gate for agent-created surveys.** `surveys_create` and `surveys_update` via MCP mint an approval URL; the public endpoint returns 403 until a human flips the survey to `active`. This lets AI agents draft surveys that the agency reviews before clients see them — Typeform and Tally have no equivalent gating concept.
- **Score → CRM deal routing without middleware.** When `scoringConfig.autoRouteToCrm.enabled` is true and the response score hits the minimum, a CRM deal is created automatically with tenant-scoping guards. involve.me and Jotform both offer scored-form→CRM routing at ~$19/mo, so this is not a unique primitive — but eliminating the Zapier hop and keeping lead qualification inside a single tenanted data model is a cleaner workflow story. This supporting benefit is meaningful primarily for tenants who also run SD CRM; the cross-module lock-in depends on that co-location.
- **A/B variant support with delivery audit.** Multiple field sets per survey, weighted split, per-variant conversion stats, and a full webhook delivery audit log (`surveyWebhookDeliveries`) with 3-attempt HMAC-signed retry.
- **Brand-aware public renderer.** `getBrandingBySurveySlug` resolves the tenant's active branding profile (colors, fonts, logo) for the public `/s/<slug>` form — surveys look like agency-branded pages, not a generic form tool.

## Constraints

- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed point tools agencies already pay for: Typeform, SurveyMonkey, Tally, Google Forms, Jotform.
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses

1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test

Agencies will abandon Typeform (or Tally) — with its polished respondent UX, native Stripe payment fields, and broad third-party integration library — because the survey→personalized-deck-slide primitive creates a genuinely irreplaceable interactive proposal flow, and the in-platform CRM score routing (no Zapier hop) delivers a cleaner internal workflow for tenants already running SD CRM. The real retention multiplier depends on the tenant also running SD Pitch Decks and CRM; absent both, surveys are a competent but undifferentiated form builder against well-funded incumbents. The honest claim: among tenants who do run all three modules, the deck-branching primitive creates lock-in that no external integration can replicate.
