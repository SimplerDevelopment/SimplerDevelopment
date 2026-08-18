---
type: index
date: 2026-06-09
---

# SimplerDevelopment 2026 Vault

Project knowledge base for the SimplerDevelopment multi-tenant SaaS platform (admin + client portal + per-tenant sites + CRM + Company Brain + automations + billing). This vault is the **canonical home for planning, architecture, and validation knowledge**. Code-facing operating rules live in `CLAUDE.md`; human onboarding lives in `README.md`; this vault holds everything that makes features easier to plan, develop, and validate.

## Sections

- [[01 - Daily Logs/00 - Daily Logs Index|01 - Daily Logs]] — optional session logs (claude-mem auto-captures episodic history; log here only when a session produces durable insight)
- [[02 - Architecture/00 - Architecture Index|02 - Architecture]] — system design: route trees, tenancy, auth, data model, API envelope, MCP server, deployment, agent harness
- [[03 - Domains/00 - Domains Index|03 - Domains]] — **the centerpiece**: one map per feature domain (purpose, key files, schema, routes, MCP tools, tests, gotchas). Read the relevant map before planning any feature.
- [[04 - Decisions/00 - Decisions Index|04 - Decisions]] — Architecture Decision Records. Write one whenever a non-obvious choice is made.
- [[05 - Feature Specs/00 - Feature Specs Index|05 - Feature Specs]] — new planning home. Specs start here, link to their Domain Map, and graduate to `status: shipped`.
- [[06 - Validation/00 - Validation Index|06 - Validation]] — playbooks for proving work correct: gate-picking, e2e patterns, tenancy regression, coverage, QA flows
- [[07 - Operations/00 - Operations Index|07 - Operations]] — deploy, environment, cron jobs, migration runbooks
- [[08 - Templates/00 - Templates Index|08 - Templates]] — Templater templates; every note type has one
- [[09 - Archive/00 - Archive Index|09 - Archive]] — curated links into the frozen `.planning/` directory (historical roadmaps, milestones, handoffs, audits)

## Contract with other knowledge systems

| System | Role | Never duplicate here |
|---|---|---|
| `vault/` (this) | Curated, durable knowledge: domain maps, ADRs, specs, playbooks | — |
| `.planning/` | **Frozen archive** (pre-vault planning). New planning happens in [[05 - Feature Specs/00 - Feature Specs Index\|Feature Specs]] | Don't add new files there |
| `docs/` | Human-facing how-to reference (guides, API docs) | Step-by-step tutorials |
| `CLAUDE.md` (root + nested) | Agent operating rules and invariants | Rules/invariants — link to them instead |
| claude-mem | Automatic episodic memory of sessions | Session play-by-play |
| `graphify-out/` | Generated code-structure graph | Code structure dumps |

## Conventions

- **Frontmatter** (all notes): `type` (domain-map | adr | spec | playbook | runbook | architecture | log | index), `domain` (slug), `status` (active | draft | proposed | accepted | shipped | superseded), `date`, `sources` (list of repo paths the note derives from).
- **Repo paths in `code spans`** — `scripts/check-doc-drift.ts` scans Architecture and Domain notes; a dead path fails the pre-commit gate. Update paths when code moves.
- **Wikilinks** between related notes; every domain map links its ADRs and specs.
- **Completion ritual**: shipping a feature = update the touched Domain Map + write an ADR if a decision was made. Commit vault changes as `docs(vault): ...`.

## Recent notes

```dataview
TABLE type, status, date
FROM ""
WHERE type != null AND type != "index"
SORT date DESC
LIMIT 15
```
