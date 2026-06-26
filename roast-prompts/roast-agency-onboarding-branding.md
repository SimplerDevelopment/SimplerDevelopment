# Roast: Agency, Onboarding & Branding — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
The domain owns three linked jobs: (1) an 8-step onboarding wizard that captures a new agency's role, company, brand vibe, mission, and feature intent on first login — answers are immediately mirrored into structured `branding_profiles` and `branding_messaging` rows so every downstream tool (AI copy, block defaults, CMS, Company Brain) has tenant identity context from day one; (2) a full brand management system — structured color palette, typography, logos, button presets, and messaging fields (tagline, elevator pitch, tone, target audience) — with multiple named profiles per tenant, AI theme generation, AI copy generation, WCAG contrast auditing, and brand-sentinel aliases that resolve `__brand_primary__` tokens to real CSS at render time; and (3) white-label / agency mode for Scale-tier tenants, where a verified custom domain replaces the SD portal URL and portal chrome (name, logo, accent) is overridden — the entire SD portal runs under the agency's own brand.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies using SD as their business OS — they need to configure their own brand once, have it propagate everywhere (client sites, email campaigns, proposals, AI-generated copy), and optionally present the portal to their team under their own domain.
- **End user:** The agency's internal team (portal users) who live in the branded portal; the agency's clients who receive branded deliverables (proposals, emails, site content).
- **Monetization:** Core onboarding and branding are included at all tiers — they're the activation hook, not a revenue line. White-label / custom domain is a Scale-tier upsell. AI theme and copy generation burn AI credits (metered). This is a retention and differentiation play, not a standalone revenue driver.

## The edge
- **Brand as a platform primitive, not a settings page:** `branding_profiles` feeds block-default styles, email campaign templates, AI copy prompts, Company Brain context, and site renderer CSS vars — one structured brand record propagates to every content surface without copy-paste. No competitor in the agency-management space (HoneyBook, Dubsado, Bonsai) has this; Brandfetch is read-only import, not an authoring system.
- **Onboarding writes structured data immediately:** The wizard doesn't collect answers into a blob — `mirrorBrandAnswers` in `lib/onboarding/service.ts` writes to `branding_profiles` / `branding_messaging` as a fire-and-forget side effect on each step save. Every downstream AI tool has context before the agency finishes setup.
- **MCP-exposed brand context closes the AI loop:** 9 MCP tools (`branding_list_profiles`, `branding_audit`, `branding_check_contrast`, `branding_update_messaging`, etc.) let agents read and write brand state — an AI agent can audit contrast, rewrite messaging to match tone, and push a new palette without a human opening the settings panel.
- **White-label is genuinely rare at this price point:** Scale-tier agencies can present SD as their own product under a verified DNS TXT domain — something HoneyBook and Dubsado don't offer at all, and that enterprise platforms charge significantly more for.
- **Brand sentinel tokens decouple content from color:** `__brand_primary__` in block JSON resolves at render time via `resolveBrandSentinel()`, so swapping a brand profile repaints all content globally without touching individual block records.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed tools agencies already pay for: HoneyBook (client experience + proposals + contracts), Dubsado (workflows + CRM + forms), Bonsai (contracts + invoicing + time tracking), plus Brandfetch / manual brand setup (no integrated equivalent exists in the agency-management space).
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
The brand-as-platform-primitive story only pays off if agencies actually complete onboarding with accurate brand data and keep it updated — rather than skipping the wizard, pasting placeholder hex codes, and never revisiting the branding panel. The `branding_profiles` / `branding_messaging` tables are the connective tissue for AI copy quality, email campaigns, site theming, and Company Brain context; if they're empty or stale, every downstream AI feature degrades silently. The council should attack whether the onboarding wizard genuinely captures brand truth at activation, or whether SD is building an elaborate propagation system on top of data that most agencies will never properly supply.
