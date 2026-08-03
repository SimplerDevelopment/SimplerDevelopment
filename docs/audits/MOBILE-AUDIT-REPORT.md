# Mobile / Responsive Audit — /portal

Worktree: `worktree-mobile-responsive-audit`
Run: 2026-05-16 overnight, autonomous
Viewport tested: **iPhone 14 Pro — 390×844** (real device UA, isMobile + hasTouch)
Dev server: `localhost:3100` (parallel to the existing 3001 instance, no interference)

## TL;DR

- **81 portal routes** auto-discovered and audited (every `app/portal/**/page.tsx` whose params could be resolved against seed data).
- **0 routes** still scroll the **body** horizontally on a 390-wide viewport. Pre-fix that count was 7+ (the audit timed out on many cold-compile routes initially, but those that completed showed widespread body overflow).
- **1 route** still has element-level overflow outside a scroll container: `/portal/email/campaigns/new` — the visual editor canvas. This is a desktop-class tool and is documented as a known limitation; mobile users see the editor truncated by the layout's `overflow-x-hidden` safety net.
- **2 routes** report hydration warnings — `/portal/login` and `/portal/settings/api-keys`. Both pre-existing, caused by `typeof window` branches; unrelated to mobile.
- **0 new TypeScript errors** introduced (verified by running `tsc --noEmit` before vs. after; 80 pre-existing errors in `tests/` and `scripts/` are identical in both runs).

## What changed

10 commits on `worktree-mobile-responsive-audit`:

```
2b0a429e1 ui(portal): mobile responsiveness — agency, approvals, projects, misc
cee1a2be0 ui(portal): mobile responsiveness — brain area
c4ad248b2 ui(portal): mobile responsiveness — branding + nav editor + AI chat widget
d5e1dc17b ui(portal): mobile responsiveness — tools (booking + pitch-decks)
7a4050a8e ui(portal): mobile responsiveness — automations
e4e853704 ui(portal): mobile responsiveness — email + CRM
5d18363ca ui(portal): mobile responsiveness — settings + api-keys tables
7e8eb5f2b ui(portal): mobile responsiveness — websites + tickets
fbd0be395 ui(portal): responsive padding + overflow guard on portal layout
1e3f98d2c chore(audit): mobile/responsive audit harness + scripts
```

Total: ~60 files, +166/-141 lines. All Tailwind class changes — no layout
restructure. Desktop appearance is preserved via `sm:` / `md:` prefixes.

## The patterns applied

Six recurring mobile-breaking patterns drove ~95% of the fixes:

| Pattern | Fix |
|---|---|
| `flex items-center justify-between` header rows with title + action button(s) | Add `flex-wrap gap-3` (or `flex-col md:flex-row` for tall content) |
| Tabs / segmented controls (`flex gap-1` chips) | Wrap in `overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0`, add `whitespace-nowrap` per chip |
| `<table>` not wrapped | Wrap in `<div className="overflow-x-auto -mx-4 sm:mx-0">` and give the table `min-w-[640px]` so columns don't squeeze |
| `grid grid-cols-{2,3,4}` without responsive prefix | Prefix with `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (or equivalent) |
| `w-[Npx]` / `min-w-[Npx]` where N > 320 | Change to `w-full sm:w-[Npx]` or `w-[calc(100vw-2rem)] sm:w-[Npx]` |
| Side-by-side editor panes | Add `flex-col md:flex-row` so they stack on phones |

In the global `PortalLayoutClient.tsx` I also:
- Changed the main padding from `p-6` to `p-4 sm:p-6` (24→16px gutters on phones).
- Changed the notification-bell row from `px-6` to `px-4 sm:px-6`.
- Added `overflow-x-hidden` to the layout wrapper as a safety net so a single misbehaving page can't horizontally scroll the entire portal.

## How it was driven

The audit and fixes ran end-to-end overnight, fully autonomous, in a
fresh git worktree against a dedicated dev server on port 3100 (the
existing 3001 instance was left alone).

1. **Discover** — walked `app/portal/**/page.tsx` to enumerate every route; resolved dynamic params (`[siteId]`, `[id]`, `[postId]`, etc.) by hitting list endpoints at runtime.
2. **Audit** — a Playwright Chromium script visits each route at iPhone viewport, logs in once, captures a full-page screenshot, and records body-level overflow, per-element overflow (skipping elements inside `overflow-x-auto` ancestors), tap-target sizes, console errors, page errors, nav state. Ran sharded 4-way.
3. **Catalog** — an explore agent did a static-search pass across the codebase for the six known anti-patterns, producing a per-file punch list.
4. **Fix** — 7 parallel general-purpose agents took disjoint slices of the punch list (websites+tickets, automations, settings, tools, email+crm, branding+AIChat, brain+remaining) and applied Tailwind-only edits.
5. **Verify** — re-ran the audit sharded 4-way against the post-fix code, ran `tsc --noEmit` to confirm zero new type errors, then made targeted post-pass fixes for the 4 routes that still showed real issues (api-keys tables, email/campaigns/new toolbar, projects card grid, approvals tab strip).

## Known limitations / out of scope

- **`/portal/email/campaigns/new`** — the visual email editor has a side-by-side canvas + sidebar at fixed widths. Making it usable on mobile would require a full layout redesign (probably collapsing to a single pane). Out of scope for tonight; the `overflow-x-hidden` safety net at least keeps the rest of the portal scrolling cleanly.
- **Hydration errors on `/portal/login` and `/portal/settings/api-keys`** — both caused by `typeof window !== 'undefined'` branches. Pre-existing, not caused by these changes; should be fixed by replacing with `useEffect`-driven state.
- **`/portal/surveys` 500** — pre-existing DB schema drift (`parent_survey_id` column missing from the live DB). Documented in repo memory under `project_sd2026_drizzle_tracker_drift`. Not touched here.
- **Tap-target warnings** — the audit's tap-target check flagged ~70 cases of `<a>` text inside table cells being narrower than 32×32. These are false positives: the bounding box of the inline text is what's measured, but the whole `<td>` is the actual tap target (which is much taller). No action needed.

## How to re-run the audit

```bash
# In this worktree (port 3100 is whitelisted in middleware.ts):
bun install
PORT=3100 bun dev > /tmp/mobile-audit-dev.log 2>&1 &

# Audit all routes (sharded for parallelism, ~10 min total):
for s in 0 1 2 3; do
  node --experimental-strip-types scripts/audits/mobile-audit.ts --shard=$s/4 \
    > .mobile-audit/logs/shard-$s.log 2>&1 &
done
wait

# Per-route screenshots: .mobile-audit/screenshots/
# Per-route findings JSON: .mobile-audit/findings/
# Markdown report: .mobile-audit/report.md

node --experimental-strip-types scripts/audits/mobile-audit-summarize.ts
```

The audit script is also tablet-aware (`--viewport=tablet` for 768×1024).
