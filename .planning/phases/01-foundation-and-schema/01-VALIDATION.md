---
phase: 1
slug: foundation-and-schema
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose lib/survey-logic.test.ts` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose lib/survey-logic.test.ts`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | FOUND-01 | — | Transaction prevents responseCount desync | integration | `npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | FOUND-02 | — | Shared evaluator produces identical results in builder and public form | unit | `npx vitest run lib/survey-logic.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | FOUND-03 | — | Field IDs never reassigned after responses exist | unit | `npx vitest run lib/survey-logic.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 1 | FOUND-01 | — | All five new schema tables exist with correct columns | migration | `npx drizzle-kit push` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/survey-logic.test.ts` — unit tests for shared condition evaluator
- [ ] Test stubs for field ID immutability guard

*Existing vitest infrastructure covers framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Concurrent submissions produce accurate count | FOUND-01 | Requires two simultaneous browser tabs | Open survey in two tabs, submit both within 1 second, verify responseCount matches total |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
