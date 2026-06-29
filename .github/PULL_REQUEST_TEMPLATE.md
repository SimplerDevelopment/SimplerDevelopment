<!-- Thanks for contributing! Keep PRs focused: one feature/fix per PR. -->

## What & why

<!-- What does this change and why? Link any related issue: "Closes #123". -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Docs
- [ ] Build / CI / tooling

## How it was tested

<!-- Commands you ran and what you observed. -->

- [ ] `bun run lint`
- [ ] `bun run typecheck`
- [ ] `bun run test:unit`
- [ ] `bun test:tenancy` — **required if this touches `lib/db/`, `app/api/`, or `lib/active-client.ts`** (multi-tenant data access)
- [ ] `bun test:critical` — golden-path e2e (if touching core user flows)

## Checklist

- [ ] Used `bun` (not npm); `bun.lock` changes only via `bun add`/`bun remove`
- [ ] Did not hand-edit `drizzle/*.sql` (ran `bun run db:generate` instead)
- [ ] No secrets, client data, or personal identifiers added
- [ ] Blocks (if any) are universal/multi-tenant, not client-specific
- [ ] Updated docs/README where behavior changed
