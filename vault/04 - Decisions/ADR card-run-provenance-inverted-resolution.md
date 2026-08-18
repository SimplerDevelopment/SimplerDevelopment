---
type: adr
domain: projects-kanban
status: accepted
date: 2026-08-03
sources:
  - lib/mcp/tools/artifact-vocab.ts — resolveArtifactTitle, agent_flow_run branch
  - app/api/portal/cards/[id]/artifacts/route.ts — REST copy of the same branch
  - lib/db/schema/pm.ts — kanbanCardArtifacts, kanbanCardTimeLogs
  - lib/db/schema/agentFlows.ts — agentFlowRuns
---

# ADR: Card ↔ workflow-run provenance, and the inverted resolution branch

## Status

Accepted 2026-08-03. Shipped in `afa93aa6`.

## Context

Cards and agent runs both lived in this database and nothing joined them.
`agent_flow_runs` carries `model`, token counts and duration per node;
`kanban_card_time_logs` carries human minutes. Neither half could answer *"what did
this card cost to deliver"*, because there was no edge between them.

This blocked the source report's **verified automation yield** —
`accepted outcome units / (human review and remediation time + model cost)` — despite
both inputs already being stored.

## Decision

Add `agent_flow_run` as a new arm of the existing polymorphic `kanban_card_artifacts`
link. `artifact_type` is a plain `varchar(50)`, so **no migration** was required.

**Card only.** A run already stores `projectId`, so the project↔run edge exists natively
and needs no link row. The card edge was the missing one.

Linked by the runner at run **start** (see `/sd-run-flow`), not at close — a card that
shows its run only after the run finishes cannot tell you what is happening now.

## The inverted branch (the load-bearing detail)

`agent_flow_run` resolves **inverted** relative to its neighbours in the same function.

| Type | Ownership | Title |
|---|---|---|
| `post` | indirect (`websiteId → clientWebsites.clientId`) | direct |
| `path_chart` | indirect (`projectId → projects.clientId`) | direct |
| **`agent_flow_run`** | **direct (`agent_flow_runs.client_id`)** | **indirect (`agent_flows.name`)** |

The join is therefore for the **label**, not for the tenancy filter. Written the natural
way — mirroring its neighbours by filtering tenancy on the joined `agent_flows` row —
the call returns `found: true` with another tenant's flow name, which is then
snapshotted into the linking card's `display_title`. It throws nothing and renders
plausibly.

Both predicates sit on `agent_flow_runs` for exactly that reason, and both call sites
assert the negative case rather than only the happy path.

## Test-coverage consequence

`resolveArtifactTitle` had only a unit test that mocks `@/lib/db`. Per `tests/CLAUDE.md`
a mocked DB returns what the mock was told to return, so that test **cannot** catch a
missing tenant filter by construction.

The REST route at `app/api/portal/cards/[id]/artifacts/route.ts` carries its own copy of
the resolution logic, so the integration test sitting next to it proves nothing about
the shared module the MCP path uses. A separate real-DB integration test was added for
`resolveArtifactTitle` itself
(`tests/integration/api/cards/artifact-vocab.test.ts`).

**That duplication is pre-existing and remains.** It was followed rather than refactored,
to keep the change small — but it means any future change to artifact resolution must be
made in two places. Worth collapsing when something else touches that path.

## Other consequences

- Runs are excluded from the human "Link Artifact" picker via
  `AGENT_LINKED_ARTIFACT_TYPES`. Nobody can know by hand which run produced a card; the
  runner links it. Listing it would render a filter button that always reads "No
  available artifacts".
- The display title embeds the run id (`"<flow name> — run #<id>"`): a rework loop links
  several runs of the same flow to one card, and three rows reading "Design review"
  would be indistinguishable.
- `/portal/flow-runs/<id>` resolves the project and redirects, because a link row holds
  only `(type, id)` and the Executions tab lives under the project. Unknown ids and
  other tenants' runs both land on the projects list, so the redirect cannot answer
  "does run 41 exist, and whose is it".
- Any yield metric built on this must aggregate at **team** level. Both
  `kanban_card_time_logs` and `agent_action_logs` are per-user, and the source report is
  explicit that prompt counts and acceptance rates must not become performance scores.
