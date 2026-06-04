---
name: sd-marketing-screenshots
description: Capture clean, marketable, data-filled product screenshots of the authenticated portal/app features and wire them into the public /solutions marketing galleries. Use when the user says 'screenshot the features', 'add product screenshots to the solutions pages', 'refresh the marketing screenshots', 'capture the portal for marketing', 'update the solution hero images', or wants real in-app screenshots (tables populated, no empty states) shown on marketing pages without errors, loading states, or the Next.js dev badge. Also covers the temporary "scheduled maintenance" gate for hiding in-progress marketing pages on production while screenshots are being redone.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
---

# sd-marketing-screenshots

Capture **marketable** screenshots of authenticated portal features and drop them into the `/solutions` hero galleries. "Marketable" means: real data (tables/records populated, business names — never test/E2E names), the correct page for the feature, consistent 1440×900, **no Next.js dev badge**, no error overlay, not mid-load, no empty-state.

This is browser-automation + data-seeding heavy and runs against a throwaway DB. **Never** point captures at the production/dryrun DB, and **never** disrupt the user's running `:3000` dev server.

## Where things live

- Screenshots (web-served): `public/screenshots/solutions/<slug>/NN-label.png`
- Slug → image-path map: `lib/data/solution-screenshots.ts` (`solutionScreenshots`)
- Gallery component: `components/solutions/SolutionGallery.tsx` (carousel; browser-chrome frame, prev/next, thumbnails, captions auto-derived from filename)
- Rendered in: `app/(pages)/solutions/[slug]/page.tsx` hero (falls back to the icon visual when a slug has no screenshots)
- Solution slugs (19): driven by `lib/data/solutions.ts` (`getAllSolutions()`)
- Maintenance gate: `components/marketing/MaintenanceNotice.tsx` (`SOLUTIONS_UNDER_MAINTENANCE`)

## The capture pipeline (delegate to an `e2e-visual-tester` / browser agent)

Capturing 50+ authenticated screens is long — run it as a background `Agent`. The orchestrator (you) then reviews the result via a montage and commits. Hand the agent these exact steps:

### 1. Isolated worktree server (NOT the user's :3000)
Next dev holds a single `.next/dev/lock` per project dir, so you cannot run a second dev server in the main checkout while `:3000` is up. Use a git **worktree** (separate dir → separate `.next`):
```
git -C <MAIN> worktree add --detach /tmp-or-home/sd-shot-wt <commit>   # e.g. a known-good commit or origin/main
WT=<worktree>/simplerdevelopment2026 ; cd $WT
ln -s <MAIN>/node_modules $WT/node_modules        # deps + playwright browsers
cp <MAIN>/.env $WT/.env ; cp <MAIN>/.env.local $WT/.env.local
```
- DB: use the throwaway `simplerdev_test` (already migrated by integration runs). DSN: `postgresql://$USER@localhost:5432/simplerdev_test`. **Inline `DATABASE_URL` wins** over `.env.local` for `next dev`/`tsx scripts` (Next/dotenv don't override existing `process.env`) — but `drizzle.config.ts` uses `dotenv override:true`, so **do NOT run `db:migrate` here** (it would target the dryrun DB); `simplerdev_test` is already migrated.
- If the page imports a not-yet-committed file (e.g. `app/portal/projects/[id]/[[...card]]/dynamic-tabs.tsx`), `cp` it from `<MAIN>` so the worktree build doesn't break.

### 2. Seed accounts + fake business data
```
DATABASE_URL=…simplerdev_test npx tsx scripts/seed-admin-e2e.ts   # client@example.com/client123
DATABASE_URL=…simplerdev_test npx tsx scripts/seed-admin.ts       # admin@example.com/admin123  (seed-admin-e2e MISSES the admin)
```
Then seed **rich, business-named** demo data for ONE featured client (e.g. "Northwind Coffee Co.", client_id=1) across every feature you'll shoot — empty/test-named data is the #1 cause of unmarketable shots. Cover: websites (rename "Test Site …" to real names), products w/ prices, CRM contacts/companies/deals, email lists+campaigns (with sent stats so Analytics ≠ $0), publishing cards+campaigns (+ `scheduledFor` so the calendar fills), brain people/decisions/org-units, pitch decks, projects + tasks assigned to the login user (so My Tasks fills), bookings, invoices with clean line items.

### 3. Run the server — NO Next.js dev badge
`devIndicators: false` is **NOT enough** in Next 16 — the red "N Issue" runtime badge still renders. Two ways:
- **Production (cleanest, zero dev UI):** `npx next build && next start -p 3100`. ⚠️ The prod build currently **OOMs on the in-build TS check** for this repo — if it fails, use the fallback.
- **Dev fallback (what actually works here):** `next dev -p 3100`, and **before every screenshot remove the dev-tools DOM host**:
  ```js
  await page.evaluate(() => document.querySelectorAll(
    'nextjs-portal, [data-nextjs-toast], [data-next-badge-root], #__next-build-watcher, [data-nextjs-dev-tools-button], [data-next-mark]'
  ).forEach(n => n.remove()))
  ```
  Removing the `nextjs-portal` host kills the dev overlay/badge even though it's a shadow-DOM web component.
- Launch with auth pointed at the capture port: `NEXTAUTH_URL=http://localhost:3100 AUTH_TRUST_HOST=true AUTH_URL=http://localhost:3100 PORT=3100`.

### 4. Capture (Playwright MCP), 1440×900, admin login
Log in as `admin@example.com/admin123` (staff sees all tenant data) and set the `sd-active-client` cookie to the featured client. Per screen: navigate → **pre-warm** (dev compiles on first hit: wait `networkidle`, reload if a skeleton shows) → wait for real content selector → settle ~1500ms → run the dev-tools-removal → **verify before saving**: no error overlay, no spinner, no empty-state ("No X" / "$0"), no badge, shows real data. Overwrite `public/screenshots/solutions/<slug>/<existing-filename>.png` (keep filenames so the map stays valid). Capture several screens deep per feature (list → detail → sub-tab). Use the correct feature page (e.g. CRM lead → **/portal/crm/deals** pipeline, not the generic `/portal` dashboard).

### 5. Teardown
Kill the server, `rm -f $WT/node_modules`, `git -C <MAIN> worktree remove --force <worktree>`. **No git commits inside the agent** (the orchestrator commits).

## Orchestrator review + commit

1. **Montage review** — build a contact sheet and eyeball ALL shots (the agent's self-report isn't enough; thumbnails also lazy-load, so spot-check suspicious cells full-res):
   ```bash
   OUT=public/_sdmontage.html   # temp; served by the running :3000 dev server
   { echo '<!doctype html><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">';
     for f in $(find public/screenshots/solutions -name '*.png'|sort); do
       echo "<div><div style=font:11px monospace>${f#*solutions/}</div><img src=\"${f#public}\" style=width:100%></div>"; done
     echo '</div>'; } > $OUT
   ```
   Open `http://localhost:3000/_sdmontage.html`, resize wide (e.g. 2400px), screenshot in scroll bands, read each band. Look for: empty states, test names, wrong pages, error overlays, and the red dev badge (bottom corner). Delete `$OUT` after.
2. Re-shoot only the offenders (targeted agent) until the whole set is clean.
3. Commit just the assets: `git add public/screenshots/solutions && git commit` (see gotchas re: pre-commit hooks).
4. If slugs/filenames changed, update `lib/data/solution-screenshots.ts` and the `[slug]` page renders the gallery automatically.

## Maintenance hotfix (hide in-progress marketing pages on prod)

While re-shooting, gate the public Solutions pages so visitors don't see broken galleries:
- `components/marketing/MaintenanceNotice.tsx` exports `SOLUTIONS_UNDER_MAINTENANCE` + a `<MaintenanceNotice/>`.
- `app/(pages)/solutions/page.tsx` and `[slug]/page.tsx` early-return it: `if (SOLUTIONS_UNDER_MAINTENANCE) return <MaintenanceNotice/>;`
- The rest of the marketing site stays live. **Lift** by flipping the flag to `false` (or deleting the file + the two imports) and redeploying — only after the screenshots are final.
- To hotfix **production**: this repo's prod tracks `main`. Do a **surgical single commit** on a `main` worktree (don't push the whole local branch — it's 100+ commits ahead and would be a huge release). `git worktree add --detach <dir> origin/main`, apply the gate, commit, `git push origin HEAD:main`.

## Gotchas (learned the hard way)

- **`devIndicators:false` ≠ no badge** in Next 16 → remove the `nextjs-portal` DOM node, or capture in prod.
- **Prod build OOMs** on the TS check for this repo → dev + DOM-removal is the working path.
- **Empty/test-named data** is the top marketability failure → seed business data per featured client; log in as **admin** for fullest data visibility.
- **Wrong page**: a feature's lead shot must show THAT feature (e.g. CRM = `/portal/crm/deals`, not the portal dashboard).
- **Shared Playwright MCP browser**: a running capture agent and the orchestrator share one browser — don't drive it while an agent is mid-capture (it'll hijack the tab).
- **Pre-commit hooks**: the file-size budget hook scans the working tree; an unrelated god-file (`lib/mcp/tools/kanban.ts`) can be over-baseline and block commits. The guard hook also forbids `--no-verify`. Workaround: `git checkout HEAD -- <that file>` before committing your assets (preserve its change in a stash), or have the owner re-baseline. Stage ONLY your paths (`git reset` first if the index is polluted by concurrent work).
- **Concurrency**: this repo often has another agent/session committing — re-fetch and re-check branch tips before any push; stage explicit pathspecs only.
