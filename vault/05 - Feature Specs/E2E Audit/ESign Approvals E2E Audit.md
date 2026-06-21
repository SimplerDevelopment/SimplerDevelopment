---
kanban-plugin: board
type: spec
domain: esign-approvals
status: active
date: 2026-06-17
sources:
  - app/approve/[token]/page.tsx
  - lib/preview-token.ts
  - lib/db/schema/approvals.ts
  - tests/e2e/portal-approvals-mutations.spec.ts
  - tests/e2e/portal-mcp-approvals.spec.ts
  - tests/e2e/contracts-esign.spec.ts
---

## To Test

## Testing


## Blocked


## Passed

- [ ] Public approval UI /approve/[token] renders pending-change payload + PENDING badge ✓ (Phase 2)
- [ ] Reject/Approve buttons render; confirmation modal (reviewer name + note) opens ✓ (Phase 2)
- [ ] WYSIWYG live-artifact preview iframe loads ✓ (Phase 2 — see [[ADR approval-preview-page-scoped-token]])
- [ ] ✓ verified 2026-06-20 — All 6 approval entity types via public /approve/[token] (post, deck, email, contract, form, booking) (cov-u34.spec.ts)
- [ ] ✓ verified 2026-06-20 — Public /api/approve/[token] POST approve via token link (non-authenticated reviewer approves; side-effect publishes entity) (cov-u35.spec.ts)
- [ ] ✓ verified 2026-06-20 — Public /api/approve/[token] POST reject via token link (reviewer rejects; link status flips to rejected, entity unchanged) (cov-u35.spec.ts)
- [ ] ✓ verified 2026-06-20 — approvals_get MCP tool returns diff and payload for a pending change (cov-u35.spec.ts)
- [ ] ✓ verified 2026-06-20 — approvals_reject MCP tool marks pending as rejected and verifies entity not applied (cov-u35.spec.ts)
- [ ] ✓ verified 2026-06-20 — Survey entity type via public /approve/[token]: approval flips survey status to active (cov-u36.spec.ts)
- [ ] ✓ verified 2026-06-20 — Booking page entity type via public /approve/[token]: approval flips booking_page active=true (cov-u36.spec.ts)
- [ ] ✓ verified 2026-06-20 — Block template entity type via public /approve/[token]: draft overlay is promoted to live on approval (cov-u36.spec.ts)
- [ ] ✓ verified 2026-06-20 — mcp_approval_links expiresAt enforcement: expired token returns 400/410, cannot be used to approve (cov-u36.spec.ts)
- [ ] ✓ verified 2026-06-20 — Native contract send path (/api/portal/crm/contracts/[id]/send): sends per-signer emails, sets status=sent, records documentHash (cov-u37.spec.ts)
- [ ] ✓ verified 2026-06-20 — Public contract viewer /contract/[token]: page loads for valid signer token; 404 for unknown token (cov-u37.spec.ts)
- [ ] ✓ verified 2026-06-20 — Admin cross-tenant approvals inbox (/api/admin/approvals): lists pending changes across tenants; approve/reject via admin route (cov-u37.spec.ts)
- [ ] ✓ verified 2026-06-20 — GET /api/portal/approvals?status=applied returns only applied records (status filter coverage) (cov-u37.spec.ts)
- [ ] ✓ verified 2026-06-20 — Orphaned/stale pending-change graceful error state: POST /api/approve/[token] returns 409 (not 500) when pending change is already applied (cov-u34.spec.ts APPR-STALE-01)
- [x] RESOLVED: public /approve/[token] entity + pending_change link types, invalid/expired/resolved/validation paths covered — gap-esign-coverage.spec.ts
- [x] RESOLVED: cross-tenant approve-token isolation gate covered — gap-esign-coverage.spec.ts

## Gaps Found

- [x] RESOLVED 2026-06-20 — Public /approve endpoint 500s on orphaned/stale pending-change dependency (stale email_lists row) — fixed: returns 409 with "no longer applicable" message (app/api/approve/[token]/route.ts); verified by APPR-STALE-01 in cov-u34.spec.ts
- [ ] No signer identity verification (OTP/KBA) — identity-assurance gap shared with Auth — see [[Competitive Gap Analysis 2026-06]]
- [ ] No reminder nudges for pending approvals — see [[Competitive Gap Analysis 2026-06]]
- [ ] crm_contract_templates has schema and CRUD data but no API routes (app/api/portal/crm/contract-templates/ absent) — cannot be tested until routes are scaffolded
- [ ] GAP (no implementation): Signer identity verification (OTP / KBA)
- [ ] GAP (no implementation): Automated reminder nudges for pending approvals


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
