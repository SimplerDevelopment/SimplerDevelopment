---
kanban-plugin: board
type: index
date: 2026-06-10
---

## Backlog

- [ ] Unify AI tool surfaces (MCP 431 / Brain 12 / portal ~15 → one source of truth) — see [[Unify AI Tool Surfaces]]
- [ ] Wire `enqueueWorkflowRunsForTrigger` to live CRM events — see [[Automations & Workflows]]
- [ ] Implement `send_email` / `add_to_list` action kinds in the visual workflow runtime — see [[Automations & Workflows]]
- [ ] Scheduled-campaign dispatcher (campaigns can be scheduled but nothing sends them) — see [[Email & Campaigns]]
- [ ] Sync `emailSegments.subscriberCount` after subscriber mutations — see [[Email & Campaigns]]
- [ ] Storefront checkout golden-path E2E — see [[Storefront & Commerce]]
- [ ] Encrypt user-level Google/Microsoft refresh tokens at rest — see [[Integrations - Google, Microsoft & OAuth]]
- [ ] Microsoft token revocation is a local-only no-op — revoke upstream — see [[Integrations - Google, Microsoft & OAuth]]
- [ ] Wire `chat_widgets.brainEnabled` to actual Brain retrieval — see [[Chat, Realtime & Voice]]
- [ ] Themed contract PDF renderer (TODO in `lib/esign/contract-pdf.ts`) — see [[E-Sign & Approvals]]

## Planned

- [ ] Visual-Editor / Block-Authoring Agent (first hub-and-spoke specialist; blocked on intent router + real tracing) — see [[Visual-Editor Agent]]

## In Progress


## Validating


## Shipped

**Complete**
- [x] Repo cleanup + docs consolidation + README rewrite (2026-06-09)
- [x] In-repo Obsidian vault: scaffold + 50-note knowledge sweep (2026-06-10)


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
