# Migration Plan — Beyond Modern Interiors

## Site metadata

| field | value |
|---|---|
| slug | `prospect-beyond-modern` |
| client_id | `1` (Simpler Development) |
| name | "Beyond Modern Interiors (demo)" |
| subdomain | `beyond-modern.demos.simplerdevelopment.com` |
| public_access | `false` |
| password (JS gate) | see `.demo-credentials` |
| source url | https://www.bmihomestyling.com/ |
| outreach email | info@bmihomestyling.com |
| founder | Roni Rivlin |

## Sitemap

- `/` — Home (rich, ~12 projects + team grid)
- Project detail pages (NoMad, Central Park, UES Highrise, Sydney Lake House, Hudson Yards, Billionaire's Row, Trump Plaza, Fifth Ave Penthouse, Park Ave Residence, Jersey City, Brooklyn Skyline, Westhampton)
- `/about` (if separate)
- `/contact` (form on homepage)

Recommend: migrate `/` only for pilot. Project detail pages can link out to source.

## Brand observations

- **Aesthetic:** Black + white grayscale dominant. Modern minimalism with luxury overtones.
- **Typography:** clean modern sans-serif.
- **Voice:** Confident, service-tier-focused. "Full Service Luxury Interior Design & Turnkey Renovations." Mentions specific high-end NY neighborhoods as portfolio anchors (Billionaire's Row, etc.) — signals client tier.
- **Brand fingerprint:** Team-led visibility (10-person grid), license info shown — communicates legitimacy + scale.

## Homepage block flow (suggested)

| order | block type | content |
|---|---|---|
| 1 | `hero` | Headline "Full Service Luxury Interior Design & Turnkey Renovations." Sub: founder name + studio. Phone CTA visible. Background image: marquee project shot. |
| 2 | `cta` | "Request a Private Design Consultation" — prominent banner, dark bg. |
| 3 | `text` | Value-proposition paragraph: positions Roni Rivlin's studio, design philosophy ("clean aesthetic and thoughtful layering of materials"), service breadth. |
| 4 | `gallery` (12-tile) | Project portfolio grid — NoMad, Central Park Views, UES Highrise, Sydney Lake House, Hudson Yards, Billionaire's Row, Trump Plaza, Fifth Ave Penthouse, Park Ave Residence, Jersey City, Brooklyn Skyline, Westhampton. Image-first, location label on hover. Reference external image URLs. |
| 5 | `card-grid` (5-col or 10-col) | Team section — 10 members: Roni, Ben, Lior, Aidan, Gali, John, Kim, Dana, Lor, Rachel. Each card: photo + first name + title. Reference external image URLs. |
| 6 | `cta` | Inquiry form section with consent language, SMS opt-in. Use platform's contact-form pattern. |
| 7 | `site-footer` | Address, phone, email, social, license info. |

## Migration commands

```
/site-migration
  source_url=https://www.bmihomestyling.com/
  target_slug=prospect-beyond-modern
  target_client_id=1
  public_access=false
  notes="Soft-gate via custom_js. Pilot site #2. Heavy portfolio + team grid — exercise card-grid and gallery blocks."
```

## After migration

1. Inject JS gate with password from `.demo-credentials`.
2. Verify gate at preview URL.
3. Record outcome.

## Known risks / notes

- 12-project portfolio grid is large. Confirm `gallery` block scales to 12 items or use 2x `gallery` blocks of 6.
- 10-person team grid — `card-grid` is the natural fit; verify the platform's card sizing handles 10 items cleanly (5x2 or 2x5).
- License/disclosure text in footer — preserve verbatim, don't fabricate license numbers.
- Source has SMS consent + privacy policy language — strip or replace with platform's standard contact-form copy. Don't carry over their specific legal copy without review.
