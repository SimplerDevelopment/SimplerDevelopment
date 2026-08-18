---
type: spec
domain: bookings
status: proposed
date: 2026-06-22
sources:
  - lib/db/schema/tools.ts
  - lib/booking/availability.ts
  - lib/booking/timezone.ts
  - lib/booking/capacity.ts
  - lib/booking/assign.ts
  - lib/booking/host-notification.ts
  - lib/email/booking-emails.ts
  - app/api/public/booking/[slug]/slots/route.ts
  - app/api/public/booking/[slug]/book/route.ts
  - app/api/public/booking/cancel/route.ts
  - app/api/cron/booking-reminders/route.ts
  - lib/google-calendar.ts
  - lib/google/scopes.ts
  - lib/automation/event-bus.ts
---

# Feature: Bookings Scheduling Depth

## Overview

Three interconnected improvements: a first-class reschedule flow (today guests must cancel-and-rebook), Google Calendar free/busy pre-check before confirming a slot, and an SMS reminder channel via Twilio alongside the existing email reminder cron.

## Domain context

Read first: [[Bookings Services E2E Audit]]. Booking tables in `lib/db/schema/tools.ts`: `booking_pages`, `bookings`, `booking_page_members`, `google_calendar_tokens`. Slot logic: `lib/booking/availability.ts` + `capacity.ts` + `timezone.ts`. The cron `app/api/cron/booking-reminders/route.ts` runs hourly, queries `reminderSentAt IS NULL` with `startTime` in `[now+23h, now+25h)`, sends via Resend, stamps `reminderSentAt`. The automation bus (`lib/automation/event-bus.ts`) **declares `booking.rescheduled` but nothing emits it** (dead event). Cancel endpoint `app/api/public/booking/cancel/route.ts` deletes the GCal event + emails but has no reschedule path. `google_calendar_tokens` holds per-client OAuth tokens (separate from the Workspace brain tokens in `lib/google/`). **No Twilio/SMS integration exists anywhere.**

## Problem

1. No reschedule path — guests cancel and rebook; `cancelToken` is single-purpose; no history; the declared `booking.rescheduled` event is dead.
2. Slot availability only considers internal bookings; it ignores the host's external Google Calendar events → double-booking.
3. Reminders are email-only, single-fire at ~24h. No SMS, no 1-hour nudge.

## Goal

- Reschedule: guest link → pick a new slot → re-validate → move the booking atomically → update GCal → emit `booking.rescheduled` → notify both parties.
- Free/busy: before confirming a booking (and a reschedule), call Google Calendar `freebusy` with the host's tokens to drop externally-busy windows.
- SMS: add opt-in to `bookings`; wire Twilio; extend the reminder cron to 24h + 1h SMS sends.

## Design

### Schema (`lib/db/schema/tools.ts` → `bun run db:generate`)

`bookings`: + `rescheduleToken` varchar(64) unique, `previousStartTime`/`previousEndTime` timestamp, `rescheduleCount` int default 0, `smsOptIn` bool default false, `smsReminderSent24hAt`/`smsReminderSent1hAt` timestamp.
`booking_pages`: + `smsRemindersEnabled`, `freeBusyCheckEnabled`, `rescheduleEnabled` (default true), `rescheduleWindowHours` int default 24.

### Reschedule — `app/api/public/booking/reschedule/route.ts`

- `GET ?token=` — booking by `rescheduleToken` WHERE confirmed, `startTime > now()+rescheduleWindowHours`; return booking + page config.
- `POST {token,newStartTime,newEndTime,timezone,staffId?}` — atomic: re-run availability + capacity; if `freeBusyCheckEnabled` call `checkFreeBusy`; single UPDATE setting previous*/start/end + `rescheduleCount+1`; if `googleEventId` call `updateCalendarEvent` (new helper in `lib/google-calendar.ts`); emit `booking.rescheduled`; `sendRescheduleEmail` to guest+host.
- Add a Reschedule link beside Cancel in confirmation/reminder templates.

### Free/busy — `lib/booking/free-busy.ts`

`checkFreeBusy(clientId, start, end)` → fetch `google_calendar_tokens` (no token ⇒ `{busy:false}`), refresh if near-expiry, `POST .../freeBusy`, busy if any returned period overlaps. Integrate at: slots route (batch one freebusy call/day, filter busy slots), book route (final guard before INSERT), reschedule route. Requires `calendar.readonly` scope on the booking GCal grant.

### SMS — `lib/sms/twilio.ts` + `lib/sms/booking-sms.ts`

`sendSms(to,body)` (env: `TWILIO_ACCOUNT_SID`/`AUTH_TOKEN`/`FROM_NUMBER`). Send functions for confirmation/reschedule/cancel/reminder. Book route sets `smsOptIn=true` when guest gives a phone on an SMS-enabled page. Cron gets two added passes (24h: `smsReminderSent24hAt IS NULL`, startTime [now+23h,now+25h]; 1h: `smsReminderSent1hAt IS NULL`, [now+50m,now+70m]), each stamps its column. Email pass unchanged.

## Phasing

- **Phase 1 (local)** — schema + reschedule route + `updateCalendarEvent` + `sendRescheduleEmail` + emit `booking.rescheduled` + template link + portal toggle.
- **Phase 2 (external: Google Calendar freeBusy)** — `free-busy.ts` + slot/book/reschedule guards + toggle + verify OAuth scope.
- **Phase 3 (external: Twilio)** — twilio lib + booking-sms + opt-in capture + cron passes + toggle.

## Key decisions (ADR-style)

- **Distinct `rescheduleToken`** (not reuse `cancelToken`) — stale cancel links must not trigger reschedule.
- **Free/busy at BOTH slot-gen and confirmation** — filter for UX, re-guard to close the TOCTOU window; batch per-day to avoid N+1.
- **Implicit SMS opt-in** when phone given on an SMS-enabled page (revisit for TCPA double-opt-in).
- **Single-level history** (`previousStartTime`) for MVP; a `booking_reschedule_history` table if multi-reschedule audit needed.

## Open questions

1. Enforce reschedule window on guest only, or also host portal reschedules?
2. Free/busy across all round-robin `assignedMembers`, or only the booking's `assignedTo`?
3. Twilio number type (long-code/toll-free/short-code) — TCPA + throughput.
4. Include an add-to-calendar deep link in SMS confirmation (no attachments in SMS)?
5. Is a guest-facing reschedule page needed in Phase 1, or API-first (portal-driven) first?

## Verification plan

- Unit: `free-busy.ts` (busy/free/refresh); `twilio.ts` payload shape.
- Integration: reschedule atomicity (old slot freed, new occupied, count incremented, previous* set); `bun test:tenancy` after migration (no cross-tenant `rescheduleToken` leak).
- E2E `@critical`: reschedule happy path; GCal update stub called; `booking.rescheduled` fired.
- Cron: seed SMS-opt-in booking at now+24h, run handler, assert Twilio stub called + column stamped + idempotent on re-run.
