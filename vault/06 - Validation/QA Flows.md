---
type: playbook
domain: validation
status: active
date: 2026-06-09
sources:
  - tests/CLAUDE.md
  - tests/CI-GATES.md
  - tests/TESTING_PLAN.md
  - CLAUDE.md
  - .claude/skills/site-migration/SKILL.md
---

# QA Flows

**Question to answer in 30 seconds:** when do I use /qa vs /visual-compare vs E2E, and where do outputs go.

---

## Decision table

| Situation | Tool |
|---|---|
| Verify a feature works end-to-end after shipping | `/qa` — interactive mode |
| Explore a flow you did not write tests for yet | `/qa` — exploratory mode |
| Record a user journey for async review or client demo | `/qa` — video mode |
| Verify a site migration or UI port looks right vs the original | `/visual-compare` |
| Block-type or visual-editor change needs visual verification | `/visual-compare` |
| New user journey needs repeatable automated coverage | `/e2e-writer` to write a spec, then `/e2e-runner` to run it |
| Smoke every portal route for regressions | `bun test:critical` (runs `portal-smoke-all-routes.spec.ts`) |

---

## `/qa` skill — three modes

Invoked as the `/qa` slash command in Claude Code.

### Interactive mode

Drives a real browser via Playwright. Steps through a flow, takes screenshots, reports pass/fail at each step. Use when you want to confirm a specific feature works with a live app — not just that tests pass.

When to use:
- After shipping a block type, visual-editor change, or any UI flow.
- When `bun test:critical` is green but you want human-quality confirmation.
- Checking a staging deploy before `scripts/promote-to-prod.sh`.

### Exploratory mode

Unscripted walkthrough: the agent navigates freely, looking for broken states, console errors, or visual regressions. Use when you are unsure what to check — let the agent surface issues.

When to use:
- After a large refactor touching many pages.
- First QA of a newly onboarded client site.
- When a bug report is vague ("something looks wrong in CRM").

### Video mode

Records a Playwright video of a journey. Use for async review or client-facing demos where a recorded walkthrough is more useful than a report.

When to use:
- Onboarding demos.
- Reproducing a reported bug for a ticket.
- Pre-release walk-through sent to stakeholders.

---

## `/visual-compare` skill

Compares two versions of a rendered page (original vs rebuilt, or before vs after a change) section by section. Produces a per-section diff table.

When it is required:
- **Site migrations** — after `site-migration` skill, every flagged page from `scripts/migrations/<site-slug>/visual-compare-pages.ts` must pass visual-compare before sign-off.
- **Block type changes** — any change to a block's render output in `app/sites/`.
- **Visual editor shell** — changes to overlay, iframe, or postMessage protocol in `components/portal/visual-editor/`.
- **Storefront or CMS page templates** — layout changes in `app/sites/`.

The bulk page-comparison script lives at `scripts/migrations/site-migration/scripts/visual-compare-pages.ts` (used by the site-migration skill). For targeted deep-dives, use `/visual-compare` directly.

---

## Where QA outputs go

| Output | Location |
|---|---|
| Playwright HTML report (E2E runs) | `playwright-report/index.html` (gitignored) |
| Screenshots from `/qa` or failed specs | `playwright-report/` or `docs/screenshots/` (for kept artifacts) |
| Video recordings | `playwright-report/` by default; save to `docs/screenshots/` if keeping |
| Coverage reports | `coverage/` (all subdirs gitignored) |

Do **not** commit screenshots or videos to repo root — they go in `docs/screenshots/` if they need to be tracked. Repo-root debug artifacts (`*.png`, `editor-snapshot.md`, `audit-verify-*.png`) are stale and should not be recreated.

---

## E2E visual test infrastructure

`tests/e2e/snapshots.spec.ts` (tagged `@critical`) tests CMS content snapshot export/import round-trips — it is not a pixel-diff spec. Playwright visual pixel-diffs (`.toHaveScreenshot()`) are not yet wired into this codebase. When they are added, their reference images should be committed alongside the spec and updated intentionally:

```bash
# Update reference images after an intentional visual change (future use)
npx playwright test <spec> --update-snapshots
```

---

## Block / editor changes — required QA steps

For any change to a block type render or the visual editor:

1. `bun test:critical` — smoke includes `visual-editor-shell-baseline.spec.ts` and `visual-editor-blocks.spec.ts`.
2. `/visual-compare` on at least one affected page in dev and staging.
3. `/qa` interactive walk of the editor flow (add block, edit props, preview, save).
4. Check `tests/e2e/snapshots.spec.ts` — update snapshots if the change is intentional.

---

## Staging promotion gate

Before promoting staging to production, run via `scripts/promote-to-prod.sh`:

1. `bun test:critical` against the staging `BASE_URL`.
2. `bun test:tenancy` against the staging DB.
3. If both pass, the script prints the suggested promotion command and exits 0.

Promotion itself is currently a manual `git push origin staging:production` step (no production remote is wired yet).
