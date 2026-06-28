# Launch post drafts

Paste-ready copy for launch day. Derived from the OSS Launch Playbook
(`vault/05 - Feature Specs/OSS Launch Playbook.md`). Honesty + agency
disclosure are deliberate — they are the astroturf antidote, not optional.

> ⚠️ Before posting: the hero GIF (`docs/launch/demo.gif`) and a live demo /
> deploy link must exist. HN converts at ~1.4 stars/upvote — the repo, not the
> thread, closes the sale.

---

## Show HN

**When:** Sunday ~7pm ET / Monday 00:00 UTC (best slot), cresting into the
12–17 UTC window. Post once. Never delete-and-resubmit a flop (it flags you).

**Title** (≤80 chars, no hype words, "I built this" framing):

```
Show HN: Open-source platform you operate entirely via 200+ MCP tools
```

Alternate titles to A/B in your head (pick one, don't repost):
- `Show HN: I open-sourced an all-in-one agency platform that's fully agent-operable`
- `Show HN: A self-hostable site builder + CRM + RAG, all driven by MCP tools`

**URL:** the GitHub repo (not a landing page — HN prefers the source).

**Pinned first comment (post immediately, as yourself):**

```
Author here. I run a small web/dev agency and over the last year I rebuilt our
internal stack — the thing we used to cobble together from a site builder, a
CRM, an email tool, a booking app, and a knowledge base — into one
self-hostable Next.js codebase, and open-sourced it (Apache-2.0).

The part I think is actually interesting: it's MCP-native. There are 200+
Model Context Protocol tools covering the whole surface — content, CRM, the
RAG "Company Brain", email, bookings, billing — so you can point Claude /
Cursor / any MCP client at it and *build a site or run a campaign by talking
to an agent*, not just chat about it. The repo itself was built largely
agent-first, which is partly why the tool coverage is so wide.

Disclosure: this is our agency's internal platform, so I have an obvious bias —
I'm sharing it because the MCP-everywhere approach is the genuinely novel bit
and I'd like feedback on it, not to sell you anything (it's Apache-2.0, run it
yourself).

Stack: Next 16 / React 19 / Drizzle + Postgres(pgvector) / Bun. Honest rough
edges: <name 1–2 real ones — e.g. one-click deploy still needs manual env,
multi-tenant setup docs are thin>.

Demo: <link>   ·   One-click deploy: <link>   ·   docs: docs/mcp.md

Happy to answer anything about the architecture, the MCP tool design, or what
it was like building something this size agent-first.
```

**Comment discipline:** camp the thread for the first several hours. Reply to
every substantive comment. Never ask anyone to upvote. If it stalls below ~10
points in 2 hrs, let it die quietly — do not repost.

---

## Reddit — sequencing & the one rule that matters

HN is the engine (front-page HN ~10K–50K visits vs a strong PH day ~3K–15K;
Open SaaS saw HN drive >3x PH traffic); Reddit is a same-/next-day amplifier.
**The dominant risk for an agency-owned repo is looking commercial.** Documented
failure: a self-hostable OSS project (OpenAlternative) hit **250+ upvotes on
r/selfhosted, then was *removed* the moment the maker added a Stripe pay link.**
So on EVERY Reddit post: no pay links, no agency CTA, no "hire us", no upsell.
Lead as a maker sharing a thing. Disclose you built it. That's the antidote.

> ⚠️ Before posting, open each sub's **rules page / sidebar** — exact self-promo
> ratios, required flair, and AutoModerator new-account filters remain unverified
> per sub. The *norms* below are evidence-backed; the *mechanical rules* are not.

### r/selfhosted  (same day, a few hours after Show HN — strongest Reddit room)
**Title:**
```
I open-sourced our internal all-in-one platform — self-hostable (Docker + Postgres), Apache-2.0
```
**Body:** lead with self-hosting (docker-compose, BYO Postgres+pgvector, no
phone-home, your data stays yours), then feature breadth, then the MCP angle as
the kicker. Disclose "I built this / it's our internal stack" in line one.
**No pricing, no pay link, no agency mention beyond the honest disclosure.**
Realistic: a genuine self-host post can reach 250+ upvotes here.

### r/mcp  (same day — most receptive to the core angle)
**Title:**
```
A full multi-tenant SaaS exposed as 200+ MCP tools — open-source, self-hostable
```
**Body:** go deep on MCP design (per-domain registration, scope guards, token
budgeting). This audience wants agent-operability detail, not marketing. Link
`docs/api/mcp/overview.md`. *(Sub norms unverified — read the sidebar first.)*

### r/SideProject + r/coolgithubprojects  (low-risk cross-posts, same/next day)
Both **explicitly welcome "I built this" OSS posts** — lowest removal risk. Good
for a credibility signal + a few stars; low raw traffic, don't expect a spike.
r/coolgithubprojects wants a GitHub link; r/SideProject rewards a personal-story
title + a demo GIF.
```
I built an open-source, MCP-native all-in-one platform (sites + CRM + RAG + email + bookings) [Apache-2.0]
```

### r/opensource  (optional)
Tolerant of OSS shares but **its exact rules are unverified** — check the wiki
first; lead non-commercial, same as above.

---

## Product Hunt — DEFER or SKIP for a cold launch

PH is the **weakest channel for a no-audience repo**. Even a **#2-of-day finish
(OpenStatus, 416 upvotes) produced only ~687 visits, ~10 users, 0 paying, and
negligible stars.** PH front-loads the first ~2–4 hours on vote *velocity*,
**discounts/zeroes votes from brand-new accounts, and can unfeature you** —
coordinating new-account upvotes is exactly what triggers removal (the agency
astroturf trap).

**Recommendation: don't fire a cold same-day PH launch.** Skip it, or run it as
its own prepared weekday event **only if you can queue ~20–30 real, warm
supporters**. If you do:
- **Self-hunt** (don't use an external hunter — 79% of featured posts are self-hunted).
- Go live **12:01 AM PST, weekday**.
- **OSS framing is an asset here** — add the GitHub link + tag the listing
  **"Open Source"** (Papermark credited ~40% of its votes to the OSS community).
- Expect PH to *feed* GitHub trending alongside HN, not to produce stars alone.

The visual-editor / block-CMS angle is the natural PH/design-channel story if
you do run it — save it for that event rather than HN.

---

## Timing note (unresolved — your call, kept open)

Two sources disagree on the best HN slot: **Sunday ~7pm ET** (best modeled shot
at cracking 50 points, but a low-volume weekend) vs the **12–17 UTC weekday
window (~7am–12pm ET)** for star accrual (~+200 stars vs poor timing). Decision
deferred — pick when the demo GIF + deploy are ready and you set the date.
