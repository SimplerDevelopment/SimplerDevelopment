# ADR: Block-managed site chrome (customLayout + navigation block)

**Date:** 2026-08-18
**Status:** Accepted
**Context:** IntegraTouch migration (Kanban project 213, ITM-001…013)

## Decision

Sites that need full design fidelity own their chrome as **blocks inside
post-type templates** instead of the platform's hardcoded `SiteNavClient` /
`SiteFooter` layout wrap:

1. `client_websites.customLayout = true` — the sites layout renders bare
   `{children}`; nothing platform-drawn wraps the page.
2. A new universal **`navigation` block** renders the header. It carries no
   menu data — it reads the site's existing `site_navigation` table at render
   time (same source as the portal nav manager and the legacy chrome), so menu
   edits propagate to every page instantly with zero template-copy drift.
   Appearance is entirely prop-driven (logo, colors, gradient background,
   link typography, CTA styling, sticky) with neutral defaults.
3. The existing `site-footer` block renders the footer.
4. Both sit in the site-scoped post-type template (`postTypes.template`,
   `websiteId`-scoped rows override global built-ins) around the
   `post-content` placeholder — so every page and blog post gets chrome from
   exactly two authored template rows.

## Alternatives rejected

- **Nav block with links in its own props** — menu edits would mean editing a
  copy in every post-type template (block-template insertion is
  stamp-and-detach; nothing propagates). Rejected for drift.
- **html-render nav template** — pixel-faithful and fast, but same copy-drift
  problem plus no reuse for future customLayout sites.
- **`branding.navTemplate = 'none'`** — hides only the header; the platform
  footer still renders. Half-platform half-blocks chrome was judged muddier
  than owning both.
- **Making layout chrome suppressible per post-type template** — a
  platform-wide layout change for one migration; the per-site `customLayout`
  boolean already existed as the designed escape hatch.

## Consequences

- Menu management stays in the existing nav manager / `nav_*` MCP tools even
  on fully custom sites.
- The nav block client-fetches its items (matches the platform's other
  data-driven block, blog-posts), so nav links are absent from SSR HTML —
  follow-up ITM-016 explores server-rendering block data.
- A CMS page with slug `blog` now overrides the built-in blog listing
  (required: under customLayout the built-in listing rendered chrome-less).
- First consumer: IntegraTouch (site 186). The pattern is universal — nothing
  in the block is client-specific.
