---
type: oss-readiness-audit
date: 2026-06-27
auditor: read-only file-search agent + boss synthesis
status: draft
verdict: NOT YET SAFE TO PUBLISH — working-tree leaks + git-history scrub outstanding
---

# OSS Readiness Audit — SimplerDevelopment

## PUBLISH-SAFETY VERDICT: ❌ NOT YET SAFE TO MAKE PUBLIC

Working-tree leaks below must be scrubbed AND the git **history** must be swept (`open-source-release-prep`) before the repo or vault goes public. This audit checked the working tree only; history is a separate, heavier pass.

## 1. Publish safety

### 1a. Scrub already in progress (good)
~6 recent commits de-brand client names from scripts/tests/docs/vault; planning doc `vault/05 - Feature Specs/OSS Launch Playbook.md` (status `planned`).

### 1b. Working-tree leaks found
| # | Severity | Location | Issue |
|---|---|---|---|
| 1 | **HIGH** | `sd-chat-mobile/HANDOFF.md:587` | Real email + **plaintext password** (test login). Owner's real account. |
| 2 | MEDIUM | `public/mancuso/`, `public/uploads/palizzi/`, `public/assets/magamommy/` | Real client branding/product images. Referenced nowhere in source (grep: 0 hits). Leftover prod data. |
| 3 | MEDIUM | `sd-chat-mobile/lib/mock/currentUser.ts`, `.../brain.ts` | Mock data uses real domain `the maintainer's own project domain` + real persona names. In shipped mobile source, not tests. |
| 4 | LOW | `vault/05 - Feature Specs/Release Stabilization — Dev (= Prod) Green.md:18` | Internal DB codename an internal DB codename. Vault-only. |

**Clean (confirms scrub progress):** no committed `.env*`; no real API-key patterns outside validation code; no client domains in `app/`/`lib/`/`tests/`/`scripts/`; `.gitignore` covers `.env*` + MCP creds.

### 1c. LICENSE
Apache-2.0, complete, `Copyright 2026 SimplerDevelopment`.

### 1d. Self-host blocker (not a leak, but DX)
`middleware.ts` hardcodes `simplerdevelopment.com` in `PLATFORM_DOMAINS`, the subdomain extractor, and the cookie domain `.simplerdevelopment.com` (not env-overridable). Self-hosters on another domain get broken auth sessions.

## 2. Installation / "git clone to running"
- **README:** good — value prop, 5-step quick start, env table, architecture, testing, structure tree, contributing. **Gaps:** hero GIF missing (placeholder comment + broken `<img src="docs/launch/demo.gif">`; `docs/launch/demo.tape` exists, GIF not recorded); Railway deploy button is a stub (`railway.com/deploy`, no template).
- **Scripts:** comprehensive bun scripts; no single bootstrap wrapper (4-step quick start suffices).
- **Docker:** `docker-compose.yml` present, uses `pgvector/pgvector:pg16`, healthcheck, port 5432. No devcontainer.
- **`.env.example`:** present, annotated. **Gap: `ENCRYPTION_KEY` absent** despite being required by `app/api/portal/integrations/api-keys/route.ts` (500s without it) and CONTRIBUTING. Boot requires ~6 vars (DATABASE_URL, AUTH_SECRET/NEXTAUTH_SECRET, NEXTAUTH_URL, NEXT_PUBLIC_APP_URL, WORKSPACE_TENANT_SECRETS_KEY, PORTAL_KMS_KEY, OAUTH_STATE_SECRET) + effectively ENCRYPTION_KEY.
- **DB:** 6 Drizzle migrations, baseline `0000_baseline_2026_06_25.sql`, `db:migrate` guarded by `db:verify-target`. **pgvector `CREATE EXTENSION` not in any migration** — only in `scripts/reset-e2e-db.ts`; Docker image covers it, manual Postgres installs will fail at `vector(1536)` with no helpful error. Seed: `db:seed:dev`, `db:seed`.
- **Estimate:** Docker path **8–12 min** (close); manual Postgres **15–25 min** (pgvector + ENCRYPTION_KEY friction).

## 3. Repo health
`.github/` strong: `ci.yml` (quality + tenancy jobs), issue templates, PR template, dependabot, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, FUNDING. **Gap: no CHANGELOG / releases / semver tags.**

### CI gate status (2026-06-27)
| Gate | Status |
|---|---|
| Lint / Typecheck / File budget / Doc drift | GREEN (306 pre-existing TS errors isolated to `simplerdevelopment-agents/` subproject; 0 new) |
| Unit + coverage | GREEN (coverage floors all set to 0 / unenforced; ~63.7% unit as of 06-24) |
| Tenancy regression | GREEN in CI; true residual 18 failures = seed/fixture gaps |
| Critical e2e | NOT in CI (no staging secrets); local: 617 pass / 19 fail / 4 flaky |
| Arch boundaries | local pre-push only |

**Wave 2 residual:** 19 e2e + 18 tenancy failures. Dominant root cause: `client_services` entitlements not granted in `sessionForNewClientUser` test helper → ~40 routes 403. One central fix clears most. Plus missing seeded fixtures (booking page, AB record → 404), integration template missing `brain_embeddings` table (2 tenancy), and a few maybe-product items to investigate.

## Pre-publish checklist (priority order)
1. Scrub `sd-chat-mobile/HANDOFF.md:587` — real credentials.
2. Delete/replace `public/mancuso/`, `public/uploads/palizzi/`, `public/assets/magamommy/`.
3. Replace `the maintainer's own project domain` mock data with `example.com` personas.
4. Add `ENCRYPTION_KEY` to `.env.example` (`openssl rand -hex 64`).
5. Make `middleware.ts` cookie domain env-configurable (`NEXT_PUBLIC_APP_DOMAIN`).
6. Record demo GIF (`vhs docs/launch/demo.tape` → `docs/launch/demo.gif`).
7. Publish Railway template + fix README deploy button.
8. Scrub an internal DB codename from the Release Stabilization vault doc.
9. Add `CHANGELOG.md` / initial GitHub release.
10. Add `CREATE EXTENSION IF NOT EXISTS vector` to baseline migration.
11. **Run `open-source-release-prep` over git HISTORY** (not just working tree) before flipping public.
