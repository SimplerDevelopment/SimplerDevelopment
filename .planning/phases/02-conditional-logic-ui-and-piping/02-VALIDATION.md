---
phase: 02
slug: conditional-logic-ui-and-piping
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run lib/survey-logic.test.ts --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run lib/survey-logic.test.ts --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T1 | 01 | 1 | LOGIC-01 | T-02-01 | ShowIfRule/ShowIfCondition types defined; discriminator prevents shape confusion | unit | `npx vitest run lib/survey-logic.test.ts` | W0 | pending |
| 02-01-T2 | 01 | 1 | LOGIC-01, LOGIC-02 | T-02-03, T-02-04 | Compound AND evaluator + resolvePiping with empty string for unanswered (D-10); piping only client-side, no dangerouslySetInnerHTML | unit | `npx vitest run lib/survey-logic.test.ts` | W0 | pending |
| 02-02-T1 | 02 | 2 | LOGIC-01 | T-02-06 | ConditionalLogicPanel renders rules with all 4 operators (D-02); no OR toggle (D-05); unlimited rules O(n) eval | visual | `grep -c "ConditionalLogicPanel" components/admin/ConditionalLogicPanel.tsx` | N/A | pending |
| 02-02-T2 | 02 | 2 | LOGIC-01, LOGIC-02 | T-02-05, T-02-07 | Piping tokens resolved in public form via resolvePiping; React JSX auto-escapes; deleteField clears preview state | unit + visual | `grep -c "resolvePiping" app/s/\[slug\]/page.tsx` | N/A | pending |
| 02-02-T3 | 02 | 2 | LOGIC-01, LOGIC-02 | -- | Human verification checkpoint for full UI flow | manual | `echo "Manual checkpoint"` | N/A | pending |

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements. Phase 1 already established vitest and test patterns.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual builder panel UX | LOGIC-01 | UI interaction flow | Open SurveyBuilder, click field, verify Conditional Logic panel appears and rules can be added with all 4 operators |
| Multi-value input for "Is one of" | LOGIC-01 / D-02 | UI interaction | Select "Is one of" operator, verify multi-value input appears (checkboxes for choice fields, comma-separated for text fields) |
| Piping token substitution in public form | LOGIC-02 | Visual rendering | Type `{fieldId}` in label (per D-08), verify substitution in public form, verify empty string for unanswered (per D-10) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
