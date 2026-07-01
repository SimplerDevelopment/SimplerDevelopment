# Gate Map

Use this map to choose the smallest defensible validation set.

## Always Consider

- TypeScript changed: `bun run typecheck`
- Imports/config/scripts changed: `bun run lint`
- Shared logic changed: `scripts/test.sh --layer=unit --no-coverage`
- Significant product behavior changed: `bun test:critical`

## Path Rules

| Touched area | Gates |
|---|---|
| `lib/db/**`, `app/api/**`, server actions, query helpers | `bun run typecheck`, integration tests, `bun test:tenancy` when tenant data is involved |
| `lib/mcp/**`, `app/api/mcp/**` | `bun run typecheck`, MCP-specific unit/integration tests if present, `bun test:tenancy` for data exposure |
| `lib/ai/**`, Brain/RAG/embeddings | `bun run typecheck`, unit tests, domain coverage/eval command if relevant |
| `components/portal/**`, `app/portal/**` | `bun run typecheck`, targeted unit/component tests, E2E for workflows |
| `components/blocks/**`, `lib/blocks/**`, `app/sites/**` | `bun run typecheck`, block/render tests, critical E2E for public rendering |
| `tests/**` only | Run the changed test or nearest layer; typecheck if helpers/types changed |
| `package.json`, `bun.lock` | install/check lock consistency, `bun run typecheck`, targeted tests, release-manager dependency checklist |
| `drizzle/**`, `lib/db/schema/**` | use `simplerdev-db-migration`; run migration generation/review and data-access tests |
| docs only | no code tests unless docs drive generated behavior; run link/drift checks if available |

## Escalation Rules

- Any tenant identity, `clientId`, `siteId`, scoped list/read/update/delete, or MCP data response change requires tenancy consideration.
- Any auth, billing, approval, API key, OAuth, upload, custom code, or webhook change requires security review.
- Any change headed to `staging` or `main` should go through release-manager and account for hooks/Fallow.

## Report Template

```markdown
Recommended gates
1. `bun run typecheck` — TypeScript changed in ...
2. `bun test:tenancy` — query path can expose tenant-owned data.

Optional
- `bun test:critical` — covers full portal/public golden path before release.
```
