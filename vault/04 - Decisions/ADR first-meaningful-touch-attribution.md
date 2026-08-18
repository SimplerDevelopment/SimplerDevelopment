---
type: adr
domain: crm
status: accepted
date: 2026-08-11
sources:
  - lib/attribution.ts — the capture/parse helpers and their inline reasoning
  - drizzle/9022_crm_contacts_attribution_manual.sql
  - PR #43 (feat/first-touch-attribution)
---

# ADR: First-*meaningful*-touch attribution, carried in a cookie

## Status

Accepted — 2026-08-11, shipped in PR #43.

## Context

Nothing connected a lead to the campaign that produced it. A repo-wide search for
`utm_source` / `utm_campaign` / `attribution` returned nothing, and the analytics that
do exist are siloed per surface — `pitch_deck_views`, booking analytics, store
analytics, Resend open/click counters — with no join key between any of them and a
conversion. "Which campaign produced this client", the question that decides where
marketing spend goes, had no answer at all.

Three anonymous-identity mechanisms already coexisted without referencing each other:
the `sd_visitor` cookie (A/B bucketing only), a client-supplied `sessionId` on
`pitch_deck_views`, and a localStorage `visitorId` on chat conversations. None carried
a source.

The obvious solution — a pageview table plus an ingestion endpoint — is what a
general analytics product would build. At this operator's volume it would mean a write
on every request forever, in exchange for answering questions nobody is asking.

## Decision

Capture the campaign **once, at first touch, into an HttpOnly cookie** (`sd_attr`), and
copy it onto the CRM contact when that person actually converts. There is **no pageview
table and no write on ordinary traffic** — one row per lead, written at conversion.

Three specific choices inside that:

**1. First *meaningful* touch, not literally first.** A direct visit with no referrer
and no UTM records nothing, leaving the slot open, so a campaign click days later is
still captured. Strict first-touch would stamp "direct" on the first anonymous visit
and permanently discard the only signal with any value.

**2. Write-once at both ends.** The cookie is never overwritten, and an existing
contact is never re-attributed. Without the second rule, a returning lead is re-credited
to whatever they most recently clicked and first-touch silently degrades into
last-touch — the failure would be invisible in the data.

**3. On `crm_contacts`, not `crm_deals`.** First touch is a property of the *person*;
deals inherit it through `contact_id`. Storing it per-deal would duplicate a fact that
can only ever have one value per lead, and would invite the two copies to disagree.

Untrusted-input handling is load-bearing, because values arrive from an
attacker-controlled URL and then ride on every subsequent request: fields are capped at
128 chars on write **and again on read**, the cookie is refused past 1 KB, non-string
values are dropped rather than passed to the database, and only the referrer **host** is
stored — never the full URL, which routinely carries search terms or session tokens in
its query string.

## Consequences

- We can answer "which campaign produced this client". We **cannot** answer "what was
  their fifth touch" — multi-touch journeys need the pageview log this deliberately
  avoids. Revisit only if the volume ever justifies it.
- Someone who bookmarks the site, returns months later via an ad, and converts is
  credited to the ad. Accepted: that is closer to useful than crediting "direct".
- Clearing cookies loses first touch. Accepted — the alternative is server-side
  identity for anonymous traffic, which is a much larger commitment.
- The middleware hook uses a **denylist** of machine/authenticated prefixes rather than
  a list of marketing routes, so a new page is covered the day it ships rather than the
  day someone remembers the file.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| Pageview table + ingestion endpoint | A write per request forever to answer questions nobody asks at this volume. |
| Strict first-touch (record "direct") | Burns the slot on an anonymous first visit and discards the only signal worth money. |
| Last-touch | Simpler, but credits the closing click rather than the source that found them. |
| Reuse the `source` varchar(100) | Too small and flat for structured UTM data; unqueryable in any useful way. |
| Per-UTM columns | A future field (gclid, an affiliate id) would cost a migration each time. |
| Extend the `sd_visitor` cookie | Considered and dropped — `sd_attr` is self-contained, so A/B bucketing stays untouched. |
