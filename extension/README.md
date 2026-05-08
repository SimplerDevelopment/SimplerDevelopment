# SimplerDevelopment Brain — Chrome Extension

A Manifest V3 Chrome extension that turns any browser tab into a capture surface for your SimplerDevelopment Company Brain + CRM.

- One-click capture of the current page with AI summary and tag suggestions
- Detected-entity chips: every person/company the AI extracts gets a "+ Contact" / "+ Company" pill — instant CRM creation. Already-in-CRM matches link straight to the portal record
- "On this site": when the page domain matches a CRM company, surface that company's open deals and Attach them to the current note in one click
- Person/company page detection: when you're on a LinkedIn-style profile or a company website, the popup leads with a primary "Save as Contact" / "Save as Company" action
- Email signature parser in the Records tab — paste a signature, the AI parses out name/email/title/company, pre-fills a Contact draft
- Quick-task: add a Brain task with title, due date, and priority directly from the capture surface, attached to the current page + any pickers you've set
- Tag autocomplete that learns: starts from AI suggestions, then queries your tenant's existing Brain tags as you type
- Recent activity: see the last 14 days of notes/contacts you've created via the extension
- Search Brain notes, contacts, companies, and deals — unified results panel
- Right-click context menus for selection-to-note and selection-to-search
- Toolbar badge shows the count of existing notes for the current URL/domain
- Keyboard shortcut to pop the capture surface from anywhere

## Prerequisites

- Node.js 20+ and npm 10+ (the parent monorepo uses bun, but this folder is standalone npm)
- A SimplerDevelopment portal you can sign into
- Chrome / Chromium / Edge / Brave (any MV3-capable browser)

## Install

```bash
cd extension
npm install
```

The `prepare` script auto-generates four placeholder PNG icons into `public/`. You should replace them with real brand icons before publishing.

## Develop

```bash
npm run dev
```

This runs Vite + `@crxjs/vite-plugin` in dev mode. It writes a hot-reloadable `dist/` you can load as an unpacked extension.

## Build

```bash
npm run build
```

Output: `dist/`. Ready to load as an unpacked extension or to zip for the Web Store.

## Typecheck

```bash
npm run typecheck
```

Strict TypeScript, React 19, no emit.

## Load it in Chrome

1. `npm run build` (or `npm run dev` for live-reload)
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and pick the `extension/dist/` folder
5. Pin "SimplerDevelopment Brain" to your toolbar

## First-run setup

1. Open the portal at `https://yourportal.example`
2. Go to **Portal → Integrations → API Keys** and mint a personal key (it starts with `sd_mcp_`)
3. Right-click the extension icon → **Options** (or open `chrome://extensions`, click "Details", then "Extension options")
4. Paste your portal URL and API key, click **Test connection & save**. You should see "Connected as &lt;name&gt; (&lt;client&gt;)"

## Using it

- **Capture tab** (default when popup opens): the extension reads the current page and asks the portal to summarize, suggest tags, extract people/companies, and find any related CRM records — in parallel.
  - **Detected in page** — every extracted person/company shows up as a chip. The "+ Contact" / "+ Company" pill creates the CRM record in one click. Chips with existing matches show "In CRM" with a portal link.
  - **On this site** — if the current domain matches a CRM company, that company appears as a clickable chip and its open deals show up below with "Attach" pills (clicking attaches the deal to the next note save).
  - **Person/company page primary action** — on LinkedIn-style profile or company-website pages, a highlighted card pops above the form with a "Save as Contact" or "Save as Company" button (skips the note flow if that's all you wanted).
  - **Save Note** — pre-filled title/body/tags from the AI; selection text becomes a markdown blockquote. Tags auto-complete against your existing Brain tags as you type.
  - **Add task** (collapsible below Save Note) — give it a title, optional due date, priority, and it inherits whatever contact/company/deal you've attached on the form.
- **Search tab**: type at least 2 characters; results from notes / contacts / companies / deals appear grouped, each clickable through to the portal.
- **Records tab**:
  - **Paste an email signature** — drop a signature into the textarea, the AI parses it, the form pre-fills with name/email/title/company.
  - **+ New Contact** / **+ New Company** — inline forms with a debounced company autocomplete inside the contact form.
  - **Recent (last 14 days)** — the notes and contacts you've created via the extension, with portal deep-links and a refresh button.
- **Right-click menus**: select text on any page → "Save selection as Brain note" or "Search Brain for selection". On any page (no selection needed) → "Save page to Brain".
- **Keyboard shortcut**: `⌘⇧B` (mac) / `Ctrl+Shift+B` (win/linux) opens the popup. Customize at `chrome://extensions/shortcuts`.
- **Toolbar badge**: shows the number of Brain notes already linked to the current URL or its domain.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Popup says "Not configured" | Open Settings, paste portal URL + API key |
| "Invalid API key" toast | Re-mint a key in `Portal → Integrations → API Keys`, paste it in Settings |
| "Couldn't reach portal" | Check the portal URL (no trailing slash needed). If your portal is on a non-https origin, edit `host_permissions` in `src/manifest.ts` and rebuild |
| CORS error in DevTools | The portal must allow the `Authorization` header on `/api/extension/v1/*`. The portal-side route handler already does this — if you forked, mirror its CORS config |
| Capture tab says "Try reloading the tab" | The content script wasn't injected (the tab loaded before the extension installed, or it's a `chrome://` page). Reload the tab |
| Badge stuck at old number | Reload the tab — the badge refreshes on `tabs.onUpdated` and `tabs.onActivated`, with a 60s per-tab cache |

## Replacing the icons

The `prepare` script writes four placeholder PNGs into `public/`. Replace them in-place with your real brand icons (16×16, 32×32, 48×48, 128×128) and rebuild. Don't rename the files — the manifest references them by exact path.

## Architecture

```
extension/
  src/
    manifest.ts            # MV3 manifest as a TS object (crxjs converts)
    background/            # service worker — context menus, badge updater, command router
    content/               # content script — page extract + selection
    popup/                 # toolbar popup React app (Capture / Search / Records tabs)
    sidepanel/             # full-height variant of the same App
    options/               # settings page
    lib/
      api.ts               # typed client for /api/extension/v1
      types.ts             # zod schemas validated at the boundary
      page-extract.ts      # tiny Readability-lite + page-kind heuristic
      messages.ts          # typed cross-context message contracts
      storage.ts           # chrome.storage helpers (config + per-tab cache)
    styles/tailwind.css    # Tailwind 4 entry
  public/                  # icons, generated by scripts/gen-icons.mjs
```
