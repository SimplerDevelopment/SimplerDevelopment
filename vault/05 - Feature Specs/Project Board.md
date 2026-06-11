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

- [ ] Self-Serve SaaS GTM Launch (Phase 0 → public) — see [[Go-To-Market — Self-Serve SaaS]] · board [[GTM Launch Board]]
- [ ] Visual-Editor / Block-Authoring Agent (first hub-and-spoke specialist; prerequisites now met — intent router shadow v1 + real tracing both shipped) — see [[Visual-Editor Agent]]

## In Progress

- [ ] Portal Intent Router — shadow v1 shipped (Haiku classifier now routes domains + model in one call); collecting `portal.route` accuracy data, then flip `ROUTER_MODE` to `'active'` — see [[Portal Intent Router]]

## Validating

- [ ] Per-Domain SaaS Billing & BYOK — see [[Per-Domain SaaS Billing & BYOK]]
- [ ] Self-Serve Signup Funnel & Module Onboarding — see [[Self-Serve Signup Funnel & Module Onboarding]]


## Shipped

**Complete**
- [x] Repo cleanup + docs consolidation + README rewrite (2026-06-09)
- [x] In-repo Obsidian vault: scaffold + 50-note knowledge sweep (2026-06-10)


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
