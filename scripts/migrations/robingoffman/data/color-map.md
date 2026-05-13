# Section Color Map — robingoffman.com

Verified via computed-styles script (`getComputedStyle`) on May 12, 2026.

## Global

- Body / main background: `#FDF9F0` (warm cream)
- Top nav background: `#FFFFFF` (pure white — only the small header strip; ~80px tall)
- Body text: `#2A2A2A`
- Accent coral (CTA, highlights, link hover): `#FF6161`
- Accent teal (Contact heading, success messages): `#84C4C3`
- Muted link color: `#3E4A4A`
- Logo: handwritten script raster image, ~129×45px

## Home (/)

| # | Section            | Bg          | Notes |
|---|--------------------|-------------|-------|
| 1 | Header (logo + ABOUT) | `#FFFFFF` | Sticky/fixed at top |
| 2 | Hero photo strip | full-bleed image | B&W photo of Robin with hand-drawn "stud" overlay. No text inside. |
| 3 | Portfolio grid | `#FDF9F0` | 2-column gallery, each item = image + project title underneath in DM Sans 22px |
| 4 | Footer | `#FDF9F0` | Centered "CRAFTED WITH CARE © 2024  ROBIN GOFFMAN" — 11px DIN Next light, letter-spaced uppercase |

## About (/copy-of-new-about)

| # | Section            | Bg          | Notes |
|---|--------------------|-------------|-------|
| 1 | Header | `#FFFFFF` | Same as home |
| 2 | Hero image | full-bleed photo of Robin with vinyl wall | Has two overlaid headings: "BRAND THINKER" (top-left, coral `#FF6161`) and "DESIGN STRATEGIST" (bottom-right, white). H1 typography, very large display. |
| 3 | Intro 2-col | `#FDF9F0` | Left col = "Hi! I'm Robin…" + bio paragraph. Right col = bulleted services list (Creative Strategy, Brand Development, Graphic Design, Website Design, Product Design) — each as a row with thin separator line below |
| 4 | Contact form | `#FDF9F0` | First & Last Name + Email + Message + Submit (coral pill) |
| 5 | Footer | `#FDF9F0` | Same as home |

## Contact (/contact)

| # | Section            | Bg          | Notes |
|---|--------------------|-------------|-------|
| 1 | Header | `#FFFFFF` | Same as home |
| 2 | 2-col body | `#FDF9F0` | Left: teal heading + coral subtag + email + Instagram + photo gif. Right: form with Submit coral pill |
| 3 | Footer | `#FDF9F0` | Same |

## Portfolio detail (/portfolio-collections/...)

| # | Section            | Bg          | Notes |
|---|--------------------|-------------|-------|
| 1 | Header | `#FFFFFF` | Same as home |
| 2 | Title + meta strip | `#FDF9F0` | Left col: project title (display, 30px+) + tags below (small uppercase). Right col: description paragraph + credits list |
| 3 | Image gallery | `#FDF9F0` | Stacked + occasional 2-column rows of project imagery, each image bordered by generous whitespace |
| 4 | Prev / Next nav | `#FDF9F0` | Bottom of page, "< Previous Project" left and "Next Project >" right, small DM Sans |
| 5 | Footer | `#FDF9F0` | Same |

## Type styles (verified via getComputedStyle)

- Nav links: DM Sans medium, 16px, color `#2A2A2A`, letter-spacing wide ("A B O U T")
- Portfolio item titles (home grid): DM Sans regular, 22px, `#2A2A2A`
- About hero overlay H1s: very large display, varies (BRAND THINKER ~120px coral, DESIGN STRATEGIST ~96px white)
- Footer: DIN Next light, 11px, `#2A2A2A`, letter-spacing wide
- Contact heading: serif-feeling sans (likely DM Sans), 24px, teal `#84C4C3`

## Design principles to preserve

- **Warm cream is the dominant color**, NOT white. Only the header bar is pure white.
- **Two accent colors** — coral `#FF6161` for energy/CTAs, teal `#84C4C3` for restful brand voice moments.
- **Very generous whitespace.** Portfolio items have substantial gutters.
- **No section breaks, no headings on the home page.** It's a pure gallery.
- **The logo is image-based** (handwritten script) — render it as `<img>`, not as text.
- **Minimum chrome.** Only "ABOUT" in the nav; no nav for Contact (it lives inside About form and the footer copy).

## What changes for the migrated site

I'll add a real navigation menu (Work / About / Contact) since the original site relies on the About page bundling the contact form. Cleaner separation.
