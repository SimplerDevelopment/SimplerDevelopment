---
kanban-plugin: board
type: index
date: 2026-06-10
---

## Backlog

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


## In Progress


## Validating

- [ ] `sd-create-short` skill — branded feature shorts (MP4) for LinkedIn + blog — built + pipeline validated locally; first real production run (incl. portal upload) pending — see [[sd-create-short]]


## Shipped

**Complete**
- [x] Repo cleanup + docs consolidation + README rewrite (2026-06-09)
- [x] In-repo Obsidian vault: scaffold + 50-note knowledge sweep (2026-06-10)
- [x] Scribble (goscribble.ai) site migration — LIVE at https://scribble.simplerdevelopment.com, all 12 pages 200 (2026-06-12) — see [[Scribble Site Migration]]
- [x] Approval page WYSIWYG preview + page-scoped token (2026-06-16) — live-site iframe in public approval flow; scoped HMAC prevents site-wide token leak — see [[ADR approval-preview-page-scoped-token]] · [[E-Sign & Approvals]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
