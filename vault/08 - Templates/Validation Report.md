---
type: validation
domain:
status: active
date: {{date:YYYY-MM-DD}}
sources: []
---

# Validation: {{title}}

## Scope
What change/feature was validated; commit range or PR.

## Gates run

| Gate | Command | Result |
|---|---|---|
| Typecheck | `bun run typecheck` | |
| Unit | `bun test` | |
| Tenancy | `bun test:tenancy` | |
| Critical e2e | `bun test:critical` | |

## Findings
Failures, flakes, regressions — with file/line and root cause if known.

## Follow-ups
- [ ] 
