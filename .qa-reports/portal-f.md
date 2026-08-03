# PORTAL-F: Email Marketing QA Report
**Date:** 2026-05-14  **Branch:** qa/full-walkthrough-2026-05-14  **Agent:** PORTAL-F

---

## Summary

The Email Marketing slice has a solid integration-test foundation (105/105 pass) and clean TypeScript. The send path correctly injects per-recipient unsubscribe tokens and RFC 8058 one-click unsubscribe headers. A/B subject testing is well-architected. However, there are three issues serious enough to block a production release: missing service-gate on mutation routes, XSS due to unsanitized `htmlContent`, and no auto-suppression on complaint/bounce webhooks.

---

## Coverage

| Route | Method(s) | Status |
|---|---|---|
| `/portal/email` (dashboard) | — | COVERED — UI renders from campaigns+lists API; smoke test passes |
| `/portal/email/campaigns` | GET list | COVERED — integration + e2e |
| `/portal/email/campaigns/new` | POST create | COVERED — integration + e2e |
| `/portal/email/campaigns/[id]` | GET/PATCH/DELETE | COVERED — integration (19 tests) |
| `/portal/email/campaigns/[id]/send` | POST | COVERED — integration (6 tests, Resend mocked) |
| `/portal/email/campaigns/[id]/promote-winner` | POST/GET | PARTIAL — code path exists, no automated test for promote-winner flow |
| `/portal/email/lists` | GET/POST | COVERED — integration + e2e |
| `/portal/email/lists/[id]` | GET/PATCH/DELETE | COVERED — integration |
| `/portal/email/segments` | GET/POST/PATCH/DELETE | COVERED — integration + e2e |
| `/portal/email/templates` | GET/POST/PATCH/DELETE | COVERED — integration (7 tests) |
| `/portal/email/editor-preview` | — | GAP — page exists, no dedicated spec |
| `/portal/email/automations` | — | COVERED — redirects to `/portal/brain/automations?tab=presets` (correct) |
| `/portal/email/analytics` | GET | COVERED — integration (2 tests) |
| `/portal/email/settings` | — | GAP — page file exists, no API route or test |
| `/api/email/unsubscribe` | GET/POST | COVERED — 5 integration tests, idempotency verified |
| `/api/email/webhooks` | POST (Resend events) | PARTIAL — code reviewed; no integration test; signature verified (header check only, full Svix HMAC marked TODO) |
| Tags CRUD | GET/POST/DELETE | COVERED — 7 integration tests |

**Integration test run:** 105/105 passed (tests/integration/api/email/ + tests/integration/api/portal/email/ + email-unsubscribe).

**E2E Playwright run against port 3100:** 15/17 failed with `SyntaxError: Unexpected token '<'` when reading the CSRF endpoint. Root cause: NextAuth on port 3100 returns an HTML redirect from `/api/auth/csrf` during the fixture init sequence (Playwright context does not follow the redirect chain the same way curl does). This is an environment-level auth-fixture issue affecting all E2E suites against this server, not email-specific. The 2 that passed were the `unauthApi` (no-credential) tests.

**tsc --noEmit:** clean (0 errors) across all email route files and lib/email/.

---

## Performance

- **Analytics N+1 query:** `GET /api/portal/email/analytics` issues one `SELECT count(*)` per list (two queries per list: total + active). With 50 lists this is 100+ round-trips. Merge into a single grouped query: `SELECT list_id, count(*) total, count(*) FILTER (WHERE status='active') active FROM email_subscribers WHERE list_id = ANY($1) GROUP BY list_id`.
- **Missing indexes:** `email_subscribers` and `email_lists` have no non-PK indexes. `(list_id, status)` on `email_subscribers` is required for send-path and analytics queries at scale. `(client_id)` on `email_lists` and `email_campaigns` are also absent — all tenant-scoped queries do seq scans.
- **TTFB baseline (unauthenticated, QA DB with 0 rows):** 34ms. Will degrade linearly with list count due to N+1 above.

---

## Issues

### HIGH-1 — Missing service gate on ID-specific and send routes
**Files:** `app/api/portal/email/lists/[id]/route.ts`, `app/api/portal/email/campaigns/[id]/route.ts`, `app/api/portal/email/subscribers/route.ts`, `app/api/portal/email/campaigns/[id]/send/route.ts`, `app/api/portal/email/campaigns/[id]/promote-winner/route.ts`

None of these routes call `authorizePortal({ requireService: 'email' })`. The collection routes (lists, campaigns, segments, templates, analytics) all have the service gate; the ID-specific routes and the critical send endpoint do not. A tenant without an email subscription can call `/api/portal/email/campaigns/{id}/send` and dispatch real email as long as they know the campaign ID.

**Fix:** add `const authResult = await authorizePortal({ action: 'write', requireService: 'email' }); if (isAuthError(authResult)) return authResult.response;` at the top of each handler in those five files.

### HIGH-2 — XSS: `htmlContent` is stored and rendered without sanitization
**Files:** `app/api/portal/email/campaigns/route.ts` (POST/PATCH), `app/api/portal/email/templates/route.ts` (POST/PATCH), `app/api/portal/email/render-preview/route.ts`

`htmlContent` from the request body is stored to the DB and returned verbatim into `buildCampaignHtmlString`. `sanitizeHtml` / `sanitizeRichHtml` exist in `lib/security/sanitize-html.ts` but are not called on this path. An attacker with portal write access can store `<script>` or event-handler attributes and have them execute in any preview iframe or email client that renders HTML.

Stress test confirmed: submitting `{"subject":"<img src=x onerror=alert(1)>","htmlContent":"<script>fetch('https://evil.example')</script>"}` is accepted with 201 and the payload is returned unsanitized.

**Fix:** call `sanitizeRichHtml(htmlContent)` before DB insert in campaigns POST and PATCH, templates POST and PATCH. Apply same to `render-preview` and `preview` routes.

### HIGH-3 — Complaint webhook does not suppress subscriber
**File:** `app/api/email/webhooks/route.ts` (line 72–76)

`email.complained` events update `complained_at` on the send record but do not set `email_subscribers.status = 'unsubscribed'`. Under CAN-SPAM and most ESP terms of service, a spam complaint must suppress the address immediately. The current code will keep sending to complainers on subsequent campaigns.

`email.bounced` has the same issue: it records `bounced_at` but does not update subscriber status to `bounced`, meaning hard-bounced addresses are targeted by future sends, hurting deliverability and domain reputation.

**Fix:** in the `email.complained` and `email.bounced` cases, look up `subscriber_id` via the send record and set `email_subscribers.status = 'unsubscribed'` (complaint) or `'bounced'` (hard bounce) respectively.

### MEDIUM-1 — Schedule-in-the-past accepted without validation
**File:** `app/api/portal/email/campaigns/[id]/route.ts` (line 150–151)

PATCH accepts any `scheduledAt` datetime including past dates and sets status to `'scheduled'` with no error. A campaign scheduled 10 years ago will sit in `scheduled` state forever — no cron picks it up and no error is surfaced to the user.

**Fix:** validate `new Date(scheduledAt) > new Date()` and return 400 if in the past. Add a note that the existing cron infra (app/api/cron/) would need a scheduled-send processor to be wired up before scheduling is useful.

### MEDIUM-2 — `ab_testing` status not in UI status-color map
**File:** `app/portal/email/page.tsx` (line 26–31)

The `statusColor` map covers `draft / scheduled / sending / sent / cancelled` but not `ab_testing`, which the send route writes when A/B is enabled. Campaigns in `ab_testing` state render with the fallback `bg-gray-100 text-gray-700` and no label distinguishing them from drafts.

**Fix:** add `ab_testing: 'bg-violet-100 text-violet-700'` to the map.

### LOW-1 — Webhook signature verification is incomplete
**File:** `app/api/email/webhooks/route.ts` (line 22)

Only the presence of `svix-signature` is checked; the HMAC value is not verified. The TODO in the file acknowledges this (Wave 2 fix). Until Svix verification is added, any caller who knows the webhook URL and sets the header can fake open/click/bounce events.

### LOW-2 — Segments: DELETE returns 200 even on cross-tenant IDs (integration test confirmed)
**File:** `app/api/portal/email/segments/[id]/route.ts` (line 44–47)

The WHERE clause `AND clientId = client.id` silently no-ops if the segment belongs to another tenant, returning 200 with `success:true` for a non-existent row. This matches the test assertion `"200 cross-tenant call succeeds (route returns 200) but does NOT delete the foreign row"`. The row is not deleted (correct), but the 200 is misleading — callers cannot distinguish "deleted" from "not found". Should return 404 when no row was affected.

---

## Recommendations

1. **Deliverability indicators missing from UI.** The analytics page shows open/click/bounce/unsub counts but no bounce rate warning threshold or complaint rate indicator. Industry standard is to alert when bounce rate exceeds 2% or complaint rate exceeds 0.08%. Add a `BounceRateAlert` component and wire it to the analytics data.

2. **No suppression list visible to clients.** Clients cannot see or export their unsubscribed/bounced/complained addresses. This is a common GDPR data-subject-access requirement. Add a `/portal/email/suppression` route showing suppressed addresses with timestamps and reason.

3. **A/B testing UX.** The `EmailAbConfig.tsx` component exists and the API is wired, but there is no test for the promote-winner UI flow or the GET `/promote-winner` status preview endpoint. Add an E2E spec covering: enable A/B on campaign, send, poll status endpoint, call promote-winner, verify status flips to `sent`.

4. **Unsubscribe-link enforcement.** `buildCampaignHtmlString` always includes an unsubscribe link in the footer — good. However there is no server-side check that `{{UNSUBSCRIBE_URL}}` is present in block-builder campaigns before send. A block-builder campaign that omits the footer block will send without an unsubscribe link. Add a validation in the send route: if `useBlockEditor` is true and `html` does not contain the unsubscribe URL pattern, reject with 400.

5. **GDPR consent capture.** There is no `consent_source`, `consent_ip`, or `consent_timestamp` column on `email_subscribers`. For GDPR-regulated clients, proof of consent at subscribe time is required. Add these optional columns to the schema and surface them in the subscriber detail view.

6. **E2E fixture auth on port 3100.** The Playwright credential fixture fails on this dev server because NextAuth redirects during CSRF acquisition produce HTML rather than JSON. Recommend testing with `webServer.reuseExistingServer: false` and a dedicated test-mode database, or switching to direct API token auth for E2E fixtures to avoid the CSRF dance.
