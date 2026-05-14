# PORTAL-B QA Walkthrough Report

Date: 2026-05-14
Branch: qa/full-walkthrough-2026-05-14
Spec: tests/e2e/qa-portal-b-dashboard-inbox-tickets.spec.ts (43 tests, all pass)
Baseline run (existing specs): 26 passed, 2 failed (portal-my-tasks dedup timeout, portal-approvals lifecycle)

---

## Summary

- All 43 new PORTAL-B tests pass. Dashboard, inbox, tickets (validation + bulk + XSS), my-tasks, approvals, suggested-projects, snapshots, standup, and invoices are covered at the API layer.
- Two pre-existing test failures confirmed unrelated to this slice: `portal-approvals-mutations` lifecycle (MCP key setup flaky at 4-worker parallelism), and `portal-my-tasks` dedup test (kanban project creation timeout). Both existed before this walkthrough.
- Critical tenancy finding: GET /api/portal/tickets/[id] is intentionally staff-only (requireStaff guard). Client-facing ticket detail is SSR-only and properly scopes by clientId. No data leak exists.
- Significant pagination gap: /portal/tickets page fetches ALL tickets with no .limit() — unbounded DB query. At 100+ tickets this will cause slow page renders. The inbox API does support limit/offset but the UI component never passes them.

---

## Coverage Table

| Route | Status | Notes |
|---|---|---|
| /portal/dashboard | COVERED | API shape, auth, stats structure |
| /portal/inbox (list) | COVERED | Status filter, limit param, unauthenticated rejection, tenancy |
| /portal/inbox/[id] | COVERED (smoke) | smoke-all-routes covers page load; no dedicated message thread test |
| /portal/inbox/widgets/[id] | PARTIAL | Only smoke-all-routes page load; no widget-specific mutations |
| /portal/tickets (list) | COVERED | Validation, bulk (10 tickets), pagination gap documented |
| /portal/tickets/new | COVERED (smoke) | smoke-all-routes page load only |
| /portal/tickets/[id] | COVERED | Staff-only JSON API confirmed, reply flow, XSS storage |
| /portal/my-tasks | COVERED | Structure, openOnly filter, unauthenticated; brain-task dedup has integration tests |
| /portal/approvals | COVERED | List, count, detail, approve/reject, bulk, unauthenticated, oversized batch |
| /portal/suggested-projects | COVERED | List, missing ID, invalid ID validation |
| /portal/suggested-projects/[id] | COVERED (smoke) | smoke-all-routes page load; no detail mutations |
| /portal/suggested-projects/[id]/request | COVERED | POST validation (missing/invalid ID) |
| /portal/snapshots | COVERED | List, unauthenticated; round-trip covered in snapshots.spec.ts |
| /portal/standup | COVERED | Payload shape (success.data envelope), unauthenticated |
| /portal/invoices/[id] | COVERED | Tenancy isolation (clientId scope), checkout 404/401 |

---

## Performance (TTFB, unauth redirects — local dev server on port 3100)

| Route | TTFB | Note |
|---|---|---|
| /portal/dashboard | 769ms | Slow — parallel DB queries for stats (9 concurrent) |
| /portal/inbox | 1347ms | Slow — SSE connection setup overhead |
| /portal/standup | 289ms | Acceptable |
| /portal/snapshots | 339ms | Acceptable |
| /portal/suggested-projects | 266ms | Acceptable |
| /portal/my-tasks | 100ms | Fast |
| /portal/approvals | 80ms | Fast |
| /portal/tickets | 62ms | Fast |

All are auth redirects (302/307). Dashboard and Inbox are above 500ms even for redirects — on authenticated load with real data, these will be higher.

---

## Issues

### HIGH — Tickets list page has no pagination (unbounded DB query)

- Severity: HIGH (perf)
- Route: /portal/tickets page.tsx
- Repro: Load /portal/tickets with 50+ tickets — the DB query at line 81 has no .limit() or .offset(). The page fetches and renders all tickets in a single SSR pass.
- Fix: Add ?page=N&per_page=25 searchParam support, apply .limit(perPage).offset(page*perPage) to the Drizzle query, add pagination UI.
- Fixed: NO

### HIGH — Inbox UI has no virtualization or pagination

- Severity: HIGH (perf)
- Route: /portal/inbox/page.tsx
- Repro: The inbox page client component calls /api/portal/chat/conversations with no limit/offset params. With 100 conversations, it fetches and renders all in one request. The API supports limit/offset but the UI ignores it.
- Fix: Pass ?limit=50&offset= to the API call, add load-more or virtual scrolling.
- Fixed: NO

### MEDIUM — Client cannot self-resolve tickets (PATCH is staff-only, no client-facing status endpoint)

- Severity: MEDIUM (missing feature / UX gap)
- Route: /api/portal/tickets/[id] PATCH
- Repro: PATCH /api/portal/tickets/[id] with status:resolved returns 401 for client users. The UI shows a TicketStatusControl component but there is no client-accessible PATCH or PUT endpoint. Clients cannot mark their own tickets resolved via the API.
- Fix: Add a client-facing status endpoint (e.g., POST /api/portal/tickets/[id]/resolve) scoped to the client's own tickets.
- Fixed: NO

### MEDIUM — /portal/standup page not covered by smoke-all-routes

- Severity: MEDIUM (coverage gap)
- Route: /portal/standup
- Repro: The smoke-all-routes.spec.ts does not include /portal/standup in its route list. A JS error on the standup page would go undetected.
- Fix: Add { route: '/portal/standup' } to the smoke routes array in portal-smoke-all-routes.spec.ts.
- Fixed: NO

### LOW — XSS payload stored as raw HTML in ticket message body (no server-side sanitization)

- Severity: LOW (defense-in-depth)
- Route: POST /api/portal/tickets, POST /api/portal/tickets/[id]/messages
- Repro: <script>alert(1)</script> is stored verbatim. React JSX escaping prevents execution in the portal page ({msg.body} rendered as text). However, if any future code path renders this as innerHTML or dangerouslySetInnerHTML without calling sanitizeHtml(), a stored XSS would fire.
- Fix: Call sanitizeHtml() (already exists in lib/security/sanitize-html.ts) before storing message bodies, or document the invariant that message body is always rendered via React JSX only.
- Fixed: NO

### LOW — Two pre-existing test failures in adjacent specs (not from this work)

- Severity: LOW (infrastructure)
- portal-approvals-mutations.spec.ts APPR-full-lifecycle: times out at 180s under 4-worker parallelism (MCP client setup race).
- portal-my-tasks.spec.ts brain-task dedup: kanban project creation times out at 60s when run in parallel.
- Fix: Run portal-approvals-mutations serially (test.describe.configure({mode:'serial'})); increase kanban project creation timeout or retry limit.
- Fixed: NO

---

## Recommendations

1. Add pagination (25/50/100 rows) to /portal/tickets page — currently unbounded; will cause unacceptable TTFB at scale.
2. Add load-more or virtual scrolling to /portal/inbox — the API has limit/offset support but the page ignores it.
3. Add a client-facing ticket status endpoint (resolve/reopen) — clients have no API path to self-serve ticket state changes.
4. Add /portal/standup to the smoke-all-routes spec to catch future regressions.
5. Add sanitizeHtml() call on incoming ticket/message body at the API layer as defense-in-depth (lib/security/sanitize-html.ts is already available).
6. Consider marking portal-approvals-mutations.spec.ts as serial to eliminate the 180s timeout flake.
