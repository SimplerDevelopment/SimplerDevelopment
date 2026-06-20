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

- [ ] Branching journey / drip sequence builder — needs spec
- [ ] Deliverability testing (inbox preview, spam score) — needs spec
- [ ] List-growth forms embedded on site — needs spec
- [ ] Scheduled campaign dispatch (cron wiring) — needs spec
- [ ] Approval-vs-send governance gate — needs spec
- [ ] A/B subject test: PATCH campaign with abEnabled=true + abSubjectB sets status correctly — needs spec
- [ ] A/B winner promotion: GET /campaigns/[id]/promote-winner returns counts + projectedWinner; POST ?force=1 promotes winner and flips status to sent — needs spec
- [ ] Schedule campaign: PATCH scheduledAt to future timestamp sets status=scheduled; clearing scheduledAt reverts to draft — needs spec
- [ ] Public unsubscribe: GET /api/email/unsubscribe?token=<valid> sets subscriber status=unsubscribed and redirects; POST same token returns 200 (RFC 8058 one-click) — needs spec
- [ ] Public unsubscribe with invalid token returns 404 — needs spec
- [ ] Cross-tenant campaign access: GET/PATCH on another client's campaign [id] returns 404 — needs spec
- [ ] Resend webhook: POST /api/email/webhooks with email.opened event increments totalOpened on campaign — needs spec
- [ ] Subscriber tag assignment: assign and remove a tag from a subscriber via POST/DELETE /api/portal/email/tags — needs spec

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
- [ ] Campaign fork (parentCampaignId in schema) has no portal API endpoint — no way to duplicate a campaign via API


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
