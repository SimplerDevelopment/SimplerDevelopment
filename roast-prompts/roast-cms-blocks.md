# Roast: CMS & Blocks — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
SD's CMS is a block-based content engine where a post's content is a typed JSON blob (`{ blocks: Block[], version: '1.0' }`), rendered server-side through a 65+ component `SiteBlockRenderer`. There are 48 built-in block types (layout, content, media, commerce, interactive — including an ROI Calculator and A/B-tested variants), a visual in-portal editor (iframe preview + postMessage protocol), per-site custom post types with field definitions, a template inheritance system (post-type block wrappers), revision history with content-hash dedup, and a block-template library (platform-global or tenant-private). All 42 MCP tools mean an AI agent can create, update, restyle, fork, and publish pages without a human touching the editor. Blocks are universal — the same registry and render pipeline serves public pages, email campaigns, and the store.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies who build and host client websites on SD, eliminating the need for a separate CMS platform per client.
- **End user:** The agency's clients, who may use the portal's visual editor to manage their own site content; public visitors who land on `app/sites/[domain]/[[...slug]]` pages.
- **Monetization:** Bundled in the subscription as the primary "site count" growth lever — each additional client site an agency onboards is another seat or project on the bill. AI-powered block restyle (`blocks/restyle/` endpoint, `branding_messaging` brand-voice table) is credit-metered and represents an upsell for content-heavy agencies.

## The edge
- **AI agent can build and publish a full site without touching the editor.** The 42 MCP tools (`posts_create`, `block_templates_publish`, `nav_publish_all`, `posts_upload_html_zip`, etc.) are scope-guarded and wired to a draft-before-live safety gate: MCP writes land in `block_templates.draft`; `block_templates_publish` promotes to live. An AI workflow can scaffold, populate, and ship a client site and the human reviews one approval URL. No competing headless CMS is operable end-to-end by a coding agent.
- **Brand-aware restyle is cross-domain, not a sidebar.** `branding_profiles` (colors, fonts, button presets, dark mode overrides) and `branding_messaging` (voice, tone axes, samples) feed the `blocks/restyle` AI endpoint. Regenerating content in the right brand voice isn't a prompt — it reads from the tenant's own brand configuration.
- **Universal block registry eliminates parallel systems.** The same 48-type registry serves public pages, email campaigns (`emailOnly: true` flag), and the storefront (`ProductGridBlockRender`, `ShopPage`). One schema change propagates everywhere; there is no "email editor" and "page editor" divergence problem that plagues competitors like Webflow (emails) or Contentful (needing a separate email tool).
- **HTML import escape hatch.** `posts_upload_html` / `posts_upload_html_zip` let an agent ingest an existing static site or design export as starting content — critical for agency site migrations where clients arrive with existing assets.
- **Multi-tenant by construction with a clean public render path.** `posts` is keyed to `websiteId`, tenancy is via join through `clientWebsites`; the public render layer (`app/sites/[domain]/[[...slug]]`) is `force-dynamic` SSR and isolated per domain. Agencies can host hundreds of client sites on one SD instance without cross-tenant bleed.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed point tools agencies already pay for: WordPress, Webflow, Sanity, Contentful, Builder.io.
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
That 48 block types and a postMessage-based visual editor are sufficient to handle the design fidelity and plugin ecosystem breadth that agencies currently depend on from WordPress/Webflow — i.e., that "good enough for most sites" is actually good enough to move an agency's entire client portfolio off the tool they've spent years customizing, where "just add a plugin" solves what SD would need bespoke development to match.
