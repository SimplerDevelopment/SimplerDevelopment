---
title: Open-Source Pre-Flight Checklist
type: validation-playbook
status: draft
created: 2026-06-23
updated: 2026-06-23
goal: Community / credibility OSS launch (Apache-2.0)
---

# Open-Source Pre-Flight Checklist

The go-public gate. Getting any 🔴 item wrong destroys the credibility this launch is meant to build. Work top-down — do not skip a tier.

> **Status 2026-06-23:** Done on branch `oss-prep` (8 commits, never merges to main) — Tier 1A (data/secrets), Tier 1B (client code), Bucket 2 (generic renames), Tier 2 (LICENSE/SECURITY/infra sanitize), **secret-scanner gate PASSED** (trufflehog 0 live secrets; gitleaks 39 → all FP or vault-excluded), **README reframed + CONTRIBUTING.md + complete .env.example**. **Remaining:** (1) create the public repo — fresh `git init` from cleaned tree + single initial Drizzle migration + `.gitleaksignore`; (2) USER: rotate Google Fonts key (GCP), rotate Obsidian REST key, `rm -rf` untracked client-data remnants on disk.

> **Findings verified 2026-06-23** via read-only scan + an Explore catalog sweep over git-tracked files. Concrete paths are inlined. Tier 1 still mandates a real scanner pass before publish — "grep found nothing" is not clearance.

---

## Tier 0 — The one strategic decision (LOCKED: fresh repo)

- [x] **Fresh public repo, NOT a history scrub.** Confirmed mandatory: `backup_file.dump` (17MB prod DB dump) and `.planning/leads/*` (real prospect PII) are in history. Scrubbing is high-risk and one miss = a breach. **Create a brand-new public repo from a curated snapshot of the cleaned tree, no history.** Keep the private repo as the dev repo; the public one is a sanitized, periodically-synced mirror.

- [ ] **Architecture decision — de-tenant scope (SEE BOTTOM).** Client-specific *code* is woven into the platform. Decide: sanitized snapshot (delete client modules from the public copy) vs. refactor-to-generic first. This gates everything in Tier 1B.

---

## Tier 1A — 🔴 Data/secret blockers (delete or exclude; mechanical)

- [ ] **`backup_file.dump`** (repo root, 17MB) — full Postgres dump w/ password hashes + all client data. Delete from working tree AND purge from the private repo's history (BFG / `git filter-repo`). Never include in the public snapshot.
- [ ] **Exclude `.planning/` wholesale** (172 files) — contains `leads/outbound-prospects-2026-05.csv` + `leads/migrations/prospect-*/` with real non-consented people's names/emails/companies, internal DB IDs, local filesystem paths.
- [ ] **Exclude `vault/` wholesale** (143 files) — internal ADRs, project board, client domain maps, GTM strategy, and plaintext creds (the vault feature specs contain plaintext credentials).
- [ ] **Delete client migration trees** — per-client migration directories under `scripts/migrations/<client>/` + loose client `.mjs`/`.sql` in `scripts/migrations/` root + `scripts/<client>/` + `public/sites/<client>/` + `public/clients/<client>/`.
- [ ] **Rotate plaintext passwords** found in tracked files (regardless of OSS): `<client-password>` (multiple found). Sources: vault feature specs, `tests/e2e/visual-editor-<client>.spec.ts`, `scripts/migrations/*/setup-client.ts`, `scripts/reset-client-password.ts`.
- [x] **Google Fonts API key** — env-only fix shipped (`65be43a9`). Still must rotate the leaked value in GCP.
- [ ] **Run real secret scanners** (`gitleaks detect` + `trufflehog filesystem .`) over the exact curated snapshot. Zero findings to proceed.

---

## Tier 1B — 🟠 De-tenant the platform (BLOCKED on the architecture decision)

Client-specific code inside core source. Treatment depends on the Tier 0 architecture decision.

- [ ] **`SITE_CONTACT_OVERRIDES`** in `app/sites/[domain]/layout.tsx:33-91` — real phones, addresses, emails, a CA lending license (`<CA lending license>`). Delete the block; data belongs in the per-tenant branding schema.
- [ ] **Legacy content-client module (37 files)** — `lib/content-pipeline/*`, `lib/db/schema/<client>.ts`, `lib/ai/models.ts` slots, `app/api/cron/example-weekly-drop/`, storefront API refs. Deeply wired — refactor or remove as a unit.
- [ ] **`example-*` blocks (18 files)** — 8 client-specific block types in `BlockRenderer.tsx`, `ExampleHeroBlockRender.tsx`, defaults, icons, editor picker, tests. Either genericize the block types or remove.
- [ ] **Client-specific component directory (4 files)** + `app/(pages)/p/[slug]/` — client-specific components/route.
- [ ] **Client-named DB tables** — `content_briefs`/`content_drafts` (`schema/plugins.ts`), `design_assets` (`schema/productDesigner.ts`). Rename/abstract.
- [ ] **Client email-pattern rule** — `lib/agentic-os/rules.ts:46`, `registry.ts:232`. Generalize.
- [ ] **`content-tools` plugin coupling** — `lib/automation/engine.ts:334` dynamic import ties the plugin system to a client name. Generalize the plugin loader.
- [ ] **Owner email in production UI** — `app/portal/settings/billing/plans/page.tsx:22` + `components/portal/onboarding/steps/StepChooseModules.tsx:29` (`sales@simplerdevelopment.com`) → generic `sales@`.
- [ ] **Client-name code comments** — sweep `app/sites/`, `components/blocks/render/*`, `lib/blocks/*` for client-name identifiers in comments.

---

## Tier 2 — 🟡 Before public (first-impression)

- [ ] **Sanitize `CLAUDE.md`** — strips infra topology (Railway proxy host env vars `$PROD_DATABASE_URL`/`$STAGING_DATABASE_URL`/`$DEV_DATABASE_URL`), Vercel project `<vercel-project>`, account `sales@simplerdevelopment.com`, repo name.
- [ ] **Railway prod hostnames** in surviving (non-migration) scripts: `scripts/{brain/backfill-taxonomy,cleanup-test-schemas,fix-embedding-jobs-unique-idx,reset-e2e-db,verify-db-target}.ts` → env-var only.
- [ ] **Local filesystem paths** in source — `scripts/catalog/upload-photos.ts:32` (`<repo-root>/...`).
- [ ] **`LICENSE`** = Apache-2.0. **`SECURITY.md`** disclosure policy.
- [ ] **Complete `.env.example`** — every required var documented; verify `<10-min` clean-machine setup.
- [ ] **Remove repo-root debug artifacts** (don't-touch-zone junk).

---

## Tier 3 — Process / ongoing (on the public repo)

- [ ] GitHub secret scanning + push protection ON.
- [ ] `gitleaks` pre-commit hook.
- [ ] Dependabot ON. Branch protection + `CODEOWNERS` on `main`.
- [ ] Define the public↔private sync workflow so client data can't flow back in.

---

## Credibility positives to surface (assets, not blockers)

- `lib/ai/brain-tools/sanitizer.ts` — deterministic PII/secret redaction on AI tool output. Strong security story.
- Clean Stripe-key hygiene in tests (`sk_test_*` placeholders, env-gated fixtures).
- The agent-docs system (`.claude/index.md`, nested `CLAUDE.md`, scaffolding skills) — a real differentiator; translate (sanitized) into the contributor guide.

---

## THE DECISION THAT GATES EXECUTION

Tier 1B exists because client code lives in the platform. Two ways to handle it:

- **A) Sanitized snapshot (fast, fork burden):** delete the client-specific modules (`content-pipeline`/client blocks/etc.) from the public copy only; keep them in the private prod repo. Public ≠ production; you maintain a divergence. Risk: ripping out 37 deeply wired files cleanly without breaking the build is real surgery, and the snapshot must still build + pass tests.
- **B) Refactor-to-generic first (slow, right):** properly extract client code into the plugin system / tenant config so the platform is genuinely tenant-agnostic, then public == production, no fork. Weeks of work, but fixes real debt and the published code is clean — best for a *credibility* goal.

## Definition of done

All 🔴 + 🟠 resolved, both scanners clean on the published tree, a teammate has independently confirmed `scripts/migrations/`, `.planning/`, `vault/`, and `backup_file.dump` are absent from the snapshot, and the snapshot builds + passes `bun test:critical`. Only then flip public.
