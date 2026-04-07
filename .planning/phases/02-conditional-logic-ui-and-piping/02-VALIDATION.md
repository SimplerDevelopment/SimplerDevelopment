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
| 02-01-01 | 01 | 1 | LOGIC-01 | T-02-01 / XSS in piping | Piping tokens HTML-escaped before render | unit | `npx vitest run lib/survey-logic.test.ts` | ⬜ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | LOGIC-01 | — | Compound conditions evaluate correctly | unit | `npx vitest run lib/survey-logic.test.ts` | ⬜ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | LOGIC-02 | — | ConditionalLogicPanel renders and saves rules | unit | `npx vitest run components/` | ⬜ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | LOGIC-03 | — | Piping tokens resolved in public form | unit | `npx vitest run lib/survey-logic.test.ts` | ⬜ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements. Phase 1 already established vitest and test patterns.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual builder panel UX | LOGIC-01 | UI interaction flow | Open SurveyBuilder, click field, verify Conditional Logic panel appears and rules can be added |
| Piping token preview in builder | LOGIC-02 | Visual rendering | Type `{fieldId_answer}` in label, verify substitution in preview |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
