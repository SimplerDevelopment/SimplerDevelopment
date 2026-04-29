# postcaptain replication — architectural decisions

Open questions resolved (or accepted as gaps) during the homepage
replication push. Each entry: the decision, the rationale, and the
trigger conditions for revisiting.

## ACCEPTED — hero h1 (slim vs tall hero)

**Gap:** Live's hero is ~1581px tall on desktop and includes a
multi-element layout (logo strip, scroll-cue, gradient fade,
trust-band). Local's hero is intentionally slim (~311px) with a
flat CTA pair and a logo strip wrapped inside the hero block.

**Decision:** Keep the slim hero. The ~1270px height delta is a
layout-philosophy gap, not a styling gap — closing it would require:

- A new `hero-tall` block variant (or a `heightVariant` field on
  the existing hero block) that brings in additional padding,
  scroll-cue chrome, and an optional embedded trust-band.
- Restructured grid for the trust-band logos: live uses a
  scrolling-marquee row (~140px tall), not the static 6-column
  grid we ship.

This is universal-block-eligible work but is too heavy for a polish
batch. The slim hero scores 85 in vision-review and is brand-coherent.
Defer until a future "hero block redesign" track is opened.

**Revisit when:** the hero block gets a redesign sprint, or a new
client site requires a tall-hero variant.

**Closed in this push:**
- h2 (secondary CTA solid white) — batch21
- h3 (subheading width) — batch21

## ACCEPTED — services sv2 (live's "ARROW FORWARD" icon-name leak)

**Gap:** Live's "Learn More" button shows the literal text
"ARROW FORWARD" — a Material Icons ligature that didn't substitute
to a glyph. Local renders a proper arrow.

**Decision:** Do not match the bug. Local is correct.

**Revisit when:** live fixes the bug and we need to re-baseline.

## ACCEPTED — team t4 (flip-card vs flat photo treatment)

**Gap:** Local uses `team-flip-grid` (white card with a flip
animation revealing a Q&A on hover). Live uses a flat photo + name
treatment with no card chrome.

**Decision:** Keep the flip-grid. Both treatments are brand-coherent
and the flip-grid surfaces additional team context (the bio + Q&A) in
a way the flat treatment cannot. Adding a `variant: 'flat' | 'flip'`
flag to the team block would be a clean universal extension if we
later decide we want to match live exactly, but at score 88 the
treatment is not the leverage point.

**Revisit when:** owner explicitly asks for the flat layout, or a new
client site needs both variants.

## RESOLVED — st5 (per-metric link schema extension)

**Decision:** No schema change required.

The `MetricCardsBlock` type already supports `link` + `linkText`
per metric and the renderer (`MetricCardsBlockRender`) already
emits a horizontal-separator + `arrow_forward` icon next to the
linkText when `metric.link` is set. Post 302's metrics were already
wired in batch16 with `link: '#'` and `linkText: 'Case Study'`.
This is a universal feature that ships today; only the per-metric
URLs need to be set when individual case-study pages exist.

**Revisit when:** building out the case-study landing pages — set
real hrefs on each metric.

## RESOLVED — services sv1 (circular icon badges)

**Decision:** Use a scoped customCSS rule on the services-section
to render existing list items as circular icon badges. Done in
batch21 by injecting Material Icons spans into each `<li>` and
styling `.seu-icon` as a 44px circular tinted badge.

This is universal: any block whose text content uses `seu-list` or
a similar opt-in class can adopt the same treatment without changes
to the block schema. Migrating the underlying block to a structured
"icon-list" type remains a follow-up if the pattern spreads to
multiple sites.

**Revisit when:** the icon-list pattern is needed by 3+ blocks /
sites — promote to a first-class block type.
