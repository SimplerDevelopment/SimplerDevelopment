# SimplerDevelopment Skills — Client-Safe Manifest

**Purpose:** the authoritative list of which `.claude/skills/*` artifacts are appropriate to ship to **portal-client** end users (operators using Claude against their own SD tenant) vs which are **SD-team-only** (developers modifying the SD codebase itself).

**Audience:** anyone packaging these skills for distribution — bundle only the items marked `client-grade` here.

**Updated:** 2026-05-15

---

## Client-grade — safe to bundle for portal clients

These skills operate through the public SimplerDevelopment portal MCP (`/api/mcp`) with the client's own OAuth-scoped credentials. They author content **into the client's tenant** — pages, decks, emails, surveys, booking pages, custom HTML — and never touch the SD repo itself. The only filesystem writes they perform are within the client's working directory (`.sd/config.json`, `.sd/learnings.md`, `.sd/embeds/<slug>/`).

| Skill | Purpose |
|---|---|
| `sd-init` | Bootstrap `.sd/config.json` from the active tenant. Must run first. |
| `sd-create-page` | Draft CMS pages (landing, blog, marketing). |
| `sd-create-deck` | Draft pitch decks. |
| `sd-create-email` | Draft email campaigns (approval ≠ send). |
| `sd-create-survey` | Draft surveys / intake forms / NPS. |
| `sd-create-booking-page` | Embed or author booking pages. |
| `sd-create-website` | Compose a full multi-page site with top-nav. |
| `sd-build-html-embed` | Author single-file or zipped HTML and upload as a draft page or 1-slide deck. |
| `sd-learn` | Capture per-project feedback into `.sd/learnings.md` so sibling skills inherit it. |
| `html-render-block` | Edit `html-render` block JSON exported from the portal. |

### Companion files (load alongside, do not omit)

| File | Reason |
|---|---|
| `SD_DESIGN_PRINCIPLES.md` | Every `sd-create-*` skill cites this for design + a11y rules. Omitting it produces visually inconsistent output. Safe for clients — no internal infra refs. |

---

## SD-team-only — do NOT bundle for portal clients

### Internal runbooks (contain operational secrets and shared-infra paths)

| File | Why internal |
|---|---|
| `SD_SKILLS_RUNBOOK.md` | Contains DB connection commands, internal SQL (`portal_api_keys` mutations), shared-Postgres host names, migration-tracker drift notes. Author-internal handoff doc. |
| `MORNING_BRIEF.md` | Contains internal approval-link tokens, localhost URLs, bug-hunt history, branch names. Time-stamped handoff snapshot. |
| `CLIENT_SAFE_MANIFEST.md` (this file) | Meta. Don't ship the manifest itself to clients. |

### Codebase-modifying scaffold skills

These edit the SimplerDevelopment2026 monorepo — Drizzle schema, MCP server, block registry, portal UI, etc. They have no reason to run inside a portal-client's workspace.

| Skill | Why internal |
|---|---|
| `simplerdev-block-type` | Adds new block types to the in-repo `lib/blocks/registry.ts` + render pipeline. |
| `simplerdev-feature-scaffold` | Adds new CRUD resources (Drizzle schema + API routes + e2e). |
| `simplerdev-mcp-tool` | Adds new MCP tools to `lib/mcp/server.ts`. |
| `simplerdev-mcp-token-budget` | Audits / refactors MCP payload sizes in `lib/mcp/`. |
| `simplerdev-ui-scaffold` | Scaffolds admin / portal UI pages. |
| `simplerdev-visual-editor` | Debugs the in-repo CMS visual editor. |

### Migration / integration skills (operate on SD codebase)

| Skill | Why internal |
|---|---|
| `site-migration` | Imports an external site as a new SD client tenant. SD-team workflow, not a client self-service path. |
| `feature-integrator` | Compares an external app's source to SD's and ports features. SD-team R&D workflow. |

---

## Distribution checklist

Before handing the client-grade set to a portal client:

1. Copy ONLY the rows from the "Client-grade" table + `SD_DESIGN_PRINCIPLES.md` into the distribution.
2. **Do not include** any `.claude/skills/SD_*.md`, `.claude/skills/MORNING_*.md`, or `.claude/skills/simplerdev-*` directories.
3. Sanity-check `grep -rE "(metro\.proxy\.rlwy|simplerdev_local_|/tmp/|portal_api_keys|__drizzle_migrations)" <client-bundle>/` returns zero matches before shipping.
4. Pair the bundle with a client-facing quickstart (separate doc — see `CLIENT_QUICKSTART.md` when it exists). The quickstart should cover: connector config, OAuth, what `sd-init` does, and how to read the approval URL. **Do not** point clients at `SD_SKILLS_RUNBOOK.md`.

---

## Distribution mechanism (TBD)

The skills currently ship inside the SD2026 repo at `.claude/skills/`. Portal clients don't clone this repo, so a real distribution channel still needs to be decided. Options on the table:

- **A. npm package** (`@simplerdevelopment/claude-skills`) with a `postinstall` symlinker to `~/.claude/skills/`. Highest ergonomics, easiest to version.
- **B. Standalone git repo** with copy-paste install instructions. Lowest infra cost, manual updates.
- **C. Claude Code plugin** registered on the marketplace. Best DX once Claude Code plugins are stable, but requires owning a marketplace entry.

No decision yet. Until then, distribution is hand-delivery during pilot onboarding.
