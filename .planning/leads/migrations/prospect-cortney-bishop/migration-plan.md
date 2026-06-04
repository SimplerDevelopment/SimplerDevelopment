# Migration Plan — Cortney Bishop Design

## Site metadata

| field | value |
|---|---|
| slug | `prospect-cortney-bishop` |
| client_id | `1` (Simpler Development) |
| name | "Cortney Bishop Design (demo)" |
| subdomain | `cortney-bishop.demos.simplerdevelopment.com` |
| public_access | `false` |
| password (JS gate) | see `.demo-credentials` |
| source url | https://cortneybishop.com/ |
| outreach email | info@cortneybishop.com |
| founder | Cortney Bishop |

## Sitemap

- `/` — Home (very rich; 30+ residential projects + 11 commercial all on home)
- Project detail pages (30+ residential, 11 commercial — "Modern Fairytale", "Swordgate House", "The Ryder Hotel", "The Easterly", "Flats at Mixson", etc.)
- `/contact` (or contact section on home — forms split by inquiry type)
- `/newsletter` signup

Recommend: migrate `/` for pilot. Project detail pages = stub with "view on source" link.

## Brand observations

- **Aesthetic:** Neutral / minimal palette (no specific colors detected, likely warm whites + soft neutrals consistent with Charleston coastal-luxury aesthetic).
- **Typography:** Modern, clean sans-serif with hierarchical heading structure.
- **Voice:** Warm + welcoming. "Welcome home" is the lead. Philosophical: "creativity, comfort, and functionality with modern sensibility, drawing from travel and art influences." Designer-as-curator tone.
- **Brand fingerprint:** Volume + variety. 41 total projects on home is unusual and intentional — signals prolific career. Multiple inquiry forms (design/press/vendor) signals operational maturity.

## Homepage block flow (suggested)

| order | block type | content |
|---|---|---|
| 1 | `hero` | "Welcome home" as primary headline + secondary line "New build or styling, residential or commercial, collected or modern... let's talk!" CTA: "Design Inquiry". |
| 2 | `gallery` or `card-grid` (large grid, ~30 items) | Residential portfolio — 30+ projects with descriptive titles. **For pilot: limit to top 12 to keep load fast.** Each: image + title + optional in-progress badge. |
| 3 | `text` (philosophy block) | Philosophy statement — balance of creativity/comfort/functionality, travel + art influences. Modern sensibility positioning. |
| 4 | `gallery` or `card-grid` | Commercial portfolio — 11 projects (Ryder Hotel, The Easterly, Flats at Mixson, etc.). |
| 5 | `services-grid` (4x2 or 2x4) | 8 services: architect consultation, art curation, construction oversight, custom furniture, exterior design, interior design, lighting design, styling. Each: Material Icon + label + 1-line blurb. |
| 6 | `quote` | Founder philosophy statement crediting intuition + risk-taking. |
| 7 | `cta` + form | Studio/newsletter signup section with founder portrait. Use `image` + `cta` + form pattern. |
| 8 | `site-footer` | Address, phone, email, social, three inquiry-type forms (design/press/vendor) — pilot can collapse to single inquiry form. |

## Migration commands

```
/site-migration
  source_url=https://cortneybishop.com/
  target_slug=prospect-cortney-bishop
  target_client_id=1
  public_access=false
  notes="Soft-gate via custom_js. Pilot site #5. Largest portfolio of the pilot (41 projects total) — cap at 12 residential + 6 commercial for demo. Tests dense gallery rendering."
```

## After migration

1. Inject JS gate with password from `.demo-credentials`.
2. Verify gate at preview URL.
3. Record outcome.

## Known risks / notes

- **Project count is the headline risk.** 41 projects on one home page is too much for a demo. Cap at 12 residential + 6 commercial for the pilot demo, with a "View all 41 projects on source →" link. Document this trim in the demo's footer so the prospect sees they're looking at a *demo*, not a full migration.
- Multiple inquiry forms (design/press/vendor) — collapse to one in the demo; that level of fidelity isn't conversion-critical for the cold-email pitch.
- One project is marked in-progress on source — preserve that badge in the demo.
- Newsletter signup with founder portrait is a signature element — preserve it.
- Designer's risk-taking quote is a brand-defining line; keep verbatim.
