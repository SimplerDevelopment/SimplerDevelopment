---
type: adr
domain: build
status: accepted
date: 2026-06-09
sources:
  - CLAUDE.md (root) — "Stack" section: "Lock file is bun.lock — always use bun, never npm"
  - commit c1d41ba35... (fix(build): delete stale package-lock.json blocking deploy #57)
  - CLAUDE.md (root) — "Don't-touch zones": "bun.lock — package changes go through bun add / bun remove"
---

# ADR: Bun is the sole package manager — npm is banned

## Status

Accepted — backfilled 2026-06-09 from root `CLAUDE.md` stack declaration and commit
`c1d41ba35` (`fix(build): delete stale package-lock.json blocking deploy #57`).

## Context

The project uses Bun as its JavaScript runtime and package manager. Using `npm` in the
same repository creates a `package-lock.json` that conflicts with `bun.lock`, produces
different dependency resolution results, and can cause deployment failures. Commit
`c1d41ba35` recorded an actual incident: a stale `package-lock.json` blocking the
Vercel deploy.

## Decision

- **All package operations use `bun`:** `bun add`, `bun remove`, `bun install`.
- `npm` commands are banned. Do not run `npm install`, `npm ci`, or any `npm` subcommand
  in this repository.
- `bun.lock` is in the don't-touch zone: never hand-edit it. It is modified only by
  `bun add` / `bun remove` / `bun install`.
- If a `package-lock.json` appears in the working tree, delete it — it is a sign that
  `npm` was run accidentally.

The `bun dev`, `bun run lint`, `bun run db:generate`, and all script aliases in
`package.json` use the Bun runtime; scripts written for Node.js may require adjustment.

## Consequences

- All developers and agents must have Bun installed.
- CI scripts and Dockerfiles (if any) must install Bun, not Node+npm.
- The lock file format is Bun's proprietary format; it is not interchangeable with
  `package-lock.json` or `yarn.lock`.

## Alternatives considered

Rationale not recorded beyond the incident commit message; inferred: Bun was chosen for
runtime speed and the unified runtime+package-manager experience, and consistency was
enforced after the package-lock.json deployment incident.

## Related

- [[Deployment Topology]]
