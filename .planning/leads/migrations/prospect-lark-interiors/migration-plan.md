# Migration Plan — Lark Interiors

## Site metadata

| field | value |
|---|---|
| slug | `prospect-lark-interiors` |
| client_id | `1` (Simpler Development) |
| name | "Lark Interiors (demo)" |
| subdomain | `lark-interiors.demos.simplerdevelopment.com` |
| public_access | `false` |
| password (JS gate) | see `.demo-credentials` |
| source url | https://www.larkinteriorstx.com/ |
| outreach email | janelle@larkinteriorstx.com (also hello@larkinteriorstx.com) |
| principal | Janelle |

## Sitemap

- `/` — Home (rich; 9+ sections)
- `/portfolio` — Project gallery
- `/services` — Service breakdown (4 core offerings)
- `/process` — Methodology
- `/about` — Studio + principal bio
- `/press` — Press features (House Beautiful cover)
- `/blog` — 20+ articles (active blog)
- `/contact` — Contact form

Recommend: migrate `/` for pilot. Stub the rest with single-paragraph placeholders linking to source.

## Brand observations

- **Aesthetic:** White + black with gold accent. Clean, warm, accessible.
- **Typography:** Serif + sans-serif combo (serif for headings, sans for body — typical "warm modern" pattern).
- **Voice:** Approachable + personal. "Sticky fingers and muddy paws welcome" — distinguishes them as livable-luxury (not precious). "Livable luxury" is the core positioning phrase.
- **Brand fingerprint:** Active blog (20+ posts), press-featured (House Beautiful cover), 5 testimonials, multi-service. Strong content-marketing posture.

## Homepage block flow (suggested)

| order | block type | content |
|---|---|---|
| 1 | `hero` | "A Full-Service Interior Design and Decorating Firm based in Dallas, Texas" + "Lark Interiors creates spaces uniquely suited to the way you live" subhead. CTA: "VIEW OUR WORK →" → `/portfolio`. |
| 2 | `services-grid` (4-up) | Four services: New Home Construction, Home Renovation, Interior Design, Kitchen Remodels. Each: title + 2-line description + "Learn More" link. |
| 3 | `featured-content` or `card-grid` (1-up) | House Beautiful cover feature — image of cover + caption + "CLICK TO VIEW FULL SPREAD" link to PDF. |
| 4 | `text` + `heading` | Problem/solution: "How daunting the beginning..." paragraph framing client hesitation, with comprehensive-capabilities response. |
| 5 | `quote` × 5 (carousel/marquee) or `card-grid` | Five testimonials with 5-star ratings, names, quotes. |
| 6 | `gallery` or `card-grid` | Portfolio teaser + design-philosophy tagline. CTA → `/portfolio`. |
| 7 | `blog-posts` | Recent posts feed (limit to 6 for pilot). Pull post titles + URLs; can stub content as "Read on source →" links. |
| 8 | `site-footer` | Address (737 Shorewood Dr, Coppell, TX), phone, email, hours, social, newsletter signup. |

## Migration commands

```
/site-migration
  source_url=https://www.larkinteriorstx.com/
  target_slug=prospect-lark-interiors
  target_client_id=1
  public_access=false
  notes="Soft-gate via custom_js. Pilot site #4. Most content-rich of the pilot — tests services-grid, featured-content, blog-posts."
```

## After migration

1. Inject JS gate with password from `.demo-credentials`.
2. Verify gate at preview URL.
3. Record outcome.

## Known risks / notes

- Blog has 20+ articles. **Do not migrate post bodies in pilot** — stub as title-only cards linking to source. Real blog migration is a separate scope.
- Press section references a PDF of House Beautiful spread. Reference the external PDF URL; don't try to download/re-host.
- "Sticky fingers and muddy paws welcome" — this is a key brand line; preserve verbatim in the demo (probably in hero subtext or about block).
- 4-service grid is the cleanest pattern in the pilot — good test for `services-grid` block.
- Newsletter signup in footer — use platform's email subscriber block (or stub if not implemented).
