---
kanban-plugin: board
type: spec
domain: agency-onboarding-branding
status: active
date: 2026-06-17
sources: []
---

## To Test

- [ ] White-label onboarding clone flow
- [ ] Tiered entitlement provisioning for resold tenants
- [ ] Brand profile creation → drives produce-on-brand pipeline
- [ ] Stripe usage rebilling for resold tenants

## Testing


## Blocked


## Passed

- [ ] Agency onboarding wizard renders for entitled tenant ✓ (entitlement seed fix applied)
- [ ] Brand profile saves and propagates to site/email/deck outputs ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No SaaS-resell layer: no cloneable onboarding, no tiered entitlement management, no Stripe rebilling — see [[Competitive Gap Analysis 2026-06]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
