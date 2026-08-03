# PORTAL-D QA Walkthrough — CRM Slice
**Date:** 2026-05-14  
**Branch:** chore/codebase-audit-2026-05  
**Server:** http://localhost:3100  
**DB:** simplerdev_realprod_dryrun (local)  
**Test suite run:** 126 tests across 4 spec files, 4 parallel workers  
**Result: 109 passed / 17 failed**

---

## Summary

- The CRM API layer is substantially implemented and all major CRUD operations work correctly in sequential (non-parallel) use. All 15 core endpoints return 200 when called manually with a valid session.
- Two distinct API contract mismatches between the implementation and test expectations exist in the companies routes: `GET /companies` wraps its response in `{ companies, total }` but tests expect a direct array, and `GET /companies/[id]` returns a rich nested object `{ company, contacts, deals, customFields }` while tests expect a flat shape with `contactsCount`/`dealsCount` convenience fields.
- A code-level bug (fixed and committed as `898ce626d`) caused `POST /import` and `POST /import/preview` to return 500 instead of 400 when sent a non-multipart request body — `req.formData()` was called without a try/catch.
- Performance is severely elevated in a cold-start local dev environment: TTFB across all CRM endpoints ranges 4–14s, with `/analytics` consistently the slowest (~14s). These numbers reflect Next.js dev-mode compilation latency, not production behavior. Warm second-pass calls drop to ~200ms for simpler list endpoints.
- Tenancy isolation is correct: `GET /contacts/99999`, `/companies/99999`, `/deals/99999` all return 404. XSS: raw `<script>` tags ARE stored verbatim in contact firstName — no server-side sanitization; reliance is entirely on client-side rendering escaping.

---

## Coverage Table

| Route | Status | Notes |
|---|---|---|
| `GET /portal/crm` (dashboard page) | COVERED | UI renders; API 200 |
| `GET /api/portal/crm/dashboard` | COVERED | portal-crm.spec.ts |
| `GET /portal/crm/contacts` | COVERED | portal-crm.spec.ts list/search/sort |
| `GET /portal/crm/contacts/[id]` | COVERED | detail, tags, custom-field-values |
| `POST /portal/crm/contacts` | COVERED | create, validation, unauthenticated |
| `PUT /portal/crm/contacts/[id]` | COVERED | update, tag sync |
| `DELETE /portal/crm/contacts/[id]` | COVERED | |
| `GET /portal/crm/contacts/duplicates` | COVERED | email + phone exact match |
| `POST /portal/crm/contacts/merge` | PARTIAL | merge succeeds; phone absorption test flaky due to parallel-run DB state collision |
| `GET /portal/crm/contacts/titles` | COVERED | distinct titles, company-scoped |
| `GET /portal/crm/contacts/[id]/score` | GAP | no tests |
| `GET /portal/crm/contacts/[id]/emails` | GAP | no tests |
| `POST /portal/crm/contacts/[id]/send-email` | GAP | no tests |
| `GET /portal/crm/companies` | PARTIAL | API works; test-vs-API contract drift: response wraps in `{ companies, total }` but test expects direct array |
| `GET /portal/crm/companies/[id]` | PARTIAL | API works (rich nested); tests expect flat `{ id, contactsCount, dealsCount }` shape |
| `POST /portal/crm/companies` | COVERED | |
| `PUT /portal/crm/companies/[id]` | COVERED (API) / FAILING (test) | PUT returns 200 correctly; test verify step calls GET which returns nested shape → `industry` undefined at `data.data.industry` |
| `DELETE /portal/crm/companies/[id]` | COVERED | |
| `GET /portal/crm/deals` | COVERED | list, pipelineId filter, status filter |
| `GET /portal/crm/deals/[id]` | COVERED | detail |
| `POST /portal/crm/deals` | COVERED | create, $0 value (accepts), negative value (accepts — no validation) |
| `PUT /portal/crm/deals/[id]` | COVERED | update, stage move, closedAt on won |
| `DELETE /portal/crm/deals/[id]` | COVERED | |
| `GET /portal/crm/deals/[id]/comments` | GAP | no GET test (POST/DELETE tested) |
| `POST /portal/crm/deals/[id]/comments` | COVERED | |
| `DELETE /portal/crm/deals/[id]/comments` | COVERED | |
| `GET /portal/crm/deals/[id]/artifacts` | GAP | no tests |
| `GET /portal/crm/proposals` | COVERED | list, lineItems, fees |
| `GET /portal/crm/proposals/[id]` | COVERED | clientToken present |
| `POST /portal/crm/proposals` | COVERED | |
| `PUT /portal/crm/proposals/[id]` | COVERED | |
| `DELETE /portal/crm/proposals/[id]` | COVERED | |
| `POST /portal/crm/proposals/[id]/send` | GAP | no validation on invalid/missing email — sends and returns 200 silently |
| `GET /portal/crm/contracts` | COVERED (conditional) | skipped when table not migrated |
| `GET /portal/crm/contracts/[id]` | COVERED (conditional) | signers present |
| `POST /portal/crm/contracts` | COVERED (conditional) | |
| `PUT /portal/crm/contracts/[id]` | COVERED (conditional) | |
| `DELETE /portal/crm/contracts/[id]` | COVERED (conditional) | |
| `POST /portal/crm/contracts/[id]/send-for-signature` | GAP | separate integration tests only |
| `POST /portal/crm/contracts/[id]/sign-url` | GAP | separate integration tests only |
| `GET /portal/crm/pipelines` | COVERED | list with stages |
| `POST /portal/crm/pipelines` | COVERED | default stages |
| `PUT /portal/crm/pipelines/[id]/stages` | COVERED | rename + add stage |
| `GET /portal/crm/custom-fields` | COVERED | list, entityType filter |
| `POST /portal/crm/custom-fields` | COVERED (sequential) / FLAKY (parallel) | 500 under parallel load; suspect unique-constraint race |
| `PUT /portal/crm/custom-fields/[id]` | COVERED | |
| `DELETE /portal/crm/custom-fields/[id]` | COVERED | 404 for unknown is 500 under parallel load |
| `PUT /portal/crm/custom-fields/values` | COVERED | upsert + GET verify |
| `GET /portal/crm/analytics` | COVERED | winLoss, revenueByMonth, pipelineFunnel, MRR/ARR |
| `GET /portal/crm/export` | COVERED | CSV for contact/company/deal |
| `POST /portal/crm/import` | COVERED + FIXED | companies cleanup TypeError (companies list shape); missing-file 500 fixed |
| `POST /portal/crm/import/preview` | COVERED + FIXED | missing-file 500 fixed (898ce626d) |
| `GET /portal/crm/mentions` | COVERED | |
| `GET /portal/crm/notifications` | COVERED | unreadCount present |
| `PUT /portal/crm/notifications` | COVERED | mark-all-read, unknown ids no-op |
| `GET /portal/crm/saved-views` | COVERED | |
| `POST /portal/crm/saved-views` | COVERED | |
| `PUT /portal/crm/saved-views/[id]` | COVERED | |
| `DELETE /portal/crm/saved-views/[id]` | COVERED | |
| `GET /portal/crm/scoring-rules` | COVERED | |
| `POST /portal/crm/scoring-rules` | COVERED | |
| `PUT /portal/crm/scoring-rules/[id]` | COVERED | |
| `DELETE /portal/crm/scoring-rules/[id]` | COVERED | |
| `GET /portal/crm/settings` (UI page) | COVERED (smoke) | renders |
| Pipeline drag-and-drop (UI) | PARTIAL | HTML5 drag intentionally bypassed; stage move tested via PUT API |

---

## Performance Numbers (local dev mode, warm second pass)

| Endpoint | TTFB |
|---|---|
| `/api/portal/crm/dashboard` | ~6,000ms |
| `/api/portal/crm/contacts` | ~200ms (warm) / ~10,000ms (cold) |
| `/api/portal/crm/deals` | ~200ms (warm) / ~11,000ms (cold) |
| `/api/portal/crm/analytics` | ~14,000ms (cold AND warm) |
| `/api/portal/crm/companies` | ~200ms (warm) |
| `/api/portal/crm/contacts?page=1&limit=25` (101 contacts) | ~1,287ms |
| `/api/portal/crm/contacts?page=2&limit=25` | ~207ms |
| `/api/portal/crm/contacts?search=StressTest` | ~156ms |

Cold-start times (4–14s) are Next.js dev-mode JIT compilation overhead. Analytics is always slow even warm — suspect N+1 or missing index. Pagination with 100+ contacts is reasonable (~200ms on warm pages).

---

## Issues

### HIGH — Test-vs-API contract drift: companies response shape
**Repro:** `GET /api/portal/crm/companies` returns `{ success, data: { companies:[...], total, page, limit } }`. Tests expect `Array.isArray(res.data.data)`.  
`GET /api/portal/crm/companies/[id]` returns `{ success, data: { company:{...}, contacts:[], deals:[], customFields:{} } }`. Tests expect `data.id`, `data.contactsCount`, `data.dealsCount`.  
**Impact:** 4 test failures including the `PUT /companies/[id]` update test (verify step reads wrong path).  
**Fix:** Either add `contactsCount`/`dealsCount` convenience fields to the `[id]` response AND document the wrapping shape for the list endpoint. The portal UI already handles the current shape (`d.data?.companies ?? d.data`). Tests need updating to match the actual contract, or the list should also expose a flat array alias.  
**Fixed:** No (documentation/test alignment needed).

### HIGH — `/api/portal/crm/proposals/[id]/send` accepts invalid/missing recipient without error
**Repro:** `POST /api/portal/crm/proposals/{id}/send` with `{ recipientEmail: "not-an-email" }` or `{}` returns HTTP 200 and marks status `sent`. No email is sent but no error is returned.  
**Impact:** Silent data corruption — proposals get marked `sent` with no actual delivery. UI has no feedback for invalid recipient.  
**Fix:** Validate `recipientEmail` format before updating status; return 400 for invalid/missing email when the intent is to send.  
**Fixed:** No.

### HIGH — XSS: contact/company name fields store raw HTML
**Repro:** `POST /api/portal/crm/contacts { firstName: "<script>alert(1)</script>" }` stores the raw tag verbatim (confirmed via GET after create).  
**Impact:** If the portal ever renders contact names as raw HTML (e.g., in email templates or PDF exports), stored XSS fires. React rendering escapes it in the current SPA, but downstream consumers (PDF, email, CSV export) could be affected.  
**Fix:** Sanitize text fields server-side on write (strip HTML tags from firstName, lastName, notes, company name). Use `lib/security/sanitize-html.ts` already present in the repo.  
**Fixed:** No.

### HIGH — Deals accept negative values without validation
**Repro:** `POST /api/portal/crm/deals { value: -1000 }` returns 201. Deal stored with value -1000.  
**Impact:** Pipeline value totals become negative, MRR/ARR calculations are corrupted.  
**Fix:** Add `value >= 0` validation in the deals POST/PUT route.  
**Fixed:** No.

### MEDIUM — Import routes return 500 instead of 400 for non-multipart requests
**Repro:** `POST /api/portal/crm/import/preview` with `Content-Type: application/json` body crashes with 500 (unhandled exception from `req.formData()`).  
**Fix:** Added try/catch around `req.formData()` in both `/import` and `/import/preview` routes.  
**Fixed:** YES — commit `898ce626d`.

### MEDIUM — Custom fields tests flaky under 4-worker parallel execution
**Repro:** Run the full test suite with `workers=4`. The custom-fields describe block intermittently returns 500 on field create and 500 on `DELETE /custom-fields/999999`.  
**Root cause:** Likely unique-constraint conflict or session-invalidation during parallel test cleanup. All tests pass in isolation.  
**Fix:** Run custom-fields tests serially (`test.describe.serial`) or isolate with per-worker unique name prefixes.  
**Fixed:** No.

### MEDIUM — Contact merge phone absorption flaky under parallel execution
**Repro:** Merge test expects primary phone to be absorbed from secondary; received `(555) 000-0001` (another fixture contact's phone).  
**Root cause:** Parallel workers share the same `client@example.com` context and clientId=1 data; fixture contacts from other workers bleed into the merge verification.  
**Fix:** Test isolation — use unique ts-prefixed phone numbers per worker, or run merge tests serially.  
**Fixed:** No.

### LOW — `GET /portal/crm/contacts/[id]/score`, `/emails`, `send-email` routes have no E2E coverage
**Impact:** Lead scoring, email history, and send-email flows are untested at the E2E layer.  
**Fix:** Add tests in `portal-crm-extras.spec.ts`.  
**Fixed:** No.

### LOW — Deal comments GET endpoint has no test
**Repro:** `GET /api/portal/crm/deals/[id]/comments` exists but no test reads comment lists.  
**Fixed:** No.

---

## Recommendations

**Pipeline UX:** Drag-and-drop is bypassed in all tests (HTML5 `dataTransfer` is headless-brittle). Consider adding a keyboard-accessible stage-move control (dropdown or arrow buttons) both for accessibility and testability. This would also allow E2E coverage of stage moves without fragile drag simulation.

**Contact merge / dedup:** The merge API is solid but there is no UI flow to trigger it. The duplicate detection endpoint (`/contacts/duplicates`) also has no UI surface. Recommend a "Possible Duplicates" badge on the contact detail page, linking to a merge confirmation UI.

**Bulk operations:** The contacts list has no bulk-select/delete UI. With 100+ contacts, users need multi-select + bulk delete/tag/export. The API already supports CSV export but there is no "Export selected" button.

**Mobile:** No mobile-viewport tests exist for any CRM page. The deals kanban is horizontally scrollable but column widths are fixed; on 375px viewport columns clip. Recommend adding `@mobile` tagged tests in the deals baseline spec.

**Export:** `GET /export?entityType=contact` works and returns CSV but is untested end-to-end from the UI. No "Download CSV" button was observed in the contacts list page during screenshot review.

**Activity timeline depth:** Activities can be created/listed but there is no pagination on the activity timeline. With high-volume clients (thousands of activities per contact), the current unbounded query will degrade. Add cursor-based pagination to `GET /activities?contactId=`.

**Analytics performance:** The `/analytics` endpoint takes 14s even warm. Profile the query — likely a correlated subquery or missing index on `crm_deals.client_id + status + created_at`. Consider materializing the MRR/ARR metrics via a scheduled cache update.

**Proposal send validation:** Add `recipientEmail` format validation (HIGH issue above). This is a one-line fix with a Zod email schema check.
