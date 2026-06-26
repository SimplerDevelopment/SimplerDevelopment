# Roast V2: CMS & Blocks — SimplerDevelopment

**Pivot summary:** Kill the CMS-replacement pitch. Reposition as the agent-operable, governed, cross-domain (page + email + store) publishing engine for agencies onboarding net-new clients. The visual editor is the human review layer, not the product. Block expansion is frozen.

**How to use:** Run `/roast` and feed it this brief. The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea

SD's CMS is a block-based publishing engine where a post's content is a typed JSON blob (`{ blocks: Block[], version: '1.0' }`). What makes it defensible is not the 48 block types or the visual editor — it is the combination of three things no competing CMS ships together: (1) a fully agent-operable MCP pipeline (42 scope-guarded tools) with a draft-before-live approval gate built in, (2) a single universal block registry that serves public pages, email campaigns, and the storefront from one schema change, and (3) an HTML-import escape hatch that lets agents ingest an existing site and start publishing in hours instead of weeks. The visual in-portal editor (iframe preview + postMessage) exists and ships — but its role is the human approval/review layer that wraps the agent, not the product itself. Block-count expansion is frozen; new client coverage goes through HTML import first.

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies onboarding **net-new clients** — clients who have no entrenched CMS yet and no portfolio of years-customized WordPress/Webflow sites to migrate. Explicitly not: agencies trying to consolidate an existing client portfolio.
- **End user:** The agency, running an AI-assisted workflow that scaffolds and publishes a client site; the agency's client, who approves content through the visual editor.
- **Monetization:** Bundled in the subscription as the primary "site count" growth lever — each additional net-new client site is another seat or project on the bill. AI-powered block restyle (`blocks/restyle/` endpoint, brand-voice table) is credit-metered and represents an upsell for content-heavy clients. No standalone ambition; the engine has no moat outside the suite.

## The edge

- **Agent-operable, draft-before-live publishing pipeline — the only headless CMS an AI agent can operate end-to-end without a human in the loop until the approval step.** The 42 MCP tools (`posts_create`, `block_templates_publish`, `nav_publish_all`, `posts_upload_html_zip`, etc.) are scope-guarded. MCP writes land in `block_templates.draft`; `block_templates_publish` promotes to live. An agent scaffolds, populates, and queues a full client site for one human approval URL. Sanity is catching up (40+ tools now), so this lead is measured in months — the strategic imperative is to bank loud case studies immediately, not to widen the tool count.
- **Universal block registry eliminates the email-editor / page-editor divergence problem.** The same 48-type registry serves public pages, email campaigns (`emailOnly: true` flag), and the storefront (`ProductGridBlockRender`, `ShopPage`). One schema change propagates everywhere. This is a structural advantage no competitor (Webflow, Contentful) replicates without a separate toolchain.
- **HTML-import escape hatch replaces bespoke block development for coverage gaps.** `posts_upload_html` / `posts_upload_html_zip` let an agent ingest a design export or existing static site as starting content. When a client arrives with assets outside the 48-type registry, HTML import is the answer — not authoring a new block type. This is the discipline that keeps SD from becoming a bespoke services shop.
- **Brand-aware restyle is cross-domain, not a sidebar.** `branding_profiles` and `branding_messaging` feed the `blocks/restyle` AI endpoint. Regenerating content in the right voice reads from the tenant's own brand configuration — not a prompt.
- **Multi-tenant by construction.** `posts` is keyed to `websiteId` via `clientWebsites`; the public render layer is `force-dynamic` SSR and isolated per domain. Hundreds of client sites on one instance, no cross-tenant bleed.

## Constraints

- **ICP is net-new, not migration.** SD cannot profitably compete for agencies whose clients have years of WordPress customizations, plugin ecosystems, and design system investments. That is an intentional scope cut. Any agency comparison to Webflow/WP feature parity is a distraction from the wedge.
- **Block expansion is frozen as of this revision.** No new block types until the agent-operable pipeline has been validated on a real net-new client site end-to-end (48-block coverage + HTML import escape hatch is the test). "Just one more block" is the gravitational pull that turns SD into a bespoke services shop.
- **The AI-agent differentiation window is eroding.** Sanity shipped 40+ MCP tools. Speed to loud case studies now outweighs depth of tool coverage.
- **Visual editor scope is bounded.** The visual editor is the human approval/review layer wrapping the agent workflow, not a Webflow-parity canvas. No further investment in control-by-control feature matching.
- Solo founder / tiny team; SD is a ~357k-line shipping monorepo. Maintainability at this scale is a hard constraint on every scope decision.

## Roast it on two lenses

1. **Earns its place in the suite?** Does the agent-operable + universal-registry + HTML-import combination actually deliver faster, cheaper net-new client sites than an agency's current Webflow/WP workflow — and does the draft-before-live gate plus cross-channel registry create the kind of lock-in that makes churning to a point tool more painful than it's worth?

2. **Could it stand alone? No standalone ambition — bundled retention layer.** The agent-operable CMS has no moat outside the SD suite; the MCP tools derive scope from the tenancy model, the brand restyle derives from `branding_profiles`, and the cross-channel registry only matters because email and storefront live in the same platform. Spun out, it is a feature, not a product. The council should assess lens B only to confirm the bundled lock-in thesis, not to find a spin-out path.

## Riskiest assumption to pressure-test

That 48 block types plus the HTML-import escape hatch — with a hard rule of zero new block types — is sufficient to build and publish a real net-new agency client site end-to-end purely through the 42 MCP tools + one human approval URL, without hitting a coverage gap that forces bespoke development. The 48-hour cheapest test: take ONE real net-new client site, build it end-to-end through the MCP pipeline + HTML import, approve a single URL, measure whether any block gap forced a custom type, and benchmark elapsed time against the agency's normal Webflow build. That directly validates both coverage sufficiency and agent reliability — the two claims the entire repositioned pitch depends on.
