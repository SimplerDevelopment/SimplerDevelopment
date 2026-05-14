# Migration Plan — Storm Interiors

## Site metadata

| field | value |
|---|---|
| slug | `prospect-storm-interiors` |
| client_id | `1` (Simpler Development) |
| name | "Storm Interiors (demo)" |
| subdomain | `storm-interiors.demos.simplerdevelopment.com` |
| public_access | `false` |
| password (JS gate) | see `.demo-credentials` |
| source url | https://www.storminteriors.com/ |
| outreach email | info@storminteriors.com |
| founder | Lara Sachs-Fishman (ex-Kelly Wearstler Senior Designer) |

## Sitemap

- `/` — Home (rich, 8 sections)
- `/services` — likely separate
- `/inquire` — Contact form (confirmed exists, has email)
- `/about` — likely separate, founder bio
- Project detail pages

Recommend: migrate `/` + a stubbed `/inquire` mirror for pilot.

## Brand observations

- **Aesthetic:** Clean luxury, story-driven. Likely whites/blacks/warm neutrals.
- **Typography:** Modern sans-serif, hierarchical sizing, contemporary luxury.
- **Voice:** Narrative-first. "Tailored Interiors That Tell Your Story" / "Your lifestyle and legacy, translated into spaces that feel unmistakably yours." Strong storytelling brand.
- **Brand fingerprint:** Founder pedigree (Kelly Wearstler alum), residential + hospitality + commercial breadth. Established 2000 = 25+ years experience signal.

## Homepage block flow (suggested)

| order | block type | content |
|---|---|---|
| 1 | `hero` | Hero with headline "Tailored Interiors That Tell Your Story" + founder intro line + background image. Inquire button. |
| 2 | `text` (or `section` with heading) | "What We Do" — overview paragraph on residential, hospitality, commercial philosophy. |
| 3 | `services-grid` | Nine core offerings (interior design, hospitality, commercial, art commissions, custom furniture, staging, design consulting, project management, sourcing — extract exact list from source). Each item: icon (Material Icons) + label + short blurb. |
| 4 | `quote` × 3 (or carousel via `marquee`) | Three client testimonials. Each: pull-quote + attribution. |
| 5 | `gallery` or `card-grid` | "Selected Projects" — residential + commercial categorized. Use tab or filter pattern if available, otherwise two `card-grid` blocks side-by-side. |
| 6 | `cta` | "Let's bring your story to life" — large CTA banner → `/inquire`. |
| 7 | `site-footer` | Nav links, contact info (info@storminteriors.com), social (Instagram @storm_interiors, Pinterest), copyright. |

## Migration commands

```
/site-migration
  source_url=https://www.storminteriors.com/
  target_slug=prospect-storm-interiors
  target_client_id=1
  public_access=false
  notes="Soft-gate via custom_js. Pilot site #3. Tests services-grid + testimonials + multi-category portfolio."
```

## After migration

1. Inject JS gate with password from `.demo-credentials`.
2. Verify at preview URL.
3. Record outcome.

## Known risks / notes

- "INQUIRE now →" CTA appears twice — keep both placements in the demo for fidelity.
- 9-item services grid may not fit cleanly in one row; expect 3x3 layout.
- Testimonials don't have attribution photos in source — `quote` block in plain text form is fine, don't fabricate headshots.
- Kelly Wearstler reference in founder bio is part of the story brand — preserve verbatim.
- Founder name appears in two spellings on the web ("Sachs-Fishman" vs "Sachs-Fisherman" — search results varied). Use what the actual `/about` page says; do not guess.
