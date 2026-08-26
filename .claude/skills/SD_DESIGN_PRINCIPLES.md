# SimplerDevelopment Content Skills — Design Principles

**Audience:** every `sd-create-*` and `sd-build-*` skill should consult this file before authoring blocks. It encodes:

1. A short anti-AI-slop discipline (so output doesn't read as "generic LLM landing page").
2. WCAG-AA accessibility floors with the exact contrast formula.
3. Branding rules — when to apply the logo, which color to pick from the profile.
4. A 5-dimension self-review the skill should run **before** returning the approval URL.

Distilled from the vendored `huashu-design` skill (`.agents/skills/huashu-design/`), the WCAG 2.2 spec, and field experience from the autonomous test run that produced post 698 / deck 350 / campaign 36.

---

## 1. The cut test — the most important rule

> **"If deleting this element doesn't make the design worse, delete it."**

Apply ruthlessly. The most common AI-design failure is gold-plating: adding sections, icons, badges, and "social proof" rows until the page is visual noise. Before adding anything, ask: "is this necessary or am I performing busyness?" If the page hits the brand promise in 5 blocks, ship 5 blocks. Don't pad to "look more landing-page-y."

The corollary: **the itch to "add something to make it nicer" IS the AI-slop tell.** Sit with the urge. Don't act on it.

---

## 2. The system, stated up front

Before authoring the first block, the skill should **state the system to itself** (and the user, in the response):

- **Palette** — primary + secondary + accent + 1 surface neutral. **Max 4.** Lifted from `.sd/config.json:brand.primaryColor / secondaryColor / accentColor` plus white/near-black neutrals.
- **Type pairing** — display + body. Defaults `Inter / Inter` if no brand override. If the brand has a custom heading font, use it.
- **Section rhythm** — agreed spacing system (8pt grid) and section vertical padding (96px desktop / 64px mobile baseline).
- **Image policy** — real photography, illustrated, or geometric? Default: real photography. **Never SVG-draw imagery** (people, scenes, products). Use icons (Lucide / Heroicons / Material Icons) ONLY for 16–32px decorative chrome.

A 4-line "design system" preamble in the skill response saves a whole round-trip of "this doesn't look right" from the user.

---

## 3. Anti-cliché — banned defaults

These read as AI output because every LLM landing page in 2025 used them. Pick something else.

**Fonts** — banned: **Inter** (unless the brand explicitly mandates it), Roboto, Arial/Helvetica, pure system stack, **Fraunces**, **Space Grotesk**. Preferred fresh picks: **Instrument Serif** (display), **Cormorant** (editorial display), **Bricolage Grotesque** (display), **JetBrains Mono** (technical). Note: Inter is the SD house font, so it IS the right pick FOR SimplerDevelopment — but for client work, lift the brand's font.

**Colors** — banned: purple → pink → blue gradients on the hero, neon-on-dark "cyber" palettes (unless brand is genuinely cyber), gradient text on every heading. Define colors in **oklch**, not hsl — `oklch(60% 0.2 27)` gives clean lightness ramps that hsl can't. Cap: 1 primary + 1 secondary + 1 accent + grayscale. **More than 5 colors on the page = problem.**

**Layouts** — banned: bento grid (over-used), the hero + 3-col features + testimonials + CTA template, card grids where every card is identical, the rounded-12px-card-with-4px-left-accent-border that's become "the AI signature." Use **asymmetric** grids, **mixed sizes**, **column-spanning** cards. Pick one section that doesn't follow the same rhythm as the others.

**Microcopy** — banned: "Unlock", "Empower", "Supercharge", "Elevate", "Transform". The "stop verbing my noun" rule.

**Imagery slop** — `<svg>` "person at desk" illustrations, `<svg>` "hand pointing at chart" hero. **A gray rectangle labeled `illustration 1200×800` is 100× better than a clumsy AI SVG hero.** Either use real photography or leave a placeholder for the user to drop in a real image.

---

## 4. The 8pt grid (spacing system)

Every spacing value comes from this set: **`8, 16, 24, 32, 48, 64, 96, 128`**. Margins, paddings, gaps — all of them. Never 10, 14, 18, 25.

Hero section vertical padding: 96 (desktop) / 64 (mobile).
Section vertical padding: 96.
Card grid gap: 24 (tight) or 32 (loose).
Element-to-element: 16 inside a card, 24 between blocks inside a section.

This single rule fixes 80% of "the design feels slightly off" feedback.

---

## 5. Hierarchy — pass the squint test

When you squint at the page, you should see **3–4 levels** of importance, not 10 or 1. Achieve that via:

- **Title : body contrast ≥ 2.5×** (rule of thumb: body 16px → hero title 48–64px → section heading 36–44px). NEVER ship a hero title under 36px.
- **One bold weight per heading level.** Don't stack 700 on h1, 700 on h2, 700 on h3. Use 800 on h1, 700 on h2, 600 on h3.
- **Color contrast** drives hierarchy too — body text gray-700 (#374151), heading slate-900 (#0F172A), accent on CTAs only.
- **Whitespace beats borders** — separate sections by 96px of vertical breathing room, NOT by 1px gray dividers.

---

## 6. Accessibility — WCAG-AA floors (load-bearing)

**These are non-negotiable.** Skills MUST run contrast checks before returning the approval URL.

| Surface | Minimum ratio | Notes |
|---|---|---|
| Body text vs background | **4.5 : 1** | Below this = WCAG fail |
| Large text (≥ 18.66px bold, or ≥ 24px regular) vs background | **3 : 1** | |
| UI components / focus indicators | **3 : 1** | |
| Tap targets | **≥ 44 × 44 px** | hands, not cursors |
| Body font size | **≥ 14px web** (16px preferred for older audiences) | iOS auto-zooms anything under 16px on input fields — use 16px on form controls |
| Line height | **1.5–1.7** | (1.7–1.8 for CJK text) |

**How to compute contrast.** Use the WCAG formula:

```
L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin     (relative luminance)
where R_lin = ((R/255) ≤ 0.03928) ? (R/255)/12.92 : ((R/255 + 0.055)/1.055)^2.4
contrast(c1, c2) = (max(L1, L2) + 0.05) / (min(L1, L2) + 0.05)
```

**Or call the MCP tool** `branding_check_contrast` with foreground + background hex. Use it — don't eyeball.

**Common failure mode:** white text on the brand's accent color. Many brands have an accent (e.g. `#06B6D4` cyan) that fails contrast against white — and AI-generated landing pages happily render white-on-cyan CTAs that are unreadable. Always test the CTA text/bg combo. If it fails, swap the foreground to near-black or change the CTA bg to the primary.

**Other a11y essentials:**

- `<button>` and `<a>` need accessible names. Don't ship an icon-only button without `aria-label`.
- Heading hierarchy in order: one `h1` per page, then `h2`, `h3`, no skipping levels.
- Form labels: visible, never placeholder-only.
- `prefers-reduced-motion` respected — gate any auto-playing animation behind it.
- Images: `alt` text describes content for informational images; empty `alt=""` for purely decorative ones.

---

## 7. Branding by default — use the logos

`.sd/config.json:brand` carries logo fields populated by `sd-init`:

- `logoUrl` — the canonical wide logo (for headers, footers, deck covers).
- `logoSquareUrl` — square crop (for favicons, app-icon contexts, OG images).
- `logoRectUrl` — rectangular crop alternative.
- `logoIconUrl` — icon-only mark (for tight contexts, loading states).
- `logoText` — fallback wordmark if no image is available (e.g. "SimplerDevelopment").
- `logoAlt` — accessibility alt text for the logo.

**Where each skill should drop a logo automatically:**

- **`sd-create-page`** — `image` block at the top of the hero IF the hero `style.backgroundColor` is dark enough to contrast the logo. If the brand only has `logoText`, render it as an `image` block with the text styled (small uppercase, letterSpacing 0.2em, color = accent).
- **`sd-create-deck`** — Cover slide gets the wide logo top-left or centered above the eyebrow. Every other slide gets the icon-only mark in the bottom-right at 32px (or `showSlideNumber: false` if the layout is too busy).
- **`sd-create-email`** — Header gets `logoUrl` as the first row, max-height 40px, top-center alignment. Footer can repeat the wordmark in muted gray.
- **`sd-create-survey`** — Survey title screen gets the logo if `styling.showLogo !== false`.

**Never invent a logo.** If the brand profile doesn't have one, leave a clearly-labeled placeholder and surface that gap in the response: "Brand profile is missing `logoUrl` — page renders the wordmark; upload a logo via `branding_update_profile` to elevate."

---

## 8. The 5-dimension self-review (run before returning approval URL)

For every piece of authored content, the skill should score itself 1–10 on each dimension and surface a one-line note in the response. If any dimension scores under 6, surface the gap explicitly instead of pretending it's done.

### Dimension 1: **Philosophy alignment**
Does the design carry the brand's `toneOfVoice` and `brandPersonality`? An anti-jargon brand should NOT have "Unlock unprecedented growth." Score from 1 (alien voice) to 10 (every detail reinforces the brand register).

### Dimension 2: **Visual hierarchy**
The squint test. Can a 5-second skim identify the value prop, the proof, and the CTA? Score 1 (everything is flat or fighting for attention) to 10 (3–4 clear levels, eye moves naturally).

### Dimension 3: **Craft quality**
- Spacing on the 8pt grid?
- Headings paired with eyebrows?
- Heroes fully populated (title + subtitle + description + CTA)?
- ≤ 2 type families, ≤ 4 colors, ≤ 5 if you really need to?

Score 1 (visibly hand-rolled) to 10 (looks like senior IC produced it).

### Dimension 4: **Functionality**
Apply the cut test to every block: would the page be worse without it? If the answer is "not really," delete the block. Score 1 (heavily padded) to 10 (each block earns its place).

### Dimension 5: **Originality (within the brand)**
Avoid the rounded-card-with-left-accent-border template. Avoid the hero + 3-cols + testimonials + CTA template. Find one moment of unexpected layout (a column-spanning callout, a vertical stat row, an asymmetric two-column where one side is 60% and the other is 40%). Score 1 (template-copy) to 10 (recognizably this brand).

**The output format** — in the skill's response after the approval URL:

```
Self-review (1–10):
  Philosophy 9 — brand voice carries the lede, CTAs match.
  Hierarchy 8 — hero clear, mid-page could lose one section.
  Craft 9 — 8pt clean, eyebrow+heading pattern used 6x.
  Functionality 7 — testimonial may be dead weight; user can drop it.
  Originality 6 — uses the standard hero+cols spine; consider next iteration.
Quick wins (if you have 5 min):
  1. Delete the stats row — duplicates the hero subhead.
  2. Real photography for the hero — gray placeholder reads as AI.
  3. Move CTA-2 above the fold; bottom CTA is rarely scrolled to.
```

---

## 9. Email-specific tweaks

Emails are constrained — they render in clients (Gmail, Outlook, Apple Mail) that strip `<style>`, drop CSS variables, reject `prefers-color-scheme`. Rules in addition to the above:

- **Use `<table>` layouts only.** Modern flexbox/grid don't reliably render in Outlook.
- **Inline every style.** No `<style>` block, no external stylesheet. The renderer does this automatically; if you're hand-rolling HTML, do it yourself.
- **Max width 600px.** Below 600 = squashed on desktop, above 600 = side-scroll on mobile.
- **Body font 16px** (a hair larger than web baseline because email clients render small).
- **Buttons need `role="button"`** and `aria-label` if the visible text doesn't describe the action.
- **Dark mode:** Apple Mail and Outlook 365 invert backgrounds. Use `[data-ogsc]`-prefixed selectors only if you've tested them; otherwise pick a neutral palette that survives inversion (avoid pure white bg + colored text).
- **Logo in header — max-height 40px**, never bigger. Email-header logos at 80px+ look amateur.

---

## 10. Deck-specific tweaks

Decks render at presentation scale — projector or screen-share — so the floors shift:

- **Body text ≥ 24px**, ideal 28–36px. Anything smaller is illegible at 10 ft.
- **Hero titles 60–120px** depending on slide density.
- **One concept per slide.** If you can identify two ideas, split it.
- **Speaker notes (`slide.notes`)** for every slide. The presenter needs them; the author shouldn't make them up at present-time.
- **Per-slide `pageSettings.backgroundColor`** for visual rhythm — alternate dark/light section breaks so the deck has a pulse.
- **Footer logo** at 32px bottom-right on content slides; cover slide gets the wide logo prominent.

---

## 11. The "real content" rule

**No data slop.** Never write "10,000+ customers", "99.9% uptime", "trusted by Fortune 500 companies" unless those numbers came from the user or `branding_get_messaging`. Leave a clearly-labeled placeholder:

```
[STAT TBD — ask user for: # of customers, uptime %, retention %]
```

**No quote slop.** Never invent customer testimonials. Use:

```
[TESTIMONIAL TBD — ideally from a customer the user names]
```

This is the difference between "draft" and "garbage." Drafts have honest placeholders the user replaces in 2 minutes. Garbage has fake numbers that look real and either ship by accident or destroy trust on review.

---

## 12. Field-tested lessons (from the autonomous test runs)

These are specific to the SimplerDevelopment stack and came out of the Phase 1–4 end-to-end tests against the prod-mirror local instance. Keep them in your head before authoring; they're failure modes you'll otherwise hit.

### A. White-on-accent is a real failure, not theoretical

The SD brand uses `#06B6D4` (cyan) as `accentColor`. White text on it scores **2.43:1** — fails WCAG-AA for both normal and large text. Every AI-generated landing page in this codebase happily renders `bg=#06B6D4 color=#FFFFFF` CTAs that are unreadable.

The rule: **never render white text on an accent color without running `branding_check_contrast` first.** When the check fails, swap to `textColor` (near-black) on the accent, OR change the CTA bg to `primaryColor` (which IS dark enough for white text in most brand palettes).

### B. Verify the trap with the tool

```
mcp__simplerdevelopment-postcaptain__branding_check_contrast {
  "foreground": "#FFFFFF",
  "background": "#06B6D4"   // the brand's accentColor
}
// → { ratio: 2.43, passesAA: false }
```

Make this call before authoring any CTA whose color combo isn't obviously the brand primary on white. The 200ms it takes saves a complete render-rejection cycle.

### C. The "testimonial reads fake" reflex

In the Phase 1 test, the user explicitly flagged the placeholder testimonial ("Operations Lead, Mid-market services firm") as inauthentic. Inventing testimonials is the #1 trust-destroying AI slip. Even using neutral roles and industries reads as fake to anyone who pays attention.

The rule: **never invent testimonials.** Use `[TESTIMONIAL TBD — ideally from <named customer>]` as a visible placeholder. The user should replace it in 2 minutes with a real quote OR delete the block entirely.

Same for numbers: never invent specific stats. "Helped 200+ customers" / "99.9% uptime" / "Trusted by Fortune 500" — all garbage unless the brand profile explicitly carries those numbers. Use `[STAT TBD — ask user for: X]`.

### D. Brand profile vs page-level styling — page-level wins

`bookingPages`, `surveys`, and `clientWebsites` each have a `brandingProfileId` foreign key. When SET, that's the active profile for that artifact. When NULL, the client's `isDefault: true` profile is used. **The skills should always set the page-level binding** to make the artifact-brand association explicit; relying on the default works but creates drift when the default changes.

### E. The "Powered by SimplerDevelopment" footer is now gone

As of Phase 4, booking confirmations + host notifications + cancellation emails carry the **tenant's** company name + tagline in the footer, not "Powered by SimplerDevelopment." If the brand profile is sparse, the footer falls back to the company column on `clients` — never to the SD wordmark unless the tenant IS the SD agency. Don't bake "Powered by SimplerDevelopment" copy into new templates you build.

### F. Update minting policy

Every `posts_update` / `decks_update` / `email_campaigns_update` / `surveys_update` / `booking_pages_update` mints a NEW approval URL. The old one stays in whatever state it was already in. Always return the URL from the most recent tool response — never the one you saved earlier in the conversation.

This is intentional: the reviewer should approve the content as-of-mint-time, not as-of-some-earlier-mint. If the author tweaks copy mid-review, the reviewer sees the new mint.

`decks_replace_slides` is an exception — it mutates slide drafts in place and does NOT mint a new URL. If you want the reviewer to see slide edits via a fresh URL, call `decks_update` (a metadata edit) to force a new mint.

### G. 14-day default expiry

Approval links auto-expire after 14 days. Pass `expiresInDays: null` to opt out (rare), or a number to override. Authors should NOT mint without expiry unless the reviewer is on a known long timeline; long-lived public tokens are a footgun.

## 13. Reference

- WCAG 2.2 specification: https://www.w3.org/TR/WCAG22/
- `branding_check_contrast` MCP tool — for any color pair, returns the WCAG ratio + AA/AAA pass/fail.
- huashu-design skill (vendored): `.agents/skills/huashu-design/` — 20 design philosophies, more depth on each school.
- Anthropic's design-skill style notes (referenced by the broader Claude ecosystem): "state the system out loud first" / "delete what you can't defend."
