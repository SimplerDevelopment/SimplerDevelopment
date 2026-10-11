---
type: adr
domain: ui
status: accepted
date: 2026-10-11
sources:
  - PR #233 (fix/click-path batch 1) — 9 unit suites failing on non-en-US machines
  - lib/portal-utils.ts — formatNumber/formatDate/formatTime (+ existing formatCents)
---

# ADR: UI number/date formatting is pinned to en-US

## Status

Accepted — implemented 2026-10-11 (pins across admin, portal settings, booking,
contracts, service requests; helpers in `lib/portal-utils.ts`).

## Context

Formatting calls without an explicit locale (`toLocaleString()`,
`toLocaleDateString()`, `toLocaleTimeString()`) render from the *machine*
locale. Consequences observed:

- 9 unit suites failed on any non-en-US box (`$2,250.00` vs `$2250,00`,
  `8,500` vs `8500`, `15/1/2025` vs `1/15/2025`), while CI (en-US) stayed
  green — the suite lied about coverage on half the dev machines.
- Worse than tests: booking slot buttons render `16:00` / `p. m.` instead of
  `4:00 PM` on es-ES machines, so the AM/PM slot matcher found zero buttons
  and the whole booking flow silently dead-ended. Formatting locale is not
  cosmetic here — it selects which UI paths are reachable.
- Production runs en-US, so pinning en-US changes nothing visible in prod;
  it only makes every other machine render what prod renders.

## Decision

- **All UI number/date/time formatting pins `en-US` explicitly**, either via
  the shared helpers (`formatNumber`, `formatDate`, `formatTime`,
  `formatCents` in `lib/portal-utils.ts` — preferred for new code) or a
  literal `'en-US'` argument at the call site.
- Bare runtime-locale `toLocale*()` calls in UI code are treated as bugs.
- A future per-tenant locale is a separate, deliberate project (tenant
  preference → formatter locale threading); until then, determinism wins
  over localization.

## Consequences

- Unit tests asserting formatted output are hermetic on every machine.
- Spanish-speaking users see en-US number/date formats until the tenant-
  locale project ships (status quo in production — no visual change).
- New UI code must use the helpers; reviewers should flag bare calls.

## Alternatives considered

- **Tenant locale now:** correct long-term, but requires preference storage,
  formatter threading through ~100 call sites, and translated test
  expectations. Deferred, not rejected.
- **Locale-independent tests only (no pins):** keeps the suite green but
  leaves real users on es-ES machines with broken booking slots. Rejected —
  the tests were reporting a genuine product bug.

## Related

- [[ADR coverage-floors-tiered-by-domain]]
