# Crossover Capital — Family Attorney Referral Network Research

## Goal
Build a CRM contact universe of family-law attorneys (especially divorce
practice) across all 50 states + DC, populated into the Crossover Capital
Advisors tenant (`clientId = 103`). The intent is referral-partner outreach:
Crossover provides divorce financial planning, attorneys provide the cases.

## CRM model (decided)
- **`crm_companies`** = the law firm. One row per unique firm name + state.
- **`crm_contacts`** = the individual attorney. `companyId` → firm.
- **`crm_tags`** = `State: PA`, `State: NY`, … plus practice tags
  (`Family Law`, `Divorce`, `High-Net-Worth`, `Forensic Accounting`,
  `Business Valuation`, `Crypto Asset Disputes`).
- **Pipeline** (id 3): `Researched → Outreach Sent → Conversation →
  Meeting Booked → Active Referral Partner / Not a Fit`. New attorneys land
  in **Researched**.

## Source mix
The user picked *all* of: state bars, Justia, FindLaw/Avvo/Super Lawyers,
Google Places. After probing, the actual yield-per-effort ranking changed:

| Tier | Source                 | Status                                                              | Notes                              |
|------|------------------------|---------------------------------------------------------------------|------------------------------------|
| 1    | **AAML.org fellows**   | ✅ Open, paginated, no bot protection. ~1,329 elite fellows nat'l   | Best signal — these ARE the persona|
| 2    | Justia.com             | ⚠️ Cloudflare clears page 1 only — page 2+ blocked in headless      | Page 1 sample works; scale needs stealth tooling |
| 3    | Super Lawyers          | Not attempted in this pass                                          | Cloudflare-protected; same problem |
| 4    | State bar directories  | Not attempted in this pass                                          | Per-state captcha varies           |
| 5    | Google Places API      | Not attempted                                                       | Costs $; reserve for enrichment    |
| 6    | FindLaw / Avvo         | Not attempted                                                       | Cloudflare-protected               |

**Why AAML beat Justia:** AAML fellows are by definition the top family-law
attorneys (admission requires 10+ years + peer review + exam). They are
*exactly* Crossover's target referral persona — high-net-worth divorce
practice. So switching from "all PA family lawyers" to "all AAML fellows"
both solves the bot-protection problem AND raises signal quality.

**Pilot delivered:**
- 43 PA family-law attorneys via Justia (page 1 only — Cloudflare blocked further)
- ~1,329 AAML fellows nationwide (full crawl)

## Cloudflare reality (Justia)
Justia's page 1 cleared via Playwright, but `?page=2` returned the
Cloudflare "Just a moment..." challenge that headless Chrome could not
auto-solve within a 25s wait — even with `channel: 'chrome'` and a click on
the in-page NEXT link. To scale Justia would need:
  - playwright-extra + puppeteer-extra-plugin-stealth
  - or a Cloudflare-aware service (FlareSolverr, ScrapingBee, Bright Data)
  - or accept the per-state page-1 sample (~44 attorneys per state).

## Dedupe strategy
- Firm: lowercase normalized name + state (e.g., `weinberger divorce & family law group||nj`).
- Attorney: lowercase email when present, else `firstName||lastName||companyId`.
- Idempotent upserts — re-running the harvester for the same state
  must not double-insert.

## Field mapping (Justia → CRM)
| Justia field             | CRM target                              |
|--------------------------|-----------------------------------------|
| Firm name                | `crm_companies.name`                    |
| Firm address             | `crm_companies.address`                 |
| Firm phone               | `crm_companies.phone` + contact phone   |
| Firm website             | `crm_companies.website` + `domain`      |
| Attorney name            | `crm_contacts.firstName/lastName`       |
| Attorney email (if shown)| `crm_contacts.email`                    |
| Attorney profile URL     | `crm_contacts.notes` (prefixed `Justia: …`) |
| Practice areas list      | Tags (`Family Law`, `Divorce`, …)       |
| State (always)           | Tag `State: <abbr>`                     |
| Source (always)          | `crm_contacts.source = 'justia'`        |

All harvested contacts: `status = 'lead'`.

## Compliance notes
- Justia robots.txt allows `/lawyers/`. Honor crawl-delay if present
  (default to 1.5s between hits).
- No login required, so this is a pure read of public listing data.
- Persist a `User-Agent` identifying the harvester
  (`SimplerDevelopment Research Bot — info@danielpcoyle.com`) so it can be
  blocked cleanly if the source asks.
- This is research-only data ingestion; outbound email/contact must wait
  on a CAN-SPAM-compliant outreach pass that the user signs off on.

## Pilot scope (this run)
- **AAML primary harvest:** all 84 pages × 16 fellows ≈ 1,329 contacts,
  one row per fellow with state tag + firm rollup.
- **Justia spot sample:** 43 PA attorneys via page 1 of
  `https://www.justia.com/lawyers/family-law/pennsylvania`.

## Re-running the harvesters
```bash
# Re-crawl AAML (idempotent — upsert by AAML slug)
npx tsx scripts/migrations/crosscap/harvest-aaml.ts                # all pages
npx tsx scripts/migrations/crosscap/harvest-aaml.ts 1 5            # pages 1..5

# Justia per-state (page-1 sample only; page 2+ blocked by Cloudflare)
npx tsx scripts/migrations/crosscap/harvest-attorneys.ts pennsylvania
npx tsx scripts/migrations/crosscap/harvest-attorneys.ts new-jersey
```

## Out of scope (future)
- Tier 2–5 sources (Super Lawyers, state bars, Google Places, FindLaw).
- Outreach sequencing — that lives in the email/automation portal once
  Crossover signs off on copy and cadence.
- Enrichment via LinkedIn (rate-limited, separate playbook).
- Scoring (`crm_contacts.score`) — wait until we have a wedge of replies.
