---
type: adr
domain: engineering
status: accepted
date: 2026-08-05
sources:
  - CLAUDE.md — "Where knowledge lives" (the policy this supersedes)
  - vault/03 - Domains/ — 24 domain maps, migrated then removed
  - vault/02 - Architecture/ — 11 notes, migrated then removed
  - docs/guides/ — migrated into the code they describe
  - scripts/check-doc-drift.ts — the drift checker this shrinks
---

# ADR: The code is the source of truth; standalone docs shrink to three kinds

## Status

Accepted 2026-08-05. Supersedes the "vault first for feature work" policy in
`CLAUDE.md` and the three-axis routing table (claude-mem / graphify / vault).

## Context

Knowledge about this system lived in four places at once: inline comments, the
Obsidian vault (203 files), `docs/` (72 files), and the nested `CLAUDE.md` files.
Only one of those is compiled, tested, and reviewed in the same pull request as
the change it describes.

Everything else drifts, silently, and the drift is invisible until someone acts
on a stale claim. This repo already carried a mitigation for that — a doc-drift
checker over 59 documents verifying that cited paths still resolve and that
god-file line counts stay within tolerance. That the checker had to exist is the
argument: a documentation surface large enough to need automated policing is
larger than the value it returns.

Concrete instance from the same day this was written: `docs/api/commerce.md` and
`public/openapi.yaml` both advertised a `products.isDesignable` field for hours
after migration 9019 dropped the column. The published schema promised a field
the API no longer returned, and nothing failed — because prose is not executable.

## Decision

**Code and its inline comments are the source of truth.** A fact about how the
system behaves belongs in the file that implements the behaviour, close enough
that changing one forces you to look at the other.

Exactly three kinds of standalone documentation survive:

1. **ADRs** — decisions and their reasoning. Not derivable from code: the code
   shows what was chosen, never what was rejected or why.
2. **Daily logs** — episodic history. `claude-mem` captures it automatically on
   commit and session end; a short hand-written log distils what actually
   mattered for a human reader. Both are kept.
3. **A glossary** — domain vocabulary. Shared terms need one definition, and no
   single source file is the natural home for one.

Excluded from this policy, and kept:

- **Public-facing documentation published on the site**, including `docs/api/`
  and the MCP tool reference. These are a product surface, not internal notes.
- **Open-source community files** — `README`, `CONTRIBUTING`, `CODE_OF_CONDUCT`,
  `SECURITY`. This repo is public and GitHub expects them.
- **Agent tooling** — `CLAUDE.md`, its nested files, `AGENTS.md`, `.claude/`.
  These are operating instructions for how agents work in this repo, not
  documentation about the code. Deleting them measurably degrades every future
  session.

## Migration, not deletion

The 135 non-ADR vault files and the internal half of `docs/` are **migrated
before they are removed**: durable knowledge moves into a comment in the file it
describes. Domain maps in particular encode gotchas that are not derivable from
reading the code — tenancy footguns, why a join is shaped a certain way, which
gate to run after touching a subsystem. That knowledge was expensive to acquire
and deleting it outright would be throwing away the reason the notes existed.

Where a note has no code to attach to (a historical audit, a completed feature
spec, a status board), it is dropped. Git history retains it.

## Consequences

- **Comment density goes up, and that is the point.** A comment explaining *why*
  is now the only place that reasoning lives, so it must carry its weight.
- **Onboarding changes shape.** No guided tour; a new reader starts at
  `CLAUDE.md` for the map and reads code. The glossary carries vocabulary.
- **The drift checker shrinks** to the surviving surface — public API docs, ADRs,
  glossary, agent files.
- **The vault becomes ADRs + daily logs + glossary.** It stays a separate private
  repo for the same reason as before: `vault/` must never enter this repo.
- **Risk accepted:** a comment can rot too. It rots *slower*, because it sits in
  the diff of the change that invalidates it, where a reviewer sees it.
- **This ADR is itself the counter-example to its own thesis** — a standalone
  document, kept, because the reasoning above is not inferable from any diff.

## Related

- [[ADR agent-cannot-verify-its-own-work]]
- [[ADR manual-printful-variant-entry-for-now]]
