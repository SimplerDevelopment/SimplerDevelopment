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


## Testing


## Blocked


## Passed

- [ ] Booking service renders for entitled tenant ✓ (Phase 2 MCP pass — screenshot audit-05-booking.png)
- [ ] Public booking form /book/[slug] renders end-to-end ✓ (Phase 2 — screenshot audit-08-public-booking.png)
- [ ] Gift certs, waivers, add-ons, approval-gated publish ✓
- [ ] ✓ verified 2026-06-20: gift-cert issue→redeem→double-redeem lifecycle verified
- [ ] ✓ verified 2026-06-20 — Gift certificate purchase + redemption (portal-gift-certs-mutations.spec.ts)
- [ ] ✓ verified 2026-06-20 — Booking analytics API returns revenue/stats/byDay/byPage for date range (bookings-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Booking calendar view returns enriched bookings list scoped to tenant pages (bookings-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Check-in today list returns today's bookings with check-in status summary (bookings-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Check-in by code marks booking checked-in; rejects already-checked-in (409) (bookings-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Public cancel-by-token cancels booking; double-cancel returns 409 (bookings-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Discount code validation at booking — valid code applies, expired/exhausted code rejected (bookings-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Add-ons from store products — POST from-products links product variants as add-ons (bookings-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Individual booking status update (portal PUT /bookings/[bookingId]) — cancel, reassign (bookings-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Public available-slots endpoint returns slot windows respecting availability config (bookings-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Waiver sign-on-book flow (bookings-coverage.spec.ts)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No external-calendar free/busy check — double-book risk — see [[Competitive Gap Analysis 2026-06]]
- [ ] No reschedule flow — see [[Competitive Gap Analysis 2026-06]]
- [ ] No SMS reminders — see [[Competitive Gap Analysis 2026-06]]
- [ ] No waiver PDF generation test — /waivers/[waiverId]/pdf route untested
- [ ] No public quote view + payment flow test — /api/public/booking/quote/[slug] and /pay untested
- [x] RESOLVED: booking page POST silently dropped price/enableGiftCertificates (+25 fields) on create — now forwarded — `app/api/portal/tools/booking/route.ts`


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
