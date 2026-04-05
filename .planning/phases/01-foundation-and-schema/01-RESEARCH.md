# Phase 1: Foundation and Schema - Research

**Researched:** 2026-04-05
**Domain:** Drizzle ORM transactions, TypeScript type hygiene, PostgreSQL schema migrations, shared pure-function utilities
**Confidence:** HIGH — based entirely on direct codebase inspection; no speculative findings

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUND-01 | Response submission is wrapped in a database transaction to prevent responseCount race conditions | Transaction pattern confirmed in codebase (`db.transaction(async tx => {...})`). Exact insertion point identified in `app/api/surveys/[slug]/route.ts` lines 93–108. |
| FOUND-02 | Shared condition evaluator (`lib/survey-logic.ts`) evaluates `showIf` and `conditionalOptions` consistently across builder preview and public form | Both files implement inline evaluation today. Public form `isFieldVisible()` at line 130 of `page.tsx`. Builder has no evaluator yet (goToPage only). Extraction is a pure TypeScript refactor with no schema changes. |
| FOUND-03 | Field IDs are immutable after a survey has received responses, preventing analytics corruption | `genId()` is defined in `SurveyBuilder.tsx` line 59. It is called only in `addField()` (line 68). The `updateField()` function (line 85) does NOT call `genId()` — IDs are already stable during editing. The risk is that changing field `type` could trigger unintended re-initialization. Guard needed. |
</phase_requirements>

---

## Summary

Phase 1 fixes three foundational defects and creates five database tables needed by later phases. None of the three fixes requires a new package dependency or architectural change — they are targeted corrections to existing code and a new shared utility file. The five new tables are pure schema additions with no effect on current behavior.

**The most complex task** is the transaction fix (FOUND-01): the current submission handler in `app/api/surveys/[slug]/route.ts` does an `INSERT` followed by a separate `UPDATE responseCount`. Both must move inside a `db.transaction()` block. This is a 15-line change but it is the highest-risk change in Phase 1 because it touches the only public write endpoint.

**The cleanest task** is the schema migration (five new tables). They are additive — nothing existing depends on them, no data moves, and the migration follows the exact same SQL DDL pattern as `0041_deal_artifacts_comments.sql`.

**The trickiest task** is the shared evaluator (FOUND-02): the evaluator must handle the existing `showIf` shape (`{ fieldId: string; values: string[] }`) AND be structured to accept compound AND/OR conditions in Phase 2 without a rewrite. Design the function signature for extensibility now.

**Primary recommendation:** Address FOUND-01 first (lowest risk of merge conflicts), then FOUND-02 (new file, no conflicts), then FOUND-03 (guarded type-change behavior in builder), then run the schema migration last (additive, reversible).

---

## Standard Stack

### Core (already in project — no installs needed)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| drizzle-orm | existing | ORM + transaction API | `db.transaction(async tx => {...})` confirmed in `app/api/portal/crm/contacts/merge/route.ts` line 66 |
| drizzle-kit | existing | Migration generation | `npm run db:generate` produces SQL DDL files in `drizzle/` |
| TypeScript | existing | Type safety for `SurveyFieldDef` interface | No new packages needed |
| vitest | existing | Unit test framework | Config at `vitest.config.ts`; `jsdom` environment; `@testing-library/react` available |

**No new packages are required for Phase 1.** All patterns are already established in the codebase.

**Version verification:** Not needed — all packages are already installed. The drizzle-orm transaction API (`db.transaction()`) is confirmed working at `app/api/portal/crm/contacts/merge/route.ts`.

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
lib/
└── survey-logic.ts          # NEW: shared condition evaluator (FOUND-02)

drizzle/
└── 0042_survey_phase1.sql   # NEW: five new tables + column additions

app/api/surveys/[slug]/
└── route.ts                 # MODIFIED: wrap INSERT + UPDATE in db.transaction()

components/admin/
└── SurveyBuilder.tsx        # MODIFIED: guard genId() against type changes (FOUND-03)
```

### Pattern 1: Drizzle Transaction Wrapping

**What:** Wrap multiple database statements in `db.transaction(async tx => {...})` so they are atomic.

**When to use:** Any time two statements must succeed or fail together. Here: INSERT survey_response + UPDATE responseCount.

**Confirmed pattern from `app/api/portal/crm/contacts/merge/route.ts` line 66:**
```typescript
// Source: app/api/portal/crm/contacts/merge/route.ts
const merged = await db.transaction(async (tx) => {
  await tx.update(tableA).set(...).where(...);
  await tx.insert(tableB).values(...);
  return result;
});
```

**Applied to FOUND-01 (`app/api/surveys/[slug]/route.ts`):**
```typescript
// Replace lines 93–108 with:
const [response] = await db.transaction(async (tx) => {
  const [inserted] = await tx.insert(surveyResponses).values({
    surveyId: survey.id,
    answers,
    respondentEmail: email?.trim() || null,
    respondentName: name?.trim() || null,
    source: source || 'link',
    sourceId: sourceId || null,
    ipAddress: ip,
    userAgent: ua,
    completedAt: new Date(),
  }).returning();

  await tx
    .update(surveys)
    .set({ responseCount: sql`${surveys.responseCount} + 1`, updatedAt: new Date() })
    .where(eq(surveys.id, survey.id));

  return [inserted];
});
```

**Note:** The `sql`` template tag from `drizzle-orm` is already imported in this file (line 4).

### Pattern 2: Shared Pure Condition Evaluator

**What:** A pure function in `lib/survey-logic.ts` that both `SurveyBuilder.tsx` preview and `app/s/[slug]/page.tsx` import. Pure = no side effects, no React state, no imports from Next.js.

**Current state in `app/s/[slug]/page.tsx` lines 130–135:**
```typescript
function isFieldVisible(field: SurveyField): boolean {
  if (!field.showIf) return true;
  const depVal = answers[field.showIf.fieldId];
  if (depVal === undefined || depVal === null) return false;
  return field.showIf.values.includes(String(depVal));
}
```

**Target signature for `lib/survey-logic.ts` (designed for Phase 2 extensibility):**
```typescript
// Source: derived from SurveyFieldDef in lib/db/schema.ts
import type { SurveyFieldDef } from '@/lib/db/schema';

export type AnswerMap = Record<string, unknown>;

export function isFieldVisible(
  field: Pick<SurveyFieldDef, 'showIf'>,
  answers: AnswerMap
): boolean {
  if (!field.showIf) return true;
  const depVal = answers[field.showIf.fieldId];
  if (depVal === undefined || depVal === null) return false;
  return field.showIf.values.includes(String(depVal));
}

export function getConditionalOptions(
  field: Pick<SurveyFieldDef, 'conditionalOptions' | 'options'>,
  answers: AnswerMap
): string[] {
  if (!field.conditionalOptions) return field.options;
  const depVal = String(answers[field.conditionalOptions.fieldId] ?? '');
  return field.conditionalOptions.map[depVal] ?? field.conditionalOptions.default ?? field.options;
}
```

**Why this signature:** Takes `Pick<SurveyFieldDef, 'showIf'>` not the full `SurveyField` — future Phase 2 can add compound conditions to the `showIf` type and this function signature does not need to change at the call sites.

**Caller changes:**
- `app/s/[slug]/page.tsx`: replace inline `isFieldVisible()` with `import { isFieldVisible } from '@/lib/survey-logic'`
- `SurveyBuilder.tsx`: no current evaluator — add a preview call when Phase 2 adds conditional UI

### Pattern 3: Schema Migration DDL

**What:** Standard SQL DDL file following the project's established migration pattern.

**Migration file naming:** Next file is `drizzle/0042_survey_phase1.sql` (last existing is `0041_deal_artifacts_comments.sql`).

**Confirmed DDL pattern from `drizzle/0041_deal_artifacts_comments.sql`:**
```sql
CREATE TABLE IF NOT EXISTS "table_name" (
  "id" serial PRIMARY KEY NOT NULL,
  "survey_id" integer NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  -- other columns
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_name" ON "table_name" ("survey_id");
```

**Five tables to create (schema definitions from ARCHITECTURE.md):**

```sql
-- 1. Partial responses (Phase 3 needs this)
CREATE TABLE IF NOT EXISTS "survey_partial_responses" (
  "id" serial PRIMARY KEY NOT NULL,
  "survey_id" integer NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "session_id" varchar(64) NOT NULL,
  "answers" json NOT NULL DEFAULT '{}',
  "last_page" integer NOT NULL DEFAULT 0,
  "respondent_email" varchar(255),
  "source" varchar(30) DEFAULT 'link',
  "source_id" varchar(255),
  "ip_address" varchar(45),
  "user_agent" text,
  "completed" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 2. Webhooks (Phase 4 needs this)
CREATE TABLE IF NOT EXISTS "survey_webhooks" (
  "id" serial PRIMARY KEY NOT NULL,
  "survey_id" integer NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "url" varchar(500) NOT NULL,
  "secret" varchar(64),
  "events" json NOT NULL DEFAULT '["response.submitted"]',
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- 3. Email sequences (Phase 5 needs this)
CREATE TABLE IF NOT EXISTS "survey_email_sequences" (
  "id" serial PRIMARY KEY NOT NULL,
  "survey_id" integer NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "subject" varchar(255) NOT NULL,
  "body_html" text NOT NULL,
  "delay_hours" integer NOT NULL DEFAULT 0,
  "condition_field" varchar(64),
  "condition_value" varchar(255),
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- 4. A/B variants (Phase 8 needs this)
CREATE TABLE IF NOT EXISTS "survey_variants" (
  "id" serial PRIMARY KEY NOT NULL,
  "survey_id" integer NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "fields" json NOT NULL DEFAULT '[]',
  "weight" integer NOT NULL DEFAULT 50,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- 5. AI summaries cache (Phase 7 needs this)
CREATE TABLE IF NOT EXISTS "survey_ai_summaries" (
  "id" serial PRIMARY KEY NOT NULL,
  "survey_id" integer NOT NULL UNIQUE REFERENCES "surveys"("id") ON DELETE CASCADE,
  "summary" text NOT NULL,
  "sentiment" varchar(20),
  "themes" json,
  "per_question" json,
  "response_count_at_generation" integer,
  "generated_at" timestamp DEFAULT now() NOT NULL
);

-- Column additions to existing tables
ALTER TABLE "survey_responses" ADD COLUMN IF NOT EXISTS "variant_id" integer REFERENCES "survey_variants"("id") ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_partial_responses_survey" ON "survey_partial_responses" ("survey_id");
CREATE INDEX IF NOT EXISTS "idx_partial_responses_session" ON "survey_partial_responses" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_survey_webhooks_survey" ON "survey_webhooks" ("survey_id");
CREATE INDEX IF NOT EXISTS "idx_survey_email_sequences_survey" ON "survey_email_sequences" ("survey_id");
CREATE INDEX IF NOT EXISTS "idx_survey_variants_survey" ON "survey_variants" ("survey_id");
```

**Drizzle schema additions (lib/db/schema.ts):** After creating the SQL migration manually, add corresponding Drizzle table definitions and the `SurveyFieldDef` type additions to `lib/db/schema.ts` so the ORM is in sync.

### Pattern 4: Field ID Immutability Guard (FOUND-03)

**Current state:** `genId()` is only called in `addField()` (line 68 of `SurveyBuilder.tsx`). The `updateField()` at line 85 does NOT call `genId()`. Field IDs are already stable during normal editing.

**The actual risk:** The type-change dropdown (lines 229–244) calls `updateField(field.id, { type: t, options: ..., ... })`. This does not change the `id`. The ID is safe.

**What must NOT happen:** A future refactor that replaces `updateField(field.id, patch)` with "delete + re-add" logic. To prevent this, add a code comment and a runtime assertion:

```typescript
// In updateField() — add a guard comment
function updateField(id: string, patch: Partial<SurveyField>) {
  // IMPORTANT: Never include 'id' in patch — field IDs are immutable after creation
  // Changing IDs corrupts analytics for existing responses
  if ('id' in patch) {
    console.error('[SurveyBuilder] Attempted to change field ID — blocked');
    return;
  }
  onChange(fields.map(f => f.id === id ? { ...f, ...patch } : f));
}
```

**The success criterion "ID shown in builder matches ID stored against existing responses"** is already satisfied by the current implementation. FOUND-03 is a guard + verification task, not a bugfix.

### Anti-Patterns to Avoid

- **Re-importing SurveyField type locally:** Both `SurveyBuilder.tsx` and `app/s/[slug]/page.tsx` define their own `interface SurveyField` locally instead of importing `SurveyFieldDef` from `lib/db/schema`. Phase 1 should NOT fix this divergence — it would be a large refactor with no Phase 1 success criteria. Note it but leave it for a dedicated cleanup phase. The shared evaluator in `lib/survey-logic.ts` uses `Pick<SurveyFieldDef, ...>` which is compatible with both local interfaces.
- **Wrapping `emitEvent()` in the transaction:** The `emitEvent()` call at line 110 of `route.ts` must remain OUTSIDE the transaction. It fires after the response is committed. If placed inside the transaction, a slow automation handler could hold the transaction open.
- **Running `db:generate` to produce the migration:** The project uses manually written SQL DDL files in `drizzle/`. Do NOT run `drizzle-kit generate` for these tables — that command diffs the schema and may produce unexpected output. Write the SQL file manually following the `0041_deal_artifacts_comments.sql` pattern, then add the Drizzle table definitions to `lib/db/schema.ts` separately.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic INSERT + UPDATE | Manual retry / check-and-set | `db.transaction()` | Drizzle's transaction wraps both statements in a single Postgres BEGIN/COMMIT; already confirmed working in codebase |
| Unique session IDs for partial responses | Custom ID generator | `crypto.randomUUID()` (already used elsewhere in codebase) | Cryptographically random, collision-resistant, no extra packages |

---

## Common Pitfalls

### Pitfall 1: emitEvent() inside the Transaction Block

**What goes wrong:** `emitEvent('survey.response_submitted', ...)` at line 110 of `route.ts` triggers in-process automation handlers synchronously. If placed inside `db.transaction()`, a slow handler holds the DB connection open, increasing deadlock risk and latency.

**How to avoid:** Keep `emitEvent()` after the `db.transaction()` call resolves, exactly as it is today. The transaction commits first, then the event fires.

**Warning signs:** `emitEvent` call appears inside the `async (tx) =>` callback.

### Pitfall 2: `lib/survey-logic.ts` Importing React or Next.js

**What goes wrong:** The shared evaluator will be imported by both a server component and a client component. Any React or Next.js import makes it incompatible with one side.

**How to avoid:** `lib/survey-logic.ts` must have zero imports except TypeScript types from `@/lib/db/schema`. Pure TypeScript only. No `useState`, no `useEffect`, no server imports.

**Warning signs:** Any import that is not a type import at the top of `lib/survey-logic.ts`.

### Pitfall 3: Schema Migration Breaks Existing Data

**What goes wrong:** `ALTER TABLE survey_responses ADD COLUMN variant_id ...` on a table with existing rows can fail if the column is declared `NOT NULL` without a default.

**How to avoid:** All new columns on existing tables must be nullable or have a default. `variant_id integer REFERENCES "survey_variants"("id") ON DELETE SET NULL` is nullable — this is correct. The five new tables have no rows yet so no data migration is needed.

**Warning signs:** Any `NOT NULL` constraint on a new column added to an existing table without a `DEFAULT` value.

### Pitfall 4: Drizzle Schema Out of Sync with SQL Migration

**What goes wrong:** If `lib/db/schema.ts` is updated (new Drizzle table definitions) but the SQL migration is not applied to the database, or vice versa, queries against the new tables fail at runtime.

**How to avoid:** The task order must be: (1) write the SQL file, (2) apply it (`npm run db:push` or direct psql), (3) add the Drizzle definitions to `schema.ts`. Verify table existence in the database before declaring the migration done.

**Warning signs:** `drizzle-orm` throws "relation does not exist" when querying new tables.

### Pitfall 5: responseCount Max-Responses Gate Still Uses Stale Count

**What goes wrong:** After wrapping the INSERT + UPDATE in a transaction, the `maxResponses` gate at line 35 (`if (survey.maxResponses && survey.responseCount >= survey.maxResponses)`) still reads the count from the initial `SELECT`. Under concurrent submissions at the exact limit, two requests both pass the gate (both read count = max - 1), both insert, and count exceeds max.

**How to avoid:** For the Phase 1 fix, the transaction prevents the increment from being lost but does not prevent the race at the gate check. The correct fix for the gate is to check `COUNT(*)` inside the transaction rather than relying on the cached `survey.responseCount`. However, this is a more complex change. For Phase 1, the transaction fix is the stated requirement (FOUND-01). Document this limitation in the code. The gate race is a separate issue addressed in a future hardening pass.

---

## Code Examples

### Transaction Pattern (confirmed from codebase)

```typescript
// Source: app/api/portal/crm/contacts/merge/route.ts line 66
const result = await db.transaction(async (tx) => {
  const [inserted] = await tx.insert(tableA).values(values).returning();
  await tx.update(tableB).set({ count: sql`${tableB.count} + 1` }).where(eq(tableB.id, id));
  return inserted;
});
```

### Pure Evaluator Unit Test Pattern

```typescript
// Source: tests/unit/ pattern (vitest + no DOM needed)
import { describe, it, expect } from 'vitest';
import { isFieldVisible } from '@/lib/survey-logic';

describe('isFieldVisible', () => {
  it('returns true when no showIf condition', () => {
    expect(isFieldVisible({ showIf: undefined }, {})).toBe(true);
  });

  it('returns false when dependency has no answer', () => {
    const field = { showIf: { fieldId: 'f1', values: ['yes'] } };
    expect(isFieldVisible(field, {})).toBe(false);
  });

  it('returns true when answer matches values list', () => {
    const field = { showIf: { fieldId: 'f1', values: ['yes'] } };
    expect(isFieldVisible(field, { f1: 'yes' })).toBe(true);
  });

  it('returns false when answer does not match', () => {
    const field = { showIf: { fieldId: 'f1', values: ['yes'] } };
    expect(isFieldVisible(field, { f1: 'no' })).toBe(false);
  });
});
```

Run with: `npx vitest run tests/unit/survey-logic.test.ts`

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Manual BEGIN/COMMIT SQL | `db.transaction(async tx => {...})` | Drizzle's idiomatic pattern — already in use in the codebase |
| Inline condition evaluation in each consumer | Shared `lib/survey-logic.ts` | Standard pattern for shared pure utilities in Next.js projects |

---

## Open Questions

1. **Should the maxResponses gate be hardened in Phase 1 or deferred?**
   - What we know: The transaction fix (FOUND-01) prevents count desync but not the gate race at max capacity
   - What's unclear: Whether clients are actively using `maxResponses` — if no surveys have this set, the race never fires
   - Recommendation: Fix the transaction (FOUND-01 requirement), add a code comment flagging the gate limitation, defer the full fix to a hardening task

2. **Should `SurveyField` type duplication (schema.ts vs SurveyBuilder.tsx vs page.tsx) be resolved in Phase 1?**
   - What we know: Three separate `SurveyField` interface definitions exist; they are currently identical but will diverge when new field types are added
   - What's unclear: Risk of consolidation — `SurveyBuilder.tsx` is a client component; `lib/db/schema.ts` is server-safe; importing types across that boundary is fine in Next.js but requires testing
   - Recommendation: Do NOT consolidate in Phase 1 (no Phase 1 success criterion covers this). The shared evaluator uses `Pick<>` to avoid depending on either local interface. Defer full consolidation to Phase 2 prep.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (existing) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/survey-logic.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | responseCount increments atomically under concurrent submissions | Integration / manual | Manual: submit from two tabs simultaneously, verify count matches `COUNT(*)` | No — manual only; no DB test infra for concurrent writes |
| FOUND-01 | Transaction wraps INSERT + UPDATE | Code review | Verify `db.transaction()` wraps both statements in `route.ts` | Code inspection |
| FOUND-02 | `isFieldVisible()` returns correct results for all input combinations | Unit | `npx vitest run tests/unit/survey-logic.test.ts` | No — Wave 0 gap |
| FOUND-02 | `getConditionalOptions()` returns correct options for dependency value | Unit | `npx vitest run tests/unit/survey-logic.test.ts` | No — Wave 0 gap |
| FOUND-03 | `updateField()` in SurveyBuilder does not change field IDs | Unit | `npx vitest run tests/unit/survey-builder-field-id.test.ts` | No — Wave 0 gap |
| Schema | Five new tables exist with correct columns | Manual / DB inspect | `psql -c "\d survey_partial_responses"` (and the other 4 tables) | No — post-migration check |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/survey-logic.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** All unit tests green + manual concurrent-submission verification before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/survey-logic.test.ts` — covers FOUND-02: `isFieldVisible()` and `getConditionalOptions()` pure function tests
- [ ] `tests/unit/survey-builder-field-id.test.ts` — covers FOUND-03: verifies `updateField()` never mutates the `id` property
- No framework install needed — Vitest is already configured and running

*(Note: FOUND-01 has no automated concurrent-write test because the project has no DB test infrastructure. Manual verification is the acceptance gate.)*

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection: `app/api/surveys/[slug]/route.ts` — exact lines of the race condition (lines 93–108) and emitEvent call (line 110)
- Direct codebase inspection: `components/admin/SurveyBuilder.tsx` — `genId()` call sites (lines 59, 68); `updateField()` definition (line 85); confirmed IDs are not regenerated on edit
- Direct codebase inspection: `app/s/[slug]/page.tsx` — inline `isFieldVisible()` at lines 130–135 (the function to be extracted)
- Direct codebase inspection: `lib/db/schema.ts` lines 1798–1870 — `SurveyFieldDef` interface, `surveys` table, `surveyResponses` table
- Direct codebase inspection: `app/api/portal/crm/contacts/merge/route.ts` line 66 — confirmed `db.transaction()` pattern in use
- Direct codebase inspection: `drizzle/0041_deal_artifacts_comments.sql` — confirmed SQL DDL migration pattern
- Direct codebase inspection: `vitest.config.ts` — confirmed test framework, jsdom environment, `tests/setup.ts`
- Direct codebase inspection: `tests/unit/` — confirmed unit test directory exists with 10 existing test files

### Secondary (MEDIUM confidence)

- `.planning/research/PITFALLS.md` — Pitfall 1 (responseCount desync), Pitfall 2 (evaluator split), Pitfall 3 (field ID stability) — all confirmed against codebase inspection
- `.planning/research/ARCHITECTURE.md` — five new table schemas, integration point map

### Tertiary (LOW confidence)

None — all findings in this phase are based on direct codebase inspection. No speculative or web-only sources.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all tools already in project, transaction pattern confirmed in existing code
- Architecture: HIGH — exact file locations and line numbers verified from direct inspection
- Pitfalls: HIGH — each pitfall is tied to a specific file and line number in the codebase
- Test plan: MEDIUM — unit tests for pure functions are straightforward; concurrent-write test is genuinely not automatable without DB test infrastructure

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (stable patterns; only invalidated if someone modifies `route.ts`, `SurveyBuilder.tsx`, or `schema.ts` before planning completes)
