# Migration Plan — Gramercy Design

## Site metadata

| field | value |
|---|---|
| slug | `prospect-gramercy-design` |
| client_id | `1` (Simpler Development) |
| name | "Gramercy Design (demo)" |
| subdomain | `gramercy-design.demos.simplerdevelopment.com` (or platform convention) |
| public_access | `false` |
| password (JS gate) | see `.demo-credentials` |
| source url | https://www.gramercy.design/ |
| outreach email | info@gramercy.design |
| founder | Kyle O'Donnell |

## Sitemap (homepage-focused; minimal nav)

- `/` — Home (only page that needs deep block coverage)
- `/projects` — Portfolio index
- `/about` — Studio bio
- `/press` — Press features
- `/contact` — Contact form

Recommend: migrate `/` for the demo, stub the rest as simple text pages with "see live site" links.

## Brand observations

- **Aesthetic:** off-white/cream background (≈#FAFAFA), dark charcoal text (≈#2D2D2D). Minimalist, gallery-like.
- **Typography:** sans-serif, light/regular weight, sentence-case headings.
- **Voice:** restrained, factual. "Boutique design studio." No marketing florid.
- **Brand fingerprint:** founder-led, gallery-spare. Block treatment should lean heavy on negative space, large imagery, tight type.

## Homepage block flow (suggested)

| order | block type | content |
|---|---|---|
| 1 | `hero` | Minimal hero — wordmark "Gramercy Design" + sub-text "A boutique design studio based in New York City." No image; cream bg, charcoal text. |
| 2 | `heading` + `text` (or single `section` wrap) | About paragraph: "Gramercy Design is a boutique design studio based in New York City. Founded by Kyle O'Donnell in 2015, the firm provides full-scale interior design and design-and-build furniture services." CTA button "About the Studio" → `/about`. |
| 3 | `card-grid` or `gallery` (3-col) | Three featured projects: UWS Classic Six, Manhattan Pied-A-Terre, NoHo Loft. Each card = project image + title + "View Project" link. Pull project images via external URL (no media migration in pilot). |
| 4 | `cta` | Simple "View all projects →" link → `/projects` |
| 5 | `site-footer` | Use the platform's site-footer block. Populate with: studio email, social links if findable, copyright. |

## Migration commands (when restarted)

```
/site-migration
  source_url=https://www.gramercy.design/
  target_slug=prospect-gramercy-design
  target_client_id=1
  public_access=false
  notes="Soft-gate via custom_js (see ../../pilot-runbook.md). Pilot site #1."
```

## After migration

1. Inject the password JS gate from `pilot-runbook.md` into `client_websites.custom_js` for this site, with `EXPECTED = "<password from .demo-credentials>"`.
2. Verify the gate appears at `http://localhost:3000/s/prospect-gramercy-design/` (or platform's preview URL).
3. Record outcome in `../../pilot-results.md`.

## Known risks / notes

- Site is image-heavy. The migration's "reference external URLs" mode (per SKILL.md §3) is the right default — don't try to pull all assets in pilot.
- "Lovably" footer credit on source — strip in migration.
- No testimonials, no pricing on source — block flow above doesn't fabricate any.
- Source uses no visible CTAs other than "View Project" — keep the demo equally restrained; don't add a "Book a Call" CTA that isn't there.
