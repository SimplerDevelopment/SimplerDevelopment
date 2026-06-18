---
kanban-plugin: board
type: spec
domain: email-campaigns
status: active
date: 2026-06-17
sources:
  - lib/db/schema/email.ts
---

## To Test

- [ ] Branching journey / drip sequence builder
- [ ] Deliverability testing (inbox preview, spam score)
- [ ] List-growth forms embedded on site
- [ ] Scheduled campaign dispatch (cron wiring)
- [ ] Approval-vs-send governance gate

## Testing


## Blocked


## Passed

- [ ] Email campaign CRUD for entitled tenant ✓
- [ ] Shared block builder works across web + email ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] email-events specs fail: Resend neutralized in sandbox — by design, not a product bug — see [[Platform E2E Audit 2026-06-17]]
- [ ] No branching journeys / conditional send logic — see [[Competitive Gap Analysis 2026-06]]
- [ ] No deliverability testing / inbox preview — see [[Competitive Gap Analysis 2026-06]]
- [ ] Scheduled campaign dispatcher not wired (cron exists; hookup missing) — see [[Competitive Gap Analysis 2026-06]]
- [ ] subscriberCount not synced after mutations — see [[Project Board]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
