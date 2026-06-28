# Screenshots

Real captures from the running app (not mockups), for the marketing site, README, blog, and social assets.

## marketing/ — public pages (no auth)
Captured via Playwright at real viewports against a local build:
- `home-desktop.png` / `home-mobile.png` — homepage (1440×900 / 390×844)
- `pricing-desktop.png` / `pricing-mobile.png` — pricing page

## Pending (follow-on)
- **Authed product screens** (portal dashboard, CRM, visual editor, Company Brain, bookings, etc.) — need a Playwright login flow against seeded data; each feature page in `marketing/feature-pages/` lists its required shots in a "Media requirements" table.
- **Tablet + dark-mode variants** of the above.
- **GIFs** (`public/gifs/`) — require a recording tool (`vhs` not installed in this env); the README hero GIF tape is at `docs/launch/demo.tape`.

Capture convention: full-page PNG, desktop 1440×900 / tablet 834×1112 / mobile 390×844.
