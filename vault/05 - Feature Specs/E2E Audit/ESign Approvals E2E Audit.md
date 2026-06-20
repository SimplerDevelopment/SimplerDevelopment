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

- [ ] Signer identity verification (OTP / KBA) — needs spec
- [ ] Automated reminder nudges for pending approvals — needs spec
- [ ] All 6 approval entity types via public /approve/[token] (post, deck, email, contract, form, booking) — needs spec
- [ ] Orphaned/stale pending-change graceful error state — needs spec
- [ ] Public /api/approve/[token] POST approve via token link (non-authenticated reviewer approves; side-effect publishes entity) — needs spec
- [ ] Public /api/approve/[token] POST reject via token link (reviewer rejects; link status flips to rejected, entity unchanged) — needs spec
- [ ] approvals_get MCP tool returns diff and payload for a pending change — needs spec
- [ ] approvals_reject MCP tool marks pending as rejected and verifies entity not applied — needs spec
- [ ] Survey entity type via public /approve/[token]: approval flips survey status to active — needs spec
- [ ] Booking page entity type via public /approve/[token]: approval flips booking_page active=true — needs spec
- [ ] Block template entity type via public /approve/[token]: draft overlay is promoted to live on approval — needs spec
- [ ] mcp_approval_links expiresAt enforcement: expired token returns 400/410, cannot be used to approve — needs spec
- [ ] Native contract send path (/api/portal/crm/contracts/[id]/send): sends per-signer emails, sets status=sent, records documentHash — needs spec
- [ ] Public contract viewer /contract/[token]: page loads for valid signer token; 404 for unknown token — needs spec
- [ ] Admin cross-tenant approvals inbox (/api/admin/approvals): lists pending changes across tenants; approve/reject via admin route — needs spec
- [ ] GET /api/portal/approvals?status=applied returns only applied records (status filter coverage) — needs spec

## Testing


## Blocked


## Passed

- [ ] Public approval UI /approve/[token] renders pending-change payload + PENDING badge ✓ (Phase 2)
- [ ] Reject/Approve buttons render; confirmation modal (reviewer name + note) opens ✓ (Phase 2)
- [ ] WYSIWYG live-artifact preview iframe loads ✓ (Phase 2 — see [[ADR approval-preview-page-scoped-token]])

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] Public /approve endpoint 500s on orphaned/stale pending-change dependency (stale email_lists row) — robustness gap, not just env artifact — see [[Platform E2E Audit 2026-06-17]]
- [ ] No signer identity verification (OTP/KBA) — identity-assurance gap shared with Auth — see [[Competitive Gap Analysis 2026-06]]
- [ ] No reminder nudges for pending approvals — see [[Competitive Gap Analysis 2026-06]]
- [ ] No e2e test exercises the public /api/approve/[token] route at all — the token-link approval path (entity and pending_change link types) is entirely uncovered at the e2e layer despite being the external-reviewer entry point
- [ ] crm_contract_templates has schema and CRUD data but no API routes (app/api/portal/crm/contract-templates/ absent) — cannot be tested until routes are scaffolded
- [ ] Cross-tenant token isolation has no e2e gate: a token minted for client A should 404/403 when called from client B session; currently only enforced by unit tests on the route handler


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
