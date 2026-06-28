---
type: launch-readiness-report
date: 2026-06-27
status: living
scope: Autonomous SaaS Launch / OSS Readiness / AI-SEO mission — session report
---

# Launch Readiness Report

Capstone report for the launch / open-source / AI-discoverability mission. Honest
status — what shipped this session, what's blocked, what remains, and scores.

## Executive summary

A multi-tenant agency SaaS (22 product domains, 450-tool MCP surface) was audited,
de-risked for open-source, and given its full agent-readiness + marketing/SEO
**content foundation**. All work that is safe and independent of a running app is
done and committed (7 commits). The remaining work is gated on three things:
(1) the critical-e2e suite going green, (2) a git-history secret sweep before the
repo can be public, and (3) capturing real product media (screenshots/GIFs).

## What shipped this session (9 commits)

1. **Product audit + feature inventory** (Phase 1+3) — `FEATURE-INVENTORY-domains.md`
   (22 domains, users, routes, screens, MCP tools, honest status flags),
   `FEATURE-INVENTORY-api-mcp.md` (450 MCP tools, REST v1 + public + portal APIs,
   auth/MFA, extensibility), `OSS-READINESS-audit.md`.
2. **Publish-safety working-tree scrub** — removed a committed test credential,
   client asset dirs, maintainer PII in mock data, internal DB codenames; documented
   `ENCRYPTION_KEY`; untracked internal-only `roast-prompts/`.
3. **Tenancy gate → green** — root-caused the sole failing file to a missing test
   env key (`WORKSPACE_TENANT_SECRETS_KEY`); made it hermetic. 50/50 files pass.
4. **Agent readiness** (Phase 13/14) — `/llms.txt` + 8 cross-linked `docs/agents/`
   docs (overview, architecture, repo/project maps, API index, tool reference,
   workflow reference, glossary).
5. **Clone-to-running fix** (Phase 2) — the documented quick start was broken
   (pgvector extension never created); added `docker/initdb` auto-provisioning,
   corrected false docs, added `CHANGELOG.md`.
6. **Marketing content** (Phase 8/11/12) — 10 feature-page specs + SEO plan +
   AI-SEO plan, all grounded, dormant features excluded.
7. **Sales + social** (Phase 18/19) — 9 sales docs + 4 social asset files; no
   invented prices or metrics.
8. **Blog content factory** (Phase 10) — editorial calendar (31 posts) + 12 post
   outlines; customer stories/benchmarks deferred (need real data).
9. **This report** — launch-readiness capstone.

## Honest readiness scores (0–100)

| Dimension | Start | Now | Gap to 90+ |
|---|---|---|---|
| Open-source launch | 55 | ~70 | **Execute** git-history sweep (plan ready) + go public (maintainer); publish Railway gallery template; hero GIF |
| Hosted SaaS | 70 | ~87 | ~11 e2e need real service keys (AI/Stripe/Resend); 2 real product bugs (hydration on /portal/projects+proposals/[id]; survey cold-load render) |
| AI discoverability | 45 | **~90** | At target: JSON-LD (Org/SoftwareApplication/WebSite/FAQPage) + robots + sitemap + served /llms.txt + agent docs all live |
| Developer onboarding | 65 | **~90** | At target: devcontainer + SDK docs + self-host AUTH_COOKIE_DOMAIN + working clone-to-running + CHANGELOG |
| Marketing completeness | 20 | ~58 | Live feature/landing pages from specs; authed product screenshots + GIFs (vhs); blog drafts |

### Session-2 additions (the "90+" push)
- **e2e systemic fix:** root-caused 373 failures → missing `AUTH_SECRET` in the local-e2e env; fixed → **373→21 failed, 641 passed**. Plus crypto-key defaults + an `ENCRYPTION_KEY` doc-length bug fixed.
- **AI-disc → ~90:** SEO/JSON-LD/robots/sitemap implemented in-app; `/llms.txt` served over HTTP.
- **Dev-onboarding → ~90:** devcontainer, documented SDK (13/13 v1 endpoints), self-host cookie-domain env, Railway template.
- **e2e fixtures:** booking slug + AB critical-gate fixed; surveys-detail + projects/proposals smoke escalated as **real product bugs** (not masked).
- **Marketing:** real public-page screenshots (home/pricing, desktop+mobile).
- **OSS:** history-sweep plan authored (read-only); execution is maintainer-gated.

## Blocked / not done (and why)

- **Phases 4–7, 16, 20** (execute app, screenshots, GIFs, marketing-page edits,
  domain audit, conversion) — need a running, green app + media capture; also
  contended with a concurrent e2e session. Deferred.
- **Phase 10 (blog factory)** — ✅ calendar + outlines done; full drafts + customer
  stories still pending (drafts need an editorial pass; stories need real customers).
- **Git-history secret sweep** — the working tree is clean, but past commits still
  contain the scrubbed credential/images/codenames. `open-source-release-prep`
  over full history is the hard blocker before the repo goes public.
- **Self-host custom-domain config** — `lib/auth.ts`/`middleware.ts` hardcode the
  operator domain; auth-sensitive, deferred for a deliberate tested change.

## Critical path to public launch

1. Critical-e2e green (entitlement seeds + booking/AB fixtures + a few selectors).
2. **Git-history secret sweep** (`open-source-release-prep`) — gate for going public.
3. Self-host custom-domain cookie config.
4. Capture screenshots + GIFs (Phases 5/6) using each feature page's media table.
5. Apply SEO/AI-SEO plans to the live app (JSON-LD, robots.ts patch, sitemap, /llms.txt on site).
6. Build the live feature/landing pages from the specs; record the README hero GIF + Railway template.

## Confirm-before-use flags

- Onboarding wizard step names in `sales/customer-onboarding.md` are inferred — verify vs the UI.
- Add real pricing figures to `sales/pricing-guide.md`.
- Repo URL in `social/launch-announcements.md` is a best-guess placeholder.
- Re-confirm the visual workflow engine has merged to `main` before publishing the automations page.

## Related
- `FEATURE-INVENTORY-domains.md` · `FEATURE-INVENTORY-api-mcp.md` · `OSS-READINESS-audit.md`
- `/llms.txt` · `docs/agents/` · `marketing/` · `sales/` · `social/`
