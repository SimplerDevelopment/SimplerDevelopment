---
type: playbook
domain: go-to-market
status: planned
date: 2026-06-25
sources: []
tags:
  - marketing
  - oss
  - launch
---

# SimplerDevelopment — Cold-Start OSS Launch Playbook

Related: [[Go-To-Market — Self-Serve SaaS]] · [[GTM Launch Board]] · [[Competitive Gap Analysis 2026-06]] · [[Market-Ready Product — PRD]]

Context: SimplerDevelopment is being open-sourced (Apache-2.0, MCP-native, all-in-one multi-tenant platform: per-tenant sites + block CMS/visual editor + CRM + AI Company Brain RAG + automations + bookings + storefront + email + e-sign + Stripe billing, driven by 200+ MCP tools). Goal = credibility/portfolio/hiring but adoption-tolerant. Audiences: agency prospects, recruiters, dev peers (HN/Reddit), AI/Claude/MCP ecosystem (sharpest wedge). Status: not yet public. Distribution: cold start (no HN karma, no following, no demo). Timeline: ASAP (days). Bandwidth: a few hrs/week sustained. Derived from a live deep-research pass (12 verified findings, 25 sources).

---

## 0. Calibrate expectations

- Show HN median = 2 points; 50+ = top 6%; 250+ = top 1% (n=188,085).
- HN upvotes convert to GitHub stars at ~1.4 stars/upvote, weak correlation (r=0.29). README is the load-bearing conversion asset, not the thread.
- Realistic "good" week one: break ~50 HN points -> low-hundreds of stars, not thousands. The "AI repos get ~289 stars/week" benchmark was REFUTED — do not anchor on it.
- Win condition is a sequence of shots (mini launch week) + durable listings, plus a repo good enough to convert traffic.

---

## 1. Positioning lock

Every comparable winner led with "open-source [self-hostable] alternative to [named incumbent]" (Dub vs Bitly, Documenso vs DocuSign, Twenty "alternative to Salesforce" -> 378 pts HN). All-in-one resists a single "alternative to X", so lead with the MCP/agent angle as the wedge:

> "Open-source, MCP-native platform — operate an entire agency stack (sites, CRM, email, bookings, RAG knowledge base) by talking to an AI agent. 200+ MCP tools, self-hostable."

Breadth = proof of depth behind the MCP hook, not the headline.

---

## 2. Pre-launch micro-runway (3-5 days before)

- **Above-the-fold demo GIF:** a vhs terminal GIF of Claude/Cursor invoking MCP tools (vhs is MIT, built for this; Gifski/ScreenToGif for UI). Highest ROI.
- **Re-order README** to proven layout: centered logo -> one-line "alternative to X" value prop -> checked feature list each linking to docs -> product screenshot/GIF immediately after, above the fold -> then docs/architecture/badges (mirrors Supabase).
- **One-click deploy:** Railway template (Postgres + pgvector + Next app) and/or Vercel deploy button (auto-provision DB+env+migrations). Add button to README top.
- **Live read-only demo instance** if bandwidth allows (Railway/Render). No required wipe cadence (that claim was refuted); periodic reset+seed is fine.
- **Create HN + Reddit accounts now** (not launch morning); make genuine comments so accounts aren't zero-history. SKIP Lobsters entirely (invite-only; new accounts <70 days can't submit new domain or use [show] tag).

---

## 3. Launch-day sequence

Match channel to content type; breakout comes from one well-placed technical post.

### PRIMARY — Show HN (MCP/technical angle)

- **Timing:** Sunday ~7pm ET / Monday 00:00 UTC (best slot ~10.8% reach 50+), cresting into 12-17 UTC window. (Timing % are directional.)
- **Title:** "Show HN: I built an open-source platform you operate entirely via 200+ MCP tools"
- **First comment (you, immediately):** honest backstory, built agent-first with Claude Code, DISCLOSE agency affiliation, link demo + deploy button, say what's rough.
- Camp the thread for hours; answer every comment genuinely.

### SAME-DAY SECONDARY

- r/selfhosted (self-hostable all-in-one angle)
- r/mcp / MCP community (most receptive)

Note: Reddit/PH specifics unverified — general norms only.

### HOLD for a separate day

Visual-editor/CMS angle -> Product Hunt + design channels.

---

## 4. MCP-ecosystem listings (durable wedge)

- **Official MCP Registry** registry.modelcontextprotocol.io (publish server.json keyed to verified GitHub/domain ownership; still "preview").
- **Claude Connectors Directory** — submit inside Claude.ai admin settings; Org Owner/Primary Owner submits. Do NOT assume Team/Enterprise required (that was refuted).
- **Secondary:** Smithery, Glama, PulseMCP, awesome-mcp lists.

---

## 5. Post-launch sustain cadence (~few hrs/week)

Scale Supabase "Launch Week" down to a mini launch week — one staggered post per theme:

| Week | Post | Channel |
|------|------|---------|
| 1 | Platform/MCP Show HN + registry listings | HN, MCP ecosystem |
| 2 | Visual-editor/block-CMS post | Product Hunt, design channels |
| 3 | Company Brain/RAG angle | AI-builder community, r/LocalLLaMA-adjacent |
| 4 | "How I built a 357k-line platform agent-first with Claude Code" write-up (the credibility/portfolio payload) | HN, dev blogs |

Ongoing 1-2 hrs/wk: answer issues/comments fast, keep demo alive, one build-in-public post/week.

---

## 6. Calibrated success metrics

| Metric | Floor | Target |
|--------|-------|--------|
| Show HN points | ~2 (median) | 50+ (top 6%) |
| Week-one stars | dozens | low-hundreds (~1.4x upvotes) |
| MCP listings live | — | 2 official + 3 secondary |
| Inbound DM/email from prospect or recruiter | — | track separately; matters more than star count |

---

## 7. Anti-patterns (agency-repo astroturf risk)

- Post as real maintainer, first person, "I built this."
- Disclose agency affiliation in the post body (undisclosed affiliation is the trust-killer).
- Never solicit/seed upvotes from colleagues (Lobsters publishes invite tree to surface voting rings; HN/Reddit penalize it).
- Keep self-promo a minority of overall community activity.
- Don't delete-and-resubmit a flopped Show HN (flags you).

---

## 8. Evidence gaps (honesty)

- Reddit + Product Hunt CHANNEL strategy is now evidence-backed (see §9, research pass #2). What remains unverified: the *mechanical* sub rules — r/opensource rulebook, r/selfhosted's exact self-promo ratio / required flair / AutoModerator new-account filter, and r/mcp norms. Read each sub's sidebar before posting.
- Timing percentages rest on one blog's bucketed analysis — directional. The two HN-timing sources actively conflict (Sunday 7pm ET vs 12–17 UTC weekday) — slot DECISION DEFERRED.
- Supabase "10x overnight / second to Stripe" is self-reported, not audited.
- No reliable week-one star benchmark exists — metric numbers are derived, not cited. (The ~289-stars-week and Papermark-250-stars figures were both REFUTED — do not cite.)

---

## 9. Channel addendum — Reddit + Product Hunt (research pass #2, verified)

**Sequencing:** HN is the engine (front-page HN ~10K–50K visits vs strong PH day ~3K–15K; Open SaaS: HN >3x PH traffic) and feeds GitHub trending. Lead HN → same/next-day Reddit → PH deferred. Evidence supports amplification over cannibalization, but the specific "PH-first then HN stagger" ordering was REFUTED — the order below is reasoned synthesis.

**The one rule for an agency-owned repo:** the dominant risk is looking commercial. OpenAlternative hit 250+ upvotes on r/selfhosted then was REMOVED after adding a Stripe pay link. So on every Reddit post: no pay links, no agency CTA, no upsell — lead as a maker, disclose you built it.

- **r/selfhosted** (strongest Reddit room): genuine self-host post can reach 250+ upvotes. Lead with docker-compose / BYO Postgres / no phone-home, then breadth, then MCP. Strictly non-commercial.
- **r/SideProject + r/coolgithubprojects**: explicitly welcome "I built this" OSS posts — lowest removal risk; good for credibility + a few stars, low raw traffic.
- **r/mcp** (most receptive to core angle) + **r/opensource** (optional): tolerant, but norms/rules unverified — read sidebar first.
- **Product Hunt — DEFER or SKIP cold.** Weakest no-audience channel: even #2-of-day (OpenStatus, 416 upvotes) → ~687 visits, ~10 users, 0 paying, negligible stars. PH scores vote velocity in the first ~2–4h, discounts/zeroes brand-new-account votes, and can unfeature (coordinating votes = the astroturf trap). Run only as its own prepared weekday event (self-hunt, 12:01 AM PST) IF ~20–30 warm supporters can be queued. OSS framing is an asset there (GitHub link + "Open Source" tag; ~40% of Papermark's votes came from the OSS community); PH feeds GitHub trending alongside HN, doesn't produce stars alone.

Paste-ready post drafts for all of the above live in `docs/launch/show-hn.md`.

Pass #2 sources: smollaunch (PH vs HN); docs.opensaas.sh; openstatus.dev postmortem; OpenAlternative (IndieHackers + kulpinski.dev); papermark.com; toffu.ai / GummySearch (sub data); producthunt.com guides; fmerian/awesome-product-hunt.

---

## Sources

danfking "Show HN by the Numbers"; arXiv 2511.04453; dub.co/blog; Documenso launch (Medium); Twenty HN id=40648082; charmbracelet/vhs; gifski; supabase.com/blog/supabase-how-we-launch; railway.com/deploy/open-saas; supabase master README; lobste.rs/about; registry.modelcontextprotocol.io; claude.com/docs/connectors; Tallyfy MCP-listing guide; Reddit astroturfing analysis.
