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

- [ ] Signer identity verification (OTP / KBA)
- [ ] Automated reminder nudges for pending approvals
- [ ] All 6 approval entity types via public /approve/[token] (post, deck, email, contract, form, booking)
- [ ] Orphaned/stale pending-change graceful error state

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


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
