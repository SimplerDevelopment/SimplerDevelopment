---
kanban-plugin: board
type: spec
domain: agency-onboarding-branding
status: active
date: 2026-06-17
sources: []
---

## To Test


## Testing


## Blocked


## Passed

- [ ] Agency onboarding wizard renders for entitled tenant ✓ (entitlement seed fix applied)
- [ ] Brand profile saves and propagates to site/email/deck outputs ✓
- [ ] ✓ verified 2026-06-20 — Brand profile creation → drives produce-on-brand pipeline (cov-u42.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /agency/custom-domain/verify returns 422 when TXT record not yet present (no domain registered → 400) (cov-u43.spec.ts)
- [ ] ✓ verified 2026-06-20 — GET /agency/chrome returns populated chrome payload when whiteLabelEnabled=true (post-verified domain) (cov-u43.spec.ts)
- [ ] ✓ verified 2026-06-20 — Onboarding brand-vibe + mission answers mirrored into branding_profiles / branding_messaging after wizard completion (cov-u43.spec.ts)
- [ ] ✓ verified 2026-06-20 — MCP branding tools: branding_list_profiles, branding_get_profile, branding_update_profile return correct data under branding:read scope (cov-u43.spec.ts)
- [ ] ✓ verified 2026-06-20 — MCP branding tools: branding_get_messaging, branding_update_messaging, branding_audit round-trip under correct scopes (cov-u44.spec.ts)
- [ ] ✓ verified 2026-06-20 — MCP branding_check_contrast returns valid WCAG pass/fail for a given foreground+background pair (cov-u44.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /agency/custom-domain rejects invalid/non-public domain (400) and domain already claimed by another tenant (409) (cov-u44.spec.ts)
- [ ] ✓ verified 2026-06-20 — Brand style guide page renders (/portal/branding/profiles/[id]/guide) with correct color swatches and typography preview (cov-u44.spec.ts)
- [x] RESOLVED (partial): custom-domain/verify 401/400/422 paths covered — gap-agency-coverage.spec.ts (verified-success path needs real DNS)
- [x] RESOLVED: all 5 MCP branding READ tools + scope-denial covered — gap-agency-coverage.spec.ts
- [x] RESOLVED: agency chrome populated white-label payload covered — gap-agency-coverage.spec.ts

## Gaps Found

- [ ] No SaaS-resell layer: no cloneable onboarding, no tiered entitlement management, no Stripe rebilling — see [[Competitive Gap Analysis 2026-06]]
- [ ] GAP (no implementation): White-label onboarding clone flow
- [ ] GAP (no implementation): Tiered entitlement provisioning for resold tenants
- [ ] GAP (no implementation): Stripe usage rebilling for resold tenants


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
