---
type: spec
domain: portal-websites
status: planned
date: 2026-07-08
sku: VEQA-006
sources:
  - app/portal/websites/page.tsx
  - lib/db/schema/sites.ts
---

# VEQA-006 — Site Homepage Thumbnails

**Goal:** show a homepage screenshot thumbnail per site on the all-sites listing
(`/portal/websites`), instead of the generic `language` icon avatar every tile
currently shows.

## Current state

`app/portal/websites/page.tsx` renders each site tile with only a Material icon
avatar + name/domain/status pill/page-count. No image/screenshot anywhere. The
`clientWebsites` schema has no thumbnail column. (Thumbnail capture exists in the
codebase for media/booking/designer/blog — never for the sites listing.)

## The real work: a screenshot capture pipeline

This is not a front-end-only card — a thumbnail has to be *produced* and *stored*.
Three parts:

1. **Storage.** Add `homepageThumbnailUrl` (+ `thumbnailCapturedAt`) to
   `clientWebsites` in `lib/db/schema/sites.ts`; `bun run db:generate` (never hand-edit
   `drizzle/*.sql`). Store the captured image in the existing media/S3 (MinIO locally)
   pipeline and save its URL.
2. **Capture.** Render the site's published homepage headlessly and screenshot it.
   Options, cheapest-first:
   - **(a) Reuse existing headless infra.** Check whether the repo already runs
     Playwright/Chromium server-side (it does for e2e + possibly OG-image/designer
     thumbnails) and reuse it. Preferred — no new dependency.
     Do NOT add a new browser dependency if one is already installed (ladder rung 5).
   - (b) A lightweight screenshot service/route that loads `/sites/<subdomain>` (or
     the public domain) and captures above-the-fold at a fixed viewport (e.g. 1280×800
     → downscaled to a ~400px-wide webp).
   - When to (re)capture: on publish (hook into the publish path), on demand from the
     tile ("refresh thumbnail"), and/or a periodic refresh. Start with **on-publish +
     manual refresh**; skip a scheduler until asked (YAGNI).
3. **Display.** In `app/portal/websites/page.tsx`, render `<img>` with
   `homepageThumbnailUrl` in the tile (~line 122), falling back to the current
   `language` icon when null/not-yet-captured. Lazy-load; fixed aspect box to avoid
   layout shift.

## Files to touch

- `lib/db/schema/sites.ts` — add thumbnail columns → `bun run db:generate` → `bun run db:migrate`.
- capture path — new route/job under `app/api/portal/...` or reuse existing headless helper (investigate first).
- publish hook — trigger capture on site/homepage publish.
- `app/portal/websites/page.tsx` — `<img>` with fallback in the tile.

## Risks / gotchas

- **Don't add a new headless-browser dependency** if Playwright/Chromium is already
  wired server-side — reuse it. Investigate before installing anything.
- Screenshotting a tenant site must respect tenancy — capture only sites the user
  owns; the capture job reads the public rendered page, but the trigger/route is
  tenant-scoped. Schema change → `bun test:tenancy`.
- Capture latency: do it async (job/queue or fire-and-forget), never block the
  publish response or the listing render.
- Cost/perf: cap capture frequency; store a downscaled webp, not a full-res PNG.

## Effort

Large (multi-day) — dominated by the capture pipeline + storage, not the display.
The `<img>` swap is trivial once a URL exists.

## Verification

`bun run db:generate`/migrate on the dev DB only; `bun test:tenancy` (schema +
tenant-scoped trigger); manual: publish a site → thumbnail appears on the listing,
fallback icon shows for un-captured sites.
