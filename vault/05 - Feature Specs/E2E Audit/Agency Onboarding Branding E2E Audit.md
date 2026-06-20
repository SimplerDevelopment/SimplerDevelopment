---
kanban-plugin: board
type: spec
domain: agency-onboarding-branding
status: active
date: 2026-06-17
sources: []
---

## To Test

- [ ] White-label onboarding clone flow — needs spec
- [ ] Tiered entitlement provisioning for resold tenants — needs spec
- [ ] Brand profile creation → drives produce-on-brand pipeline — needs spec
- [ ] Stripe usage rebilling for resold tenants — needs spec
- [ ] POST /agency/custom-domain/verify returns 422 when TXT record not yet present (no domain registered → 400) — needs spec
- [ ] GET /agency/chrome returns populated chrome payload when whiteLabelEnabled=true (post-verified domain) — needs spec
- [ ] Onboarding brand-vibe + mission answers mirrored into branding_profiles / branding_messaging after wizard completion — needs spec
- [ ] MCP branding tools: branding_list_profiles, branding_get_profile, branding_update_profile return correct data under branding:read scope — needs spec
- [ ] MCP branding tools: branding_get_messaging, branding_update_messaging, branding_audit round-trip under correct scopes — needs spec
- [ ] MCP branding_check_contrast returns valid WCAG pass/fail for a given foreground+background pair — needs spec
- [ ] POST /agency/custom-domain rejects invalid/non-public domain (400) and domain already claimed by another tenant (409) — needs spec
- [ ] Brand style guide page renders (/portal/branding/profiles/[id]/guide) with correct color swatches and typography preview — needs spec

## Testing


## Blocked


## Passed

- [ ] Agency onboarding wizard renders for entitled tenant ✓ (entitlement seed fix applied)
- [ ] Brand profile saves and propagates to site/email/deck outputs ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No SaaS-resell layer: no cloneable onboarding, no tiered entitlement management, no Stripe rebilling — see [[Competitive Gap Analysis 2026-06]]
- [ ] POST /agency/custom-domain/verify has no e2e coverage at all — DNS-verify route exists but no spec exercises the 422 (DNS miss) or success path
- [ ] MCP branding read tools (branding_list_profiles, branding_get_profile, branding_get_messaging, branding_audit, branding_check_contrast) have zero e2e test coverage; only branding_create_profile and branding_delete_profile are exercised in mcp-coverage-fills.spec.ts
- [ ] Agency chrome GET with whiteLabelEnabled=true (populated payload) is never tested — all existing specs only assert the disabled/empty state


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
