# Roast V2: Sites, Hosting & Publishing — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
SimplerDevelopment's Sites, Hosting & Publishing domain covers the full lifecycle of per-tenant public-facing client websites: subdomain and custom-domain routing via middleware, a public block-based renderer at `app/sites/[domain]/[[...slug]]/`, branding tokens, draft/live nav and custom CSS/JS, analytics integrations (GA4, GTM, Meta Pixel, Search Console), snapshot export/import for portability, Railway- and Vercel-backed hosting with per-environment env-var sync, and a content publishing pipeline built on the platform's kanban system (campaigns, per-user stage permissions, email dispatch channel). Sixteen MCP tools let AI agents scaffold sites, set branding, manage nav, publish custom code, and sync env vars in a single conversation.

**This module is bundle infrastructure, not an acquisition front-door.** Agencies land on SD via CRM, Brain, or automations; Sites is the white-label + AI-operable extension they adopt once committed. "Agencies consolidate their client website stack onto SD" is not the pitch; "agencies who are already in SD extend into hosting and publishing without a new vendor relationship" is.

## Who it's for & how it makes money
- **Primary buyer:** Agencies already on SD who want to host client sites, run a publishing workflow, and manage analytics under their existing subscription — not agencies being recruited away from Webflow or WordPress.
- **End user:** The agency's clients, whose public websites are rendered by this domain; agency staff who author and publish content.
- **Monetization:** Bundled into the SD module subscription (the "Sites" and "Hosting" SKUs in the 12-module catalog); hosted-app provisioning on Railway is an upsell from self-hosted CMS. No standalone product ambition. Snapshot portability (`isPublic` field) is forward-wired for a future marketplace option but is not current scope or revenue driver.

## The edge
- **MCP-native agentic site management is the only differentiator no incumbent offers — this is the demo headline.** An AI agent can scaffold a new client site, apply branding, update nav, publish custom code, and configure env vars in one conversation. No Webflow, Framer, Vercel, or Netlify exposes a machine-callable API surface across that full deployment range. This is the claim that makes the module worth having; it leads every demo and every written pitch.
- **Agency white-labeling is structural, not cosmetic.** Custom-domain middleware rewrites to `/portal/` for white-label agency portals — agencies deliver a fully branded CMS and publishing experience to their clients at their own domain, which pure site-builder competitors do not natively support for the agency-reseller model.
- **Publishing workflow reuses platform kanban.** The Publishing Command Center is `kanban_cards`/`kanban_columns` with `system_kind='publishing'` — any improvement to the kanban domain (AI sprint planning, MCP tools) automatically lifts publishing. No second system to maintain.
- **Snapshot portability accelerates agency resale workflows.** A templatized site (blocks + posts + nav + brand settings) can be re-deployed for each new client — a real efficiency multiplier for agencies running many similar client sites.

## Constraints
- Solo founder / tiny team; SD is a ~357k-line shipping monorepo.
- **This module does NOT lead acquisition.** It is a retention and expansion layer for agencies already committed to SD. Cold-start competition against Webflow or WordPress is out of scope and out of reach for a tiny team.
- The custom block renderer has no third-party theme or plugin ecosystem; it is not positioned as a migration target for agencies with existing Webflow or WordPress sites (re-platforming is a per-engagement cost increase, not a saving — the $7k–$25k migration reality is acknowledged and not argued against).
- **"Two hosting backends" is not marketed as simplicity.** The Railway/Vercel split is hidden behind one opinionated default in the UI; buyers must not read it as doubled 2am on-call surface.
- **Two GO-LIVE BLOCKERS are being closed before pitching any agency with more than five live client sites:**
  - **[BLOCKER 1 — OPEN, not done]** The full DB-lookup host-rejection middleware gate is deferred in the current codebase. The multi-tenant site resolver carries a correctness hole (unknown hosts reach the renderer) that every CTO finds in due diligence and treats as disqualifying. Shipping this gate — a real middleware + DB-query change — is a pre-pitch commitment, not a future roadmap item.
  - **[BLOCKER 2 — OPEN, not done]** The Railway/Vercel credential store has not been threat-modeled or blast-radius scoped. Every tenant's production infrastructure credentials share a concentration-of-trust posture whose compromise radius is every agency's prod infra at once. Isolation and blast-radius scoping must be completed before scaling tenant count. This is infra/security work, not a positioning change.

## Roast it on two lenses
1. **Earns its place in the suite?** Given that acquisition is led by CRM/Brain/automations, does Sites deliver enough retention and expansion value — via structural white-labeling, MCP-native agentic management, and snapshot resale workflows — to justify the maintenance burden on a tiny team with no ecosystem? Or does the block renderer without third-party themes become permanent drag the moment a client requests something outside the registry?
2. **Could it stand alone?** No standalone ambition — this is a bundled retention layer and the answer is no. The entire edge is derivative of co-location with SD's CRM, Brain, approval-gate, and kanban infrastructure. There is no credible standalone wedge without the suite. Lens B is stated plainly and closed, not kept open as a future aspiration.

## Riskiest assumption to pressure-test
That agencies already committed to SD will adopt Sites as their hosting and publishing layer at sufficient rate to justify the blocker-closure work — i.e., that "bundle extension for existing customers" is a real adoption motion, not a theoretical one. The cheapest test: take the existing snapshot/import path and attempt to migrate one real agency's live client site into SD blocks end-to-end — time it and count the block types that require hand-building. If a single site takes days and surfaces missing components, the "consolidation once committed" assumption is as dead as the "cold migration" assumption, and you learn it for the cost of one sprint rather than one churned agency. Run this test in parallel with closing Blocker 1 (middleware gate) so the next demo can survive the first security question.
