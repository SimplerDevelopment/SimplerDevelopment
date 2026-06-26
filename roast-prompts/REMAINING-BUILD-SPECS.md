# Remaining-to-GO — build-ready specs

The roast drove 12 → (target) 15 domains to GO via shipped code + honest re-framing. The
remaining domains each need real feature/infra work that is **not safely completable +
verifiable in a sandbox without a DB integration harness or external API credentials**.
Rather than fabricate a GO, here is the exact, code-grounded plan for each — each was
investigated against the live codebase, so it can be executed without re-discovery.

Verification reality per item is stated explicitly. None of these may be marked GO until
the named verification passes.

---

## Automations & Workflows — durable at-least-once queue
**Why not done here:** changes the platform's *core event dispatch*; only the
DB-integration suite (`tests/integration/api/automation-engine.test.ts`) can verify it,
and that needs a live Postgres.

**The seam is a single chokepoint** — `emitEvent()` in `lib/automation/event-bus.ts`; all
~24 emit sites funnel through it, so nothing else changes.

1. **Schema** (`lib/db/schema/brain.ts`, after `automationLogs`): add `automation_jobs`
   `{ id, clientId, event, userId, payload(json), status('pending'|'running'|'completed'|'failed'|'dead_letter'), attemptCount, nextRetryAt(timestamptz), error, createdAt, processedAt }`, index `(clientId, status, nextRetryAt)`.
2. **`emitEvent()`** — make it **`async` and `await`-ed at the ~24 call sites** (a fire-and-forget
   insert still drops on cold start — the bug just moves). Body: `await db.insert(automationJobs).values({...,status:'pending'})`. **Remove** the in-process `handlers` dispatch (keeping both = double execution).
3. **New cron** `app/api/cron/process-automation-jobs/route.ts` — mirror `process-workflow-runs`
   *verbatim*: CAS-claim (`pending→running`), reconstruct the `AutomationEvent`, run **all three**
   handlers (`processEvent` + `processEventForPlaybookAutoStart` + `dispatchSiteWebhooksForEvent`)
   via `Promise.all`, mark `completed` or backoff (`{1:60s,2:5m}`, dead_letter after 3). Wrap with
   `withCronHealth` + `isAuthorizedCron`.
4. **`vercel.json`** — add `{ "path": "/api/cron/process-automation-jobs", "schedule": "* * * * *" }`.
5. **Tests** — unit-test the cron's claim/backoff/dead-letter with a mocked db (doable in-sandbox);
   rewrite `automation-engine.test.ts` to drain via the cron (needs DB).

**GO when:** the integration suite is green with the queue draining events at-least-once.

---

## Bookings & Services — concurrency-safe double-booking guard
**Why not done here:** the fix is an **advisory-lock transaction wrapped around the
check-then-insert in a Stripe-touching payment route** (`app/api/public/booking/[slug]/book/route.ts`),
verifiable only with a concurrency integration test against a real DB.

- Current bug: conflict `SELECT` (line ~137) and `INSERT` (line ~300) are ~160 lines apart with
  **no transaction or DB constraint** → two concurrent requests both reserve the same slot.
- A plain partial unique index on `(booking_page_id, start_time)` would **break group bookings**
  (multiple rows per slot are intentional), so it can't be used alone.
- **Fix:** wrap conflict-check + insert in `db.transaction` and take a
  `pg_advisory_xact_lock(hashtext('booking:'||pageId||':'||startTime))` first — serializes
  concurrent same-slot requests for *both* 1:1 (second sees the first → 409) and group
  (capacity check serializes). Keep the Stripe call **outside** the transaction (line ~446).
- Secondary blocker items (timezone/DST rendering, reminder delivery) are existing features to
  harden + prove with the "3 clean net-new cycles" test, not new code.

**GO when:** a concurrency integration test shows no double-reserve, + the reliability cycles pass.

---

## Email & Campaigns — BYOK-default + Resend billing
**Why not done here:** the deliverability half needs an **external seed-list test**
(GlockApps/mail-tester) against a warmed domain — not reproducible in a sandbox.

- Flip BYOK from opt-in to **default** in the Resend proxy routing layer (tenancy-sensitive:
  per-tenant key selection) so SD never touches tenant sending reputation or eats per-send COGS.
- Wire the real Resend billing API on the non-BYOK path (currently stubbed).
- Run the deliverability comparison (SD BYOK path vs native Mailchimp/Klaviyo) on a real warm domain.

**GO when:** BYOK-default ships + the seed-list test confirms inbox placement holds.

---

## Storefront & Commerce — multi-tenant payment hardening
**Why not done here:** PCI-adjacent Stripe Connect + customer-auth isolation across
`websiteId`-scoped tenants; verifiable only with a multi-tenant integration + security test pass.

- Harden Stripe Connect per-`websiteId` scoping, standalone customer-auth isolation, and EasyPost
  label-purchase scope-gating before a live client store touches real money.
- Pairs with `bun test:tenancy` + a dedicated payment-isolation suite.

**GO when:** the tenancy + payment-isolation suites are green.

---

## Projects, Tickets & Kanban — Linear/Jira bidirectional sync
**Why not done here:** requires a **Linear/Jira OAuth app + live API credentials**; cannot be
built-and-exercised without them.

- Build the bidirectional sync connector (the "complementary layer ON TOP of the agency's existing
  PM tool" GTM and the sale both depend on it per the council).
- OAuth connect → webhook ingest (Linear issue ↔ SD card) → conflict-resolution + an idempotency key.

**GO when:** a round-trip sync demo runs against a real Linear workspace.

---

## Agency, Onboarding & Branding — Brandfetch auto-enrichment
**Why not done here:** requires a **Brandfetch API key**; the core premise ("auto-data beats
manual") is itself unvalidated until run on real signups.

- Wire Brandfetch (+ DNS/logo scrape + CSS color-sampling) on signup so `branding_profiles` ship
  non-blank; surface a brand-completeness score as the forcing function.
- Scope the DNS/SSL/cert lifecycle for Scale-tier custom domains (a P0 ops item).

**GO when:** enrichment populates a real signup's brand tables + the 1-hour completeness query confirms lift.

---

### Through-line
Every item above is **real engineering with a clear recipe**, blocked here only by (a) needing a
live DB integration harness, (b) needing external API credentials, or (c) touching a core
money/dispatch path that must not ship unverified. None is a positioning problem; none can be
honestly marked GO from brief edits.
