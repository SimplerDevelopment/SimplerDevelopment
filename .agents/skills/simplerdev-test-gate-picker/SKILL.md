---
name: simplerdev-test-gate-picker
description: Choose the right SimplerDevelopment validation commands for a code change based on touched files, risk domains, and release target. Use after edits, before declaring work done, during reviews, before commits or pushes, or when the user asks "what tests should I run", "pick gates", "validate this", "CI locally", "is this enough testing", or when changes touch tenancy, data access, MCP tools, blocks, visual editor, auth, billing, migrations, AI/Brain, workers, or public routes.
---

# SimplerDev Test Gate Picker

Pick the smallest defensible validation set for the change. Do not recommend the full suite reflexively; match gates to risk.

## Workflow

1. Inspect `git status -sb`, `git diff --stat`, and changed paths.
2. Map paths and behavior to gates using `references/gate-map.md`.
3. Always include a typecheck after non-trivial TypeScript edits unless the user explicitly asks for a lighter pass.
4. Escalate to tenancy/critical E2E gates when touched behavior could leak tenant data or break core user journeys.
5. Return commands in run order with one-line rationale for each.

## Default Commands

- `bun run typecheck` after meaningful TypeScript changes.
- `scripts/test.sh --layer=unit --no-coverage` for pure logic and component units.
- `scripts/test.sh --layer=integration --no-coverage` when DB/API/server behavior changes.
- `bun test:tenancy` after any data-access, tenant resolution, auth scope, or MCP data exposure change.
- `bun test:critical` before declaring significant product work done.
- `bun run lint` when editing lint-sensitive UI, config, scripts, or imports.

## Output Format

```markdown
Recommended gates
1. `command` — why this is needed.
2. `command` — why this is needed.

Optional if time permits
- `command` — what extra risk it covers.

Not needed
- `command` — why it is not relevant for this diff.
```

## Reference

Use `references/gate-map.md` for path-to-gate mapping and escalation rules.
