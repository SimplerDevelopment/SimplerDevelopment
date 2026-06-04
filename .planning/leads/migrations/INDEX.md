# Outbound Demo Pilot — Migration Index

Pre-staged 2026-05-13 by Claude in pre-restart session. Next session: read `../pilot-runbook.md` first, then execute each migration plan below.

## Order of execution

Sequential, not parallel. Each `/site-migration` invocation drives its own crawl + extract + block-mapping pipeline.

| # | Slug | Plan | Source | Outreach email | Tests these blocks |
|---|---|---|---|---|---|
| 1 | `prospect-gramercy-design` | [plan](./prospect-gramercy-design/migration-plan.md) | gramercy.design | info@gramercy.design | hero, card-grid, gallery, site-footer (clean baseline) |
| 2 | `prospect-beyond-modern` | [plan](./prospect-beyond-modern/migration-plan.md) | bmihomestyling.com | info@bmihomestyling.com | hero, cta, gallery (12 items), card-grid (10 items), inquiry form |
| 3 | `prospect-storm-interiors` | [plan](./prospect-storm-interiors/migration-plan.md) | storminteriors.com | info@storminteriors.com | services-grid (9), quote (3), card-grid, cta |
| 4 | `prospect-lark-interiors` | [plan](./prospect-lark-interiors/migration-plan.md) | larkinteriorstx.com | janelle@larkinteriorstx.com | services-grid (4), featured-content, quote (5), blog-posts feed |
| 5 | `prospect-cortney-bishop` | [plan](./prospect-cortney-bishop/migration-plan.md) | cortneybishop.com | info@cortneybishop.com | gallery (12+6, dense), services-grid (8), quote, image + cta |

## Block-coverage matrix

Across the 5 demos, the pilot exercises: `hero` (×5), `gallery` (×4), `card-grid` (×4), `services-grid` (×3), `quote` (×3), `cta` (×4), `text` / `heading` (×5), `featured-content` (×1), `blog-posts` (×1), `image` (×1), `site-footer` (×5). Good coverage of the high-frequency blocks.

## Post-migration checklist (per site)

1. Inject password JS gate (template in `../pilot-runbook.md` → "Password-protect approach"). Use password from `.demo-credentials`.
2. Verify preview URL renders + gate appears + password works.
3. Record in `../pilot-results.md`:
   - Migration time (start/end)
   - Token usage if known
   - Block-mapping gaps (any source sections that didn't fit existing blocks)
   - Visual fidelity vs source (subjective 1-5)
4. Move to next.

## After all 5

Write `../pilot-results.md` with:
- Summary table (5 rows: site, time, fidelity, gaps)
- Recommended platform changes (which blocks need new variants, which mappings were lossy)
- Decision: expand to all score-5 firms, or stop here

## Credentials

`.demo-credentials` (gitignored, chmod 600) contains the password per site. Do NOT commit. Do NOT share via insecure channels — when sending the demo link to a prospect, use the email of record (column above) and treat the password as soft-gate-only (the JS overlay is bypassable; this is anti-discovery, not security).
