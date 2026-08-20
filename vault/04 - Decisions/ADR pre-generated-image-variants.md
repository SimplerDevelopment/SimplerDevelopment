# ADR: Mobile image variants are pre-generated at import, not resized at runtime

**Date:** 2026-08-19
**Status:** Accepted
**Context:** IntegraTouch migration overnight mission — mobile LCP on hero/banner
backgrounds (phones were downloading up-to-1920px WebP sources).

## Decision

Mobile-width image variants are **pre-generated sibling S3 objects** created by
the import pipeline (`mirrorImageVariant()` in the migration scripts' shared
`lib/mirror-image.ts`): for a mirrored `media/<uuid>.webp`, the 828px variant
lives at `media/<uuid>-w828.webp`. Content CSS references the variant under
`@media (max-width: 600px)` via its own CMS field (e.g. `bgImageMobile`), and
the platform's `HeroPreload` pairs full + variant into one `imagesrcset`
preload when both URLs appear in the substituted page content
(`resolveHtmlRenderCorpus`, `-w828.webp` suffix convention).

## Alternatives rejected — and why (both were tried, in production)

1. **Runtime resize in the media-proxy route (sharp).** A module-level
   `import sharp` failed to load in the deployed Vercel function bundle
   (missing platform binaries), which failed the whole route module — every
   proxied image on every tenant site 500'd for ~25 minutes on 2026-08-19
   until `git revert` of PR #64. Even externalized (`serverExternalPackages`)
   and lazily imported with graceful fallback, sharp never actually resized on
   Vercel (fallback always fired). Branch `feat/media-resize-v2` preserves the
   hardened version.

2. **Next's built-in optimizer (`/_next/image`).** Non-functional on this
   Vercel project: every optimize request returns
   `400 INVALID_IMAGE_OPTIMIZE_REQUEST` from the edge — including whitelisted
   static files after adding `images.localPatterns` (verified on a preview
   deployment). Side-discovery: the agency site's own local `next/image`
   usages are therefore broken in prod today (ITM-032). Branch
   `feat/image-optimizer-local-patterns` preserves a fully-tested
   proxy→optimizer delegation for the day the platform optimizer works.

## Consequences

- Zero runtime resize dependencies — a variant regression can never take
  images down; worst case is a phone downloading desktop bytes.
- Variants exist only for imported/migrated media. An editor swapping a hero
  image in the CMS gets no automatic variant (documented limitation; the
  runtime branches above are the upgrade path, gated on ITM-032).
- The `-w828.webp` suffix is a **convention shared between the import pipeline
  and `HeroPreload`** — changing either side alone breaks preload pairing
  (both sides carry comments naming the counterpart).
