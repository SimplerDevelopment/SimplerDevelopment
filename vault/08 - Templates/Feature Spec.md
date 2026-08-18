---
type: spec
domain:
status: draft
date: {{date:YYYY-MM-DD}}
sources: []
---

# Feature: {{title}}

## Overview
One-paragraph summary. Which audience: admin / portal / public sites?

## Domain context
Read first: [[<Domain Map>]]. Invariants that constrain this feature.

## User stories
- As a [role], I want [capability] so that [benefit]

## Requirements
### Must have
-
### Nice to have
-

## Technical design
### Database changes
New/changed tables in `lib/db/schema/` (remember `bun run db:generate`; never hand-edit `drizzle/*.sql`).
### API changes
Routes + envelope. Tenancy: how is `clientId`/`siteId` resolved?
### Portal / Admin UI
### Public site / blocks
Blocks are universal — never client-specific.
### MCP exposure
Does this need an MCP tool (`simplerdev-mcp-tool`)?

## Scaffolds to use
`simplerdev-feature-scaffold` / `simplerdev-block-type` / `simplerdev-ui-scaffold` — which, and why not, if not.

## Validation plan
Per [[06 - Validation/Gate Picking|Gate Picking]]: unit / integration / e2e coverage; `bun test:tenancy` if data-access changes; `bun test:critical` before done.

## Open questions
-
