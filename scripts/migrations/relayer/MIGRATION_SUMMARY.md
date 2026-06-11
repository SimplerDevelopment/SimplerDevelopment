# Relayer (userelayer.com) — Migration Summary

Migrated **2026-06-02** into the local dryrun DB (`simplerdev_realprod_dryrun`).

Relayer = "AI Customer Care Layer for OEMs", a product of **AutoAssist, Inc.** (West Chester, PA).
Source site is a single-page **Framer** site; this migration preserves it faithfully and expands
it into a full marketing site in the SimplerDevelopment block editor.

## IDs
| Entity | ID |
|---|---|
| userId | 352 (`userelayer@simplerdevelopment.com`) |
| clientId | 161 |
| websiteId | 447 |
| subdomain | `relayer` → `relayer.simplerdevelopment.com` |
| brandingProfileId | 46 |
| siteBrandingId | 13 |
| Insights category | 201 |

Local review URL base: `http://localhost:3000/sites/relayer.simplerdevelopment.com/<slug>`

## Brand system (captured from live site via computed styles — verified, not guessed)
| Token | Value | Use |
|---|---|---|
| Forest green | `#032916` | hero, briefing CTA, footer, dark text |
| Cream / oatmeal | `#E1DDD5` | dominant light background |
| Off-white | `#F6F5F3` | text on dark |
| Mint / spring green | `#23EE92` | accent, CTA pills, circuit lines, highlight words |
| White | `#FFFFFF` | form / panel cards |
| Heading font | **Space Grotesk** | substitute for proprietary "Artific Trial" |
| Body font | **Hanken Grotesk** | substitute for "Artific Trial Regular" |
| CTA shape | pill, radius 52px, arrow icon | |

Signature **circuit-board "network trace" SVGs** referenced directly from Framer's CDN
(hero band, BEFORE/FRAGMENTED panel, AFTER/SEAMLESS panel). See `_shared.ts` → `ASSETS`.

## Pages (all postType `page` unless noted)
| Slug | Post ID | Notes |
|---|---|---|
| `home` | 1693 | Faithful rebuild: forest hero, cream pill band, "The Missing Layer" with BEFORE/AFTER circuit panels, forest briefing CTA + white form. Copy verbatim. |
| `platform` | 1696 | How Relayer works (3 pillars), fragmented→seamless, capabilities (6 cards) |
| `solutions` | 1695 | For OEMs / For Dealer Groups / For Technology Partners |
| `about` | 1694 | Why we built Relayer, values, who we are (AutoAssist) |
| `contact` | 1697 | "Request a briefing" hero + full briefing form (html-render) |
| `blog` | 1701 | Custom index page (see follow-up #4) |
| blog/`post-sale-gap` | 1698 | postType `blog` |
| blog/`survey-scores-to-operating-signals` | 1699 | postType `blog` |
| blog/`shared-operational-layer-in-practice` | 1700 | postType `blog` |

Navigation (6 items): Platform, Solutions, About, Blog, Login (→ app.userelayer.com, new tab),
Request a briefing (button → /contact).

## Scripts (run from repo root with `npx tsx`)
`setup-client.ts` → `import-home.ts` → `import-about.ts` / `import-platform.ts` /
`import-solutions.ts` / `import-contact.ts` → `import-blog.ts` → `import-nav.ts`.
`qa-toggle.ts on|off` flips publicAccess + published for local QA. `_shared.ts` holds tokens +
helpers + `upsertPage`; `_ids.json` carries resolved IDs.

## QA
All 9 URLs return HTTP 200 with correct SEO titles; 0 console errors. Visual QA screenshots in
`reports/screenshots/` (source vs migrated home, plus platform + contact). Home is a near-exact
match to the source.

## Home page — cutting-edge motion system (post 1693)
The home page carries a bespoke motion layer in `posts.customCss` + `posts.customJs`
(authored in `_home-enhance.ts`, injected verbatim by `SiteBlockRenderer` on the public site —
NOT in the editor preview). All effects are progressive enhancements and `prefers-reduced-motion`
safe (canvas/grid hidden, reveals shown, animations off):
- **Hero**: animated `<canvas>` particle **network** (nodes + mint links + traveling data-pulses),
  drifting **aurora** gradient, **cursor-follow spotlight**, masked grid, gradient-**shimmer**
  headline (`.rl-grad`), CSS entrance stagger, glowing/sweeping CTA. Hero section bg is
  `transparent` so the wrapper canvas shows through.
- **Capability marquee**: full-bleed forest CSS marquee (`html-render`, pause-on-hover).
- **The Missing Layer**: BEFORE/AFTER panels are now `html-render` cards over the source SVGs with
  a moving mint **data-flow scan** (SEAMLESS) / flicker (FRAGMENTED), 3D pointer **tilt** + glow.
- **Scroll-reveal** with `IntersectionObserver` (stagger) on below-fold blocks.
- **Scroll-progress** bar; **input focus-glow** on the briefing form.

> Note: re-running `import-home.ts` resets the post to `published:false` (drafts by design) — run
> `qa-toggle.ts on` again afterward to view it.

## Follow-ups / flagged items
1. **Fonts** — "Artific Trial" is a proprietary Framer font; substituted Space Grotesk + Hanken
   Grotesk. If a license is available, swap the family in branding profile 46.
2. **Lead forms are display-only** — the home + contact briefing forms are `html-render` (visually
   faithful) but not wired to capture submissions. Wire a real `survey` or `booking` form for
   actual lead capture before go-live.
3. **Two-tone headlines** use an inline `<span style="color:#23EE92">` in heading content (e.g.
   "for OEMs", "product briefing") — renders correctly but is slightly less editable in the visual
   editor.
4. **/blog index** — the site router hardcodes `/blog` to the platform's generic blog listing
   (which correctly lists the 3 published posts). The custom hero page (1701) isn't served at that
   exact slug; serving it would need a router change (out of migration scope).
5. **Assets** reference Framer's CDN directly (per skill's initial-migration guidance). For full
   independence, download + re-host the SVGs/og/favicon via the media API later.
6. **Lighthouse** — formal `lighthouse-compare` skipped because the local dev server is not a
   representative build; run it against a production/preview build before sign-off.
7. **State** — pages are currently published + publicAccess ON on the LOCAL dryrun DB for review.
   Run `qa-toggle.ts off` to revert to drafts/private. Production go-live is a separate
   approval/publish step.
