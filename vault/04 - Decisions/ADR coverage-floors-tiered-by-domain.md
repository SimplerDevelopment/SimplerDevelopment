---
type: adr
domain: testing
status: accepted
date: 2026-06-09
sources:
  - tests/CI-GATES.md — "Coverage floors" section
  - tests/CLAUDE.md — "Coverage floors" pointer + current state note
  - .planning/coverage-climb-plan.md — iteration log background
---

# ADR: Coverage floors are tiered by domain criticality, not uniform

## Status

Accepted — backfilled 2026-06-09 from `tests/CI-GATES.md`.

## Context

A single project-wide coverage floor would either be too low to provide meaningful
confidence for security-critical code, or too high to be achievable given that much of
the codebase is UI scaffolding and integration glue that is better tested through E2E
flows than unit tests. The project also has specific domains (`lib/billing`,
`lib/crypto`) that handle real money and secrets — branch coverage in those areas is
not optional.

As of June 2026, unit-only coverage sits at ~4% (the integration coverage emission is
blocked by a vitest 4.0.18 bug). The floors documented here are the intended targets
for when coverage is healthy enough to enforce as a blocking gate.

## Decision

Coverage thresholds are defined in `vitest.config.ts` under `test.coverage.thresholds`
in three tiers:

**Tier 1 — project-wide floor (every file):**

| Metric     | Floor |
|------------|------:|
| Lines      |  60%  |
| Statements |  60%  |
| Functions  |  60%  |
| Branches   |  50%  |

**Tier 2 — feature modules with user-facing money or secrets (70/60):**

`lib/billing/**`, `lib/ai/**`, `lib/agency/**`, `lib/esign/**`, `lib/chat/**`

**Tier 3 — cryptography primitives (90/80):**

`lib/crypto/**` — API-key and secret-encryption primitives. Every branch matters;
the 90% line / 80% branch floor applies.

These floors are **not currently a blocking gate** (the vitest 4.0.18 coverage-emission
bug blocks enforcement). They document the intended floors and will be promoted to
blocking gates once coverage is healthy.

## Consequences

- New code in `lib/crypto` that reaches production without 90% line coverage is a
  process violation even if the gate isn't yet wired.
- The `scripts/coverage-climb-plan.md` records the iterative work to climb toward the
  floors, domain by domain.
- The tiered approach means billing/AI/crypto reviewers should demand higher test
  coverage than portal UI reviewers when reviewing PRs.

## Alternatives considered

A single flat 60% floor was implicitly the baseline; the higher floors for
money/secrets domains were added explicitly based on the reasoning in `CI-GATES.md`:
"`lib/crypto` holds API-key + secret-encryption primitives — every branch matters."

## Related

- [[Billing & Stripe]]
- [[Company Brain & AI]]
- [[Auth & Security]]
