# Screenshots

Real captures from the running app (not mockups), for the marketing site, README, blog, and social assets.

## marketing/ — captured via Playwright against a local build
- `home-desktop.png` / `home-mobile.png` — homepage (1440×900 / 390×844)
- `pricing-desktop.png` / `pricing-mobile.png` — pricing page
- `solutions-index-desktop.png` — /solutions index (all modules)
- `solution-company-brain-desktop.png` — a representative /solutions/[slug] page (hero + product gallery + JSON-LD)
- `portal-onboarding-desktop.png` — the authenticated onboarding wizard (real product entry)

## solutions/ — product screenshots (pre-existing)
`solutions/<slug>/*.png` — 71 product screenshots captured against a fake "Northwind Coffee Co." demo tenant (no real PII), surfaced in each `/solutions/[slug]` page gallery via `lib/data/solution-screenshots.ts`.

## Pending (follow-on)
- **Deeper authed product screens** (CRM, visual editor, brain detail) at desktop+mobile — `client@example.com` is gated to onboarding in the e2e seed; capturing these needs a fully-onboarded seeded tenant (or the existing `solutions/` set already covers most product UI).
- **Tablet + dark-mode variants.**
- **GIFs** (`public/gifs/`) — DELIBERATELY not auto-generated: the `vhs` hero tape (`docs/launch/demo.tape`) is a *staged/simulated* session and its own comments warn against shipping a faked demo. The honest hero GIF must be recorded against a real running instance + MCP client (maintainer action). Do not ship the staged tape output as-is.

Capture convention: full-page PNG, desktop 1440×900 / tablet 834×1112 / mobile 390×844.
