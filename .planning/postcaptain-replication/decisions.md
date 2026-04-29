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

## RESOLVED — solutions-cards "icon background tile" (phantom)

**Gap:** Vision-review consistently flags the solutions cards as having a
"rounded background tile behind each card icon" that does not match live.

**Decision:** No DOM tile exists. The rendered `card-grid` markup is just
`<svg class="text-primary mb-4 block" style="color:#5BA573">` with no
background. The tile-look the vision model picks up is the `mb-4 block`
bounding-box of the SVG against the white card surface — a perceptual
artifact, not a markup defect.

batch26 still tightens that area defensively (`background: transparent`,
`padding: 0`, `margin-bottom: 20px`) so the SVG bounding box reads as a
bare glyph; the bigger leverage in batch26 was moving the "Learn more →"
text-link to a bottom-right arrow-only icon, which closed the
solutions-section vision score from 78 → 88 in one round.

**Revisit when:** vision-review still scores < 88 on solutions despite
the bottom-right arrow being correctly rendered.

## ACCEPTED — cta-footer fb1 (logo+wordmark lockup proportions)

**Gap:** Live's footer brand block uses an inline lockup (logo h≈48px to
the LEFT, wordmark "POST CAPTAIN" / "CONSULTING" stacked on the right at
~15px / ~10px). Local's default `SiteFooterBlock` renders both at smaller
scale (logo h-10 / wordmark text-[10px]).

**Decision:** Closed via post-level customCss (batch28 superseding
batch24), scoped to `[data-block-id="footer-1"]`. Universal extension —
keying off the footer's data-block-id keeps other tenants unaffected.
If a future client needs a similar uplift, promote to renderer defaults
or expose a `lockupSize` prop.

**Lesson learned (batch24 → batch28):** The first attempt forced
`flex-wrap: nowrap` AND a 56px logo, which caused wordmark overflow into
the adjacent links column. The vision score dropped 85 → 65 in one round.
Never combine `nowrap` with an enlarged child without measuring the
container width first; allow wrap as a safety net.

**Revisit when:** the SiteFooterBlock renderer adopts a typed
`brandSize: 'sm' | 'md' | 'lg'` prop or the wordmark first-line is
emitted as a separate field instead of newline-split.

## ACCEPTED — stats-section IN READMIT COMPLETIONS label wrap

**Gap:** With logos pinned top-right of each metric card and the heading
column constrained by `padding-right: 110px`, smaller-screen renders of
the secondary label (`IN READMIT COMPLETIONS`, `BY ELIMINATING ADVANCE
BADGE PRINTING`) wrap onto two or three lines rather than the
single-line layout shown on live.

**Decision:** Accept the wrap. At 1440px desktop the label fits on one
line for short copy ("FROM 2,600+ DONORS"); longer labels naturally wrap.
Live's labels also wrap on narrower copy; the single-line vision-review
complaint is the exact-pixel-parity case, not the structural correctness
case. Stats holds at 78 — at noise-floor for two consecutive iterations.

**Revisit when:** the metric-cards block exposes `labelMaxWidth` /
`logoColumnWidth` props, or the underlying renderer switches to a
CSS-grid template that lets each row reflow independently.
