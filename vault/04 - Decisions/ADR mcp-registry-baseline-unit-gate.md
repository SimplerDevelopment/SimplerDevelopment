---
type: adr
domain: mcp
status: accepted
date: 2026-06-09
sources:
  - lib/mcp/CLAUDE.md — "Registry baseline test" section
  - commit bfbc83f4 (test(mcp): move registry baseline to DB-free unit gate)
  - .planning/handoffs/2026-06-04-agent-harness-hardening.md — commits 54c765422 and bfbc83f4
---

# ADR: MCP tool registry baseline test lives in the unit gate, not the integration gate

## Status

Accepted — backfilled 2026-06-09 from commit `bfbc83f4` and
`.planning/handoffs/2026-06-04-agent-harness-hardening.md`.

## Context

The MCP server at `lib/mcp/server.ts` registers ~431 tools. A "registry baseline" test
asserts the exact set of registered tool names so that accidental additions, removals,
or renames are caught immediately. When this test lived in the integration layer
(`tests/integration/`) it required a live database connection to run — meaning it was
not part of the default `bun test` / pre-push gate. In practice the integration suite
was not run by default, and tool drift accumulated silently: 131 real-but-unlisted
tools were discovered during the June 2026 harness-hardening audit.

The registry baseline only reads tool **names** — handlers never execute — so it does
not need a real database at all.

## Decision

Move the registry baseline to `tests/unit/mcp-tool-registry-baseline.test.ts` and mock
`@/lib/db` via `vi.mock('@/lib/db')` to dodge the import-time `DATABASE_URL` throw.

This means the test:

1. Runs in the **default `bun test` gate** — no DB, no environment setup.
2. Runs in the **pre-push gate** on every push to `origin`.
3. Hard-fails if any tool is added, removed, or renamed without updating
   `EXPECTED_TOOLS` in the test file.

After a deliberate tool change, the developer must run
`bun test:unit -- tests/unit/mcp-tool-registry-baseline` and reconcile
`EXPECTED_TOOLS`. New tools must also pass the scope-filter sub-tests (every tool
gated by `hasScope`).

## Consequences

- Tool drift now fails on every commit rather than silently accumulating until an
  integration suite happens to run.
- The test has no external dependencies — it builds the MCP server in-process and
  asserts the name list; it verified green with no `DATABASE_URL` set in ~11 seconds.
- The integration-layer copy was removed to avoid two sources of truth.

## Alternatives considered

The handoff document records the prior state: the integration copy existed but was "not
in the default gate, so it drifts silently." The direct trigger for the move was
discovering 131 unlocked tools during the audit. The DB-mock approach was verified
before committing — the mock dodges the import-time throw without affecting test
correctness because tool handlers never run in this test.

## Related

- [[Agent Harness]]
