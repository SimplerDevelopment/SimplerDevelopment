# PropertyRadar 2026 — Migration Design System (CANONICAL)

> Single source of truth for the PropertyRadar site migration. **Every page-builder worker must read this and follow it exactly.** Direction: **fresh, modern, premium — but recognizably PropertyRadar** (keep navy + green + pastel DNA, Poppins, the logo). We are NOT doing a 1:1 port; we ARE keeping brand colors/logo and improving layout, depth, and rhythm.

---

## 0. Source-of-truth facts

- Source site: https://www.propertyradar.com (HubSpot). Real-estate / property-owner DATA SaaS.
- Value prop: "Find Motivated Property Owners" — connect real estate / mortgage / service pros with motivated owners, qualify, automate outreach.
- Audiences ("Built For"): real-estate-investors, residential-agents, commercial-agents, mortgage-pros, service-pros, + media/gov/other.
- Logos (reference external URLs directly):
  - Full wordmark: `https://www.propertyradar.com/hs-fs/hubfs/Brand%20Assets/5f6496ee50a79fe0a801cc27_PR-Logo-Full-p-800.png`
  - Glyph (favicon, svg): `https://www.propertyradar.com/hubfs/propertyradar-glyph.svg`
  - og:image: `https://www.propertyradar.com/hubfs/Social%20Sharing.png`

---

## 1. Color tokens (USE THESE EXACT HEXES — never CSS vars in blocks)

| Token | Hex | Role |
|---|---|---|
| navy | `#0A1F44` | Primary anchor. Dark "moment" section bg, footer, headings-on-light optional, button TEXT on green. |
| navy-2 | `#123563` | Secondary dark (footer bottom strip, card-on-dark surfaces). |
| blue | `#19467F` | Heading color on LIGHT sections, links. |
| green | `#38CB89` | **Accent + primary CTA bg.** Overlines, icon accents, glows. |
| green-dark | `#2BA56C` | CTA hover, overline text on light (better contrast than #38CB89). |
| tint | `#ECF9FF` | Light-blue section background (alternates with white). |
| tint-2 | `#F5FAFD` | Very subtle alt light bg. |
| white | `#FFFFFF` | Default light section bg. |
| ink-muted | `#41506B` | Body/paragraph text on light sections. |
| line | `#E2E8F2` | Hairline borders / card borders on light. |

**Pastel category coding** (for audience cards / "who we serve" only — keep their DNA):
| Audience | Pastel | Use for |
|---|---|---|
| Real Estate Investors | `#AC98F0` (purple) | card accent bar / icon chip bg @ 0.18 opacity |
| Residential Agents | `#A1DDBD` (mint) | " |
| Commercial Agents | `#A0CEEA` (sky) | " |
| Mortgage Pros | `#E69BC3` (rose) | " |
| Home & Property Services | `#F5C97B` (amber) | " |
| Media / Gov / Other | `#9FB3C8` (slate) | " |

### Text-on-dark rule (navy sections)
Every text/heading/stat/button child inside a navy section MUST set explicit light colors:
- Headings on navy: `#FFFFFF`
- Body on navy: `rgba(255,255,255,0.72)`
- Overline on navy: `#38CB89`
- Hairlines on navy: `rgba(255,255,255,0.12)`

---

## 2. Typography (Poppins everywhere — brand DNA)

`headingFont` = `Poppins`, `bodyFont` = `Poppins`.

| Element | size | weight | tracking | line-height | color (light / dark) |
|---|---|---|---|---|---|
| Overline | `0.75rem` | 700 | `0.18em` UPPERCASE | 1 | `#2BA56C` / `#38CB89` |
| Display H1 (hero) | `clamp(2.75rem, 5vw, 4rem)` | 700 | `-0.02em` | 1.05 | `#0A1F44` / `#FFFFFF` |
| H2 section title | `clamp(2rem, 3.5vw, 2.75rem)` | 700 | `-0.015em` | 1.1 | `#0A1F44` / `#FFFFFF` |
| H3 card title | `1.25rem` | 600 | `-0.01em` | 1.3 | `#0A1F44` / `#FFFFFF` |
| Lead subtitle | `1.1875rem` | 400 | normal | 1.6 | `#41506B` / `rgba(255,255,255,.72)` |
| Body | `1.0625rem` | 400 | normal | 1.7 | `#41506B` / `rgba(255,255,255,.72)` |
| Stat value | `clamp(2.5rem,4vw,3.25rem)` | 700 | `-0.02em` | 1 | `#0A1F44` or `#38CB89` / `#38CB89` |
| Stat label | `0.9375rem` | 500 | `0.02em` | 1.3 | `#41506B` / `rgba(255,255,255,.7)` |

Apply via `elementStyles` (preferred) or `style`. Set `fontFamily: "Poppins, sans-serif"` explicitly on heading/title elementStyles.

---

## 3. Buttons (appearance comes from branding `buttonStyle`, NOT block.style)

Branding `buttonStyle` is set globally to:
```json
{ "primaryBg":"#38CB89","primaryText":"#0A1F44","primaryHoverBg":"#2BA56C",
  "secondaryBg":"transparent","secondaryText":"#0A1F44","secondaryHoverBg":"rgba(10,31,68,0.06)",
  "borderRadius":"10px","variant":"filled" }
```
On individual `button` blocks set ONLY: `text`, `url`, `variant` (`primary`|`secondary`|`outline`), `size`, `alignment`, `icon`, `iconPosition`, `hoverEffect`, `openInNewTab`. Use `block.style.margin` for spacing. **Do NOT put padding/borderRadius/fontFamily in button block.style.**

Button patterns:
| CTA | icon | pos | hover | variant |
|---|---|---|---|---|
| Primary "Try it Free" / "Start Free" | `arrow_forward` | right | `lift` | primary |
| Secondary "See features" | `arrow_forward` | right | `slide` | outline |
| Dark-section CTA | `arrow_forward` | right | `glow` | primary |
| External | `open_in_new` | right | `fill` | secondary |

Note: links to `/register` and `/login` on source → point to `#` placeholder OR keep `/register` (app auth pages are out of scope; use `ctaLink:"/register"` literally so they can be wired later). Use `/register` for "Try it Free".

---

## 4. Section container model (CRITICAL — read twice)

Use the `section` block as the full-bleed wrapper. Recipe:
```json
{
  "id":"sec-x","type":"section","order":N,
  "maxWidth":"1200px",
  "style":{
    "backgroundColor":"#FFFFFF",
    "paddingTop":"96px","paddingBottom":"96px","paddingLeft":"24px","paddingRight":"24px"
  },
  "blocks":[ /* children */ ]
}
```
- `maxWidth` is a DIRECT section prop (not `style.maxWidth`). Standard content = `"1200px"`; narrow text = `"760px"`.
- Background/padding go in `style` (the deprecated top-level `backgroundColor`/`paddingTop` still work but PREFER `style`).
- `paddingLeft`/`paddingRight` always ≥ `"24px"` (mobile gutters).
- Section padding standard: **`96px` top/bottom** for major sections; `72px` for tighter ones. Dark "moment" sections can go `120px`.
- Background image on a section: `style.backgroundImage:"url(...)"`, `style.backgroundSize:"cover"`, `style.backgroundPosition:"center"`. To layer a gradient/scrim over an image use `style.backgroundGradient` (layers above image).

### Dark "moment" section with green glow (signature)
```json
"style":{
  "backgroundColor":"#0A1F44",
  "paddingTop":"120px","paddingBottom":"120px","paddingLeft":"24px","paddingRight":"24px",
  "customCSS":"background-image: radial-gradient(ellipse 80% 50% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);"
}
```

---

## 5. Section background RHYTHM (home + most marketing pages)

Fresh rhythm — introduces 2–3 dark "moments" (source was nearly all-light). Follow this ordering feel:
1. **Hero** → DARK navy (`#0A1F44`) + green glow.
2. Trust / logos → white.
3. Stats → tint (`#ECF9FF`).
4. Primary content / audience cards → white.
5. **Mid feature/capability moment** → DARK navy.
6. Differentiators / "why us" → tint.
7. Comparison / detail → white.
8. Secondary content → tint.
9. Testimonials → white.
10. **Final CTA** → DARK navy + green glow.
11. Footer → navy-2 (`#123563`) via `site-footer` block.

Never more than ~3 dark sections; the body stays predominantly light. Alternate white / tint for the light sections so adjacent sections differ.

---

## 6. Signature block recipes (copy + adapt)

### Hero (dark, premium) — use `hero`
```json
{
  "id":"hero","type":"hero","order":0,
  "title":"Find Motivated Property Owners",
  "subtitle":"PROPERTY & OWNER DATA, BUILT TO WIN",
  "description":"Connect with motivated owners, qualify opportunities, and automate outreach — all powered by 20 years of obsessive data quality.",
  "ctaText":"Try it Free","ctaLink":"/register",
  "secondaryCtaText":"See how it works","secondaryCtaLink":"/features",
  "style":{ "backgroundColor":"#0A1F44","minHeight":"86vh","paddingTop":"140px","paddingBottom":"120px",
    "customCSS":"background-image: radial-gradient(ellipse 70% 60% at 70% 30%, rgba(56,203,137,0.16) 0%, transparent 60%);" },
  "elementStyles":{
    "subtitle":{ "color":"#38CB89","fontFamily":"Poppins, sans-serif","fontWeight":"700","letterSpacing":"0.18em","textTransform":"uppercase","fontSize":"0.75rem" },
    "title":{ "color":"#FFFFFF","fontFamily":"Poppins, sans-serif","fontWeight":"700","fontSize":"clamp(2.75rem,5vw,4rem)","letterSpacing":"-0.02em","lineHeight":"1.05","customCSS":"text-shadow:0 2px 30px rgba(0,0,0,0.35)" },
    "description":{ "color":"rgba(255,255,255,0.72)","fontSize":"1.1875rem","lineHeight":"1.6" }
  }
}
```
(For pages with a strong product/screenshot image, set `backgroundImage` to the source hero image and add a navy scrim via `customCSS: "background-image: linear-gradient(...)"` or keep solid navy + image in a right `columns` cell instead.)

### Overline + title + subtitle header inside a light section
Use a `heading` (level 2) preceded by a `text` overline + followed by a `text` lead, OR use a block that has `overline`/`title`/`description` built in (`services-grid`, `bento-grid`, `metric-cards`, `timeline`, `flip-card-grid`). PREFER the built-in-overline blocks where the content fits.

### Stats — use `stats`
```json
{ "id":"stats","type":"stats","order":N,"columns":4,
  "stats":[{"id":"s1","value":"$250B+","label":"Completed Transactions"},
           {"id":"s2","value":"3X","label":"Marketing ROI"},
           {"id":"s3","value":"160M+","label":"Properties"},
           {"id":"s4","value":"1B+","label":"Phones & Emails"}],
  "elementStyles":{
    "statValue":{"color":"#0A1F44","fontFamily":"Poppins, sans-serif","fontWeight":"700","fontSize":"clamp(2.5rem,4vw,3.25rem)","letterSpacing":"-0.02em"},
    "statLabel":{"color":"#41506B","fontWeight":"500","letterSpacing":"0.02em"}
  }}
```
On a DARK section set statValue color `#38CB89`, statLabel `rgba(255,255,255,0.7)`.

### Audience cards — use `services-grid` (icons, NOT photos)
Service/feature cards must use Material Icon `icon` (NOT `image`, which renders as a 192px photo strip). Map audiences → icons:
- investors → `trending_up`; residential → `home_work`; commercial → `apartment`; mortgage → `account_balance`; service → `handyman`; media/gov → `public`.
```json
{ "id":"aud","type":"services-grid","order":N,"columns":3,
  "overline":"WHO WE SERVE","title":"Everything you need to dominate your market","accentColor":"#38CB89",
  "services":[
    {"id":"a1","title":"Real Estate Investors","description":"Wholesale, fix & flip, or buy & hold — motivated sellers, due diligence, and cash buyers to close more deals.","icon":"trending_up","link":"/built-for/real-estate-investors","linkText":"Find deals now"},
    ...
  ],
  "elementStyles":{
    "overline":{"color":"#2BA56C","fontWeight":"700","letterSpacing":"0.18em"},
    "title":{"color":"#0A1F44","fontFamily":"Poppins, sans-serif","fontWeight":"700"},
    "serviceTitle":{"color":"#0A1F44","fontWeight":"600"},
    "serviceDescription":{"color":"#41506B"},
    "serviceIcon":{"color":"#38CB89"},
    "card":{"backgroundColor":"#FFFFFF","borderWidth":"1px","borderColor":"#E2E8F2","borderStyle":"solid","borderRadius":"16px","customCSS":"box-shadow:0 10px 40px rgba(10,31,68,0.06);transition:all .3s ease"}
  }}
```

### Capabilities / "layers" moment — `bento-grid` on DARK section, or `metric-cards`
Use `bento-grid` for the 3 core capabilities (Targeted Marketing / Property & Owner Data / Foreclosure Tracking) with `variant:"dark"` cards on a navy section.

### Differentiators "why our data wins" — `flip-card-grid` or `services-grid` on tint
4 items (Relationships Matter, Exclusive Data, Quality You Demand, See Opportunities First). Use pastel-tinted icon chips.

### Comparison "what sets us apart" — `card-grid` or `accordion`
7 items, each "Others vs PropertyRadar". Render as a 2-col `card-grid` per item OR an `accordion`. PREFER a clean `card-grid` (columns:1 or 2) with the contrast baked into copy. Keep it light.

### Plays / strategies — `card-grid` (columns 3 or 4) on tint, grouped by audience.

### Testimonials — `testimonial` (one featured) or multiple `testimonial` blocks in `columns`.
Quote italic, author bold green. On white section.

### Final CTA — `cta` on DARK navy (backgroundStyle:"solid", NOT gradient)
```json
{ "id":"cta","type":"cta","order":N,
  "title":"Ready to own your market?","description":"Join thousands of pros who trust PropertyRadar to grow their business.",
  "primaryButtonText":"Try it Free","primaryButtonUrl":"/register",
  "secondaryButtonText":"See pricing","secondaryButtonUrl":"/pricing",
  "backgroundStyle":"solid",
  "style":{"backgroundColor":"#0A1F44","paddingTop":"110px","paddingBottom":"110px","customCSS":"background-image: radial-gradient(ellipse 80% 60% at 50% 100%, rgba(56,203,137,0.16) 0%, transparent 60%);"},
  "elementStyles":{
    "title":{"color":"#FFFFFF","fontFamily":"Poppins, sans-serif","fontWeight":"700"},
    "description":{"color":"rgba(255,255,255,0.72)"}
  }}
```

### Footer — `site-footer` block (navy)
Build from the source footer link structure (Who We Serve / Features / Comparisons / Resources / Company). `backgroundColor:"#123563"`, `textColor:"rgba(255,255,255,0.78)"`, `accentColor:"#38CB89"`. Include address "PO Box 837, Truckee, CA 96160", social links (facebook/twitter/linkedin/youtube/instagram), copyright, logo wordmark.

---

## 7. Hard renderer constraints (from site-migration skill — do not violate)

1. **Service/feature cards use `icon` (Material Icons), never `image`** — Card images render `w-full h-48 object-cover` (192px photo strip). Only use `image` for true photos (team, screenshots, portfolio).
2. **`block.style` styles the WRAPPER**, not inner elements. For inner element styling use `elementStyles`. For buttons rely on branding `buttonStyle`.
3. **Never use CSS variables** (`var(--brand-*)`) in block styles — they don't resolve in the editor. Hardcode hexes.
4. **Every child of a dark section needs an explicit light `color`.**
5. Material Icons over emojis in any rendered UI.
6. `card-grid` adds its own `py-16`; if a section wraps a card-grid reduce the section's paddingBottom to avoid double spacing.

## 8. Content envelope
`posts.content` = `JSON.stringify({ blocks: [...], version: "1.0" })`. Every block needs unique `id`, `type`, sequential `order`. Page posts: `postType:"page"`, `published:false` (draft), set `seoTitle`/`seoDescription`/`ogImage`.

## 9. Block type cheat-sheet (available types)
layout: `section` `columns` `spacer` `divider` `accordion` `tabs` `sticky-scroll-tabs`
content: `text` `heading` `quote` `code` `html-render`
media: `image` `video` `youtube` `gallery` `marquee` `html-embed`
components: `hero` `hero-slideshow` `cta` `testimonial` `stats` `featured-content` `card-grid` `services-grid` `blog-posts` `timeline` `team-showcase` `team-flip-grid` `bento-grid` `flip-card-grid` `metric-cards` `logo-strip` `site-footer` `social-links` `popup`
form: `button` `booking` `booking-menu` `survey` `survey-results`

Element-style sub-keys per block: see the schema reference (hero: title/subtitle/description/cta/secondaryCta; services-grid: overline/title/description/card/serviceTitle/serviceDescription/serviceIcon/serviceLink/serviceImage/bullet; stats: title/statValue/statLabel; cta: title/description/primaryButton/secondaryButton; metric-cards: overline/title/description/card/value/label/institution/link; bento-grid: overline/title/subtitle/cardTitle/cardLead; etc).
