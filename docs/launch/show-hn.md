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

## r/selfhosted  (same day, a few hours after Show HN)

> ⚠️ Verify the sub's current self-promo rules + flair before posting — these
> are being confirmed in a follow-up research pass. r/selfhosted is strict
> about "is this an ad."

**Title:**
```
I open-sourced our agency's all-in-one platform — self-hostable (Postgres + Docker), Apache-2.0
```

**Body:** lead with self-hosting (docker-compose, BYO Postgres+pgvector, no
phone-home), then the feature breadth, then the MCP angle as the kicker.
Disclose the agency origin in the first line. Link the repo + docker-compose.

---

## r/mcp  (same day — most receptive room)

**Title:**
```
A full multi-tenant SaaS exposed as 200+ MCP tools — open-source, self-hostable
```

**Body:** go deep on the MCP design (per-domain registration, scope guards,
token budgeting). This audience wants the agent-operability detail, not the
marketing. Link `docs/api/mcp/overview.md`.

---

## Hold for a separate day — Product Hunt + design channels

The visual-editor / block-CMS angle suits Product Hunt and design communities,
not HN. Launch it as its own event later in the mini-launch-week (see playbook
§5). PH cold-account specifics are being confirmed in the follow-up research.
