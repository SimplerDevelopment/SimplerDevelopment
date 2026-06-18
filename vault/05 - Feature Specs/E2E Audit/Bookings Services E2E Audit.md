---
kanban-plugin: board
type: spec
domain: bookings-services
status: active
date: 2026-06-17
sources:
  - tests/e2e/admin-booking.spec.ts
---

## To Test

- [ ] External-calendar free/busy check (double-book prevention)
- [ ] Reschedule flow
- [ ] SMS reminder trigger
- [ ] Gift certificate purchase + redemption
- [ ] Waiver sign-on-book flow

## Testing


## Blocked


## Passed

- [ ] Booking service renders for entitled tenant ✓ (Phase 2 MCP pass — screenshot audit-05-booking.png)
- [ ] Public booking form /book/[slug] renders end-to-end ✓ (Phase 2 — screenshot audit-08-public-booking.png)
- [ ] Gift certs, waivers, add-ons, approval-gated publish ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No external-calendar free/busy check — double-book risk — see [[Competitive Gap Analysis 2026-06]]
- [ ] No reschedule flow — see [[Competitive Gap Analysis 2026-06]]
- [ ] No SMS reminders — see [[Competitive Gap Analysis 2026-06]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
