# Marketing content (specs & plans)

Launch-prep artifacts for the marketing site (mission Phases 8, 11, 12). These are
**specs and plans**, not live pages — a later phase turns them into real routes once
the app is green and screenshots/GIFs are captured.

**Ground rule:** every claim here is grounded in the [feature inventory](../vault/05%20-%20Feature%20Specs/FEATURE-INVENTORY-domains.md).
Dormant/stub capabilities (voice assistant, print designer, deck A/B, social
publishing, SDK, dispatcher cron) are deliberately **excluded** from public copy and
flagged in each file's "Status Notes". Do not market what isn't shipped.

## Feature landing pages (Phase 8)

Each spec has: Hero · Problem/Solution · Benefits · How it works · FAQs · SEO block
(title/meta/slug/keywords) · JSON-LD types · internal links · screenshot/GIF requirements · CTA.

- [Websites, CMS & Visual Editor](feature-pages/websites-cms-visual-editor.md)
- [CRM](feature-pages/crm.md)
- [Company Brain (AI knowledge base)](feature-pages/company-brain.md)
- [Storefront & Commerce](feature-pages/storefront-commerce.md)
- [Bookings & Scheduling](feature-pages/bookings-scheduling.md)
- [Email Campaigns](feature-pages/email-campaigns.md)
- [Surveys & Forms](feature-pages/surveys-forms.md)
- [Pitch Decks](feature-pages/pitch-decks.md)
- [Automations & Workflows](feature-pages/automations-workflows.md) ⚠️ visual workflow engine pending `main` merge — confirm before publishing
- [AI Agent Platform (MCP)](feature-pages/ai-agent-platform.md)

## SEO (Phase 11)

- [SEO plan](seo/seo-plan.md) — page metadata table, OG/Twitter, JSON-LD, sitemap/robots, CWV, keyword map.
  - Notable finding: `robots.ts` is missing disallow rules for `/portal/`, `/approve/`, `/contract/`, `/oauth/` — flagged for a follow-up app change.

## AI SEO / GEO (Phase 12)

- [AI-SEO plan](seo/ai-seo-plan.md) — extractable-claims principles, semantic HTML + structured data, citable-facts block, knowledge-graph traversal, per-page AI-readiness checklist. Builds on the repo-root [`/llms.txt`](../llms.txt) and [`docs/agents/`](../docs/agents/).

## Before any of this goes live
1. App green (e2e residual) + git-history scrub (publish gate).
2. Capture the screenshots/GIFs each feature page's media-requirements table lists (Phases 5/6).
3. Re-confirm time-sensitive status flags (esp. the visual workflow engine merge).
