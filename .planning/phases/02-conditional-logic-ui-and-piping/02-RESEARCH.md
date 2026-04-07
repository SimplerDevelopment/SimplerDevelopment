# Phase 2: Conditional Logic UI and Piping - Research

**Researched:** 2026-04-05
**Domain:** React conditional logic UI, answer piping/token substitution, DAG flow visualization, SurveyBuilder extension
**Confidence:** HIGH — based on direct codebase inspection + confirmed package versions

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LOGIC-01 | User can configure conditional visibility rules (showIf) for any field via a visual rule builder in SurveyBuilder | `SurveyField.showIf` is already defined in schema and builder; currently no UI exposes it. Builder expanded editor is the right insertion point. Compound AND requires extending the `showIf` type in schema and `isFieldVisible` in `lib/survey-logic.ts`. |
| LOGIC-02 | User can reference prior answers in question labels and help text using piping syntax (e.g., "You said {fieldId}") | No piping exists today. Must add a `resolvePiping(template, answers)` function to `lib/survey-logic.ts`. Public form renders labels directly — needs to wrap label/helpText through resolver before render. |
| LOGIC-03 | User can view a flow diagram visualizing page flow, skip logic, and conditional branching for multi-page surveys | LOGIC-03 is assigned to Phase 6 in REQUIREMENTS.md traceability, but is listed in Phase 2 Success Criteria. Per STATE.md decision: "LOGIC-03 (flow diagram) placed in Phase 6 — depends on Phase 2 conditional UI having meaningful content to render." Only LOGIC-01 and LOGIC-02 are in Phase 2. The flow diagram tab in the success criteria is Phase 6 scope. |
</phase_requirements>

---

## Summary

Phase 2 adds two capabilities on top of the Phase 1 foundation: (1) a visual conditional-logic rule builder panel inside the SurveyBuilder's expanded field editor, and (2) answer piping token substitution in question labels and help text. Both work against the existing `SurveyFieldDef` schema and the shared evaluator in `lib/survey-logic.ts`.

The current `showIf` schema is `{ fieldId: string; values: string[] }` — it handles only a single field + values check. Success criterion 4 ("compound AND conditions") requires extending this type to support multiple rules with an AND combinator. This is a schema type change plus an evaluator update. Both the schema type (`lib/db/schema.ts`) and the evaluator (`lib/survey-logic.ts`) must be updated together, and the change must be backward-compatible so existing single-condition surveys continue to work.

Answer piping is pure string processing: scan label/helpText for `{fieldId}` tokens and replace with the live answer value from `answers`. This is a new pure function in `lib/survey-logic.ts` used by the public form renderer. No schema changes are needed for piping.

The flow diagram (LOGIC-03) is confirmed in Phase 6 per the STATE.md decision. Do not implement it in Phase 2.

**Primary recommendation:** Implement in three tasks — (1) extend `showIf` schema type and evaluator for compound conditions, (2) add `ConditionalLogicPanel` component to `SurveyBuilder`, (3) add piping resolver and wire it into the public form.

---

## Standard Stack

### Core (no new installs needed for LOGIC-01 and LOGIC-02)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| TypeScript | existing ~5 | Type-safe schema extension for compound showIf | Already in project |
| React 19 | existing 19.2.3 | UI state for rule builder panel | Already in project |
| Tailwind CSS v4 | existing | Styling for new ConditionalLogicPanel | Project uses hand-rolled Tailwind, no shadcn |
| vitest | existing ^4.0.18 | Unit tests for `isFieldVisible` compound cases and `resolvePiping` | Config at `vitest.config.ts`, jsdom env |
| lib/survey-logic.ts | Phase 1 output | Shared evaluator — will be extended | Already created in Phase 1 |

### Supporting (for Phase 6 flow diagram — out of scope for Phase 2)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @xyflow/react | 12.10.2 | DAG flow visualization | Phase 6 only — when LOGIC-03 is implemented |

**No new npm packages are required for Phase 2.** All logic is pure TypeScript + React state using already-installed dependencies.

**Installation (Phase 6, not Phase 2):**
```bash
npm install @xyflow/react
```

---

## Architecture Patterns

### Recommended Project Structure (new and modified files)

```
lib/
└── survey-logic.ts          # MODIFIED: extend isFieldVisible for compound AND; add resolvePiping()

lib/db/
└── schema.ts                # MODIFIED: extend SurveyFieldDef.showIf type for compound conditions

components/admin/
└── SurveyBuilder.tsx        # MODIFIED: add ConditionalLogicPanel inside expanded field editor
└── ConditionalLogicPanel.tsx  # NEW: rule builder UI component

app/s/[slug]/
└── page.tsx                 # MODIFIED: wrap field.label/helpText through resolvePiping() before render

lib/
└── survey-logic.test.ts     # MODIFIED: add tests for compound AND and piping resolver
```

### Pattern 1: Compound showIf Schema Type Extension

**What:** Extend `showIf` from a single rule to a compound rule set with an AND combinator.

**Backward compatibility requirement:** The existing shape `{ fieldId: string; values: string[] }` must remain valid. Use a union type so old surveys with simple conditions work without migration.

**Target type (lib/db/schema.ts — SurveyFieldDef):**
```typescript
// Single-rule shape (existing, backward-compatible)
export interface ShowIfRule {
  fieldId: string;
  operator: 'equals' | 'not_equals';
  values: string[];
}

// Compound shape (new for Phase 2)
export interface ShowIfCondition {
  combinator: 'AND';
  rules: ShowIfRule[];
}

// Union on SurveyFieldDef — both forms are valid
showIf?: { fieldId: string; values: string[] } | ShowIfCondition;
```

**Why union not replace:** Existing surveys in the database have `showIf: { fieldId: string; values: string[] }`. Replacing the type would require a data migration on all existing survey JSON fields. A union type makes the evaluator handle both shapes without touching stored data.

**Note on D-02 operators:** D-02 specifies four UI operators: "equals, not equals, is one of, is not one of." The data model uses only two operators (`equals` / `not_equals`) with `values: string[]`. "Is one of" maps to `{ operator: 'equals', values: ['A', 'B', 'C'] }` because the evaluator checks `values.includes(answer)`. "Is not one of" maps to `{ operator: 'not_equals', values: ['A', 'B', 'C'] }` because the evaluator checks `!values.includes(answer)`. The UI presents four operator labels but stores only two operator values with varying `values` array lengths.

### Pattern 2: Updated isFieldVisible Evaluator

**What:** `lib/survey-logic.ts` must handle the union type — detect which shape is present and evaluate accordingly.

**Current state:** `isFieldVisible` handles `{ fieldId, values }` only.

**Target implementation:**
```typescript
// Source: lib/survey-logic.ts (to be updated in Phase 2)
import type { SurveyFieldDef, ShowIfRule, ShowIfCondition } from '@/lib/db/schema';

function isLegacyRule(showIf: { fieldId: string; values: string[] } | ShowIfCondition): showIf is { fieldId: string; values: string[] } {
  return 'fieldId' in showIf && !('combinator' in showIf);
}

function evaluateRule(rule: ShowIfRule, answers: AnswerMap): boolean {
  const rawVal = answers[rule.fieldId];
  if (rawVal === undefined || rawVal === null) return rule.operator === 'not_equals';
  const strVal = String(rawVal);
  switch (rule.operator) {
    case 'equals':      return rule.values.includes(strVal);
    case 'not_equals':  return !rule.values.includes(strVal);
    default:            return rule.values.includes(strVal);
  }
}

export function isFieldVisible(
  field: Pick<SurveyFieldDef, 'showIf'>,
  answers: AnswerMap
): boolean {
  if (!field.showIf) return true;
  const showIf = field.showIf;
  if (isLegacyRule(showIf)) {
    // Backward-compatible: old single-rule shape — treat as 'equals'
    const depVal = answers[showIf.fieldId];
    if (depVal === undefined || depVal === null) return false;
    return showIf.values.includes(String(depVal));
  }
  // Compound condition — per D-05, combinator is always 'AND'
  const { rules } = showIf;
  return rules.every(r => evaluateRule(r, answers));
}
```

### Pattern 3: Answer Piping Resolver

**What:** A pure function that replaces `{fieldId}` tokens in a string with the live answer for that field.

**Token syntax (per D-08):** `{fieldId}` where `fieldId` is the field's ID (e.g., `{abc123}`). Single curly braces, field ID only, no suffix.

**Why this token format:** Simple regex match, no escaping needed, surveyors will see field IDs in the builder so the token is discoverable.

```typescript
// Source: lib/survey-logic.ts (new export for Phase 2)
export function resolvePiping(
  template: string,
  answers: AnswerMap
): string {
  if (!template || !template.includes('{')) return template;
  return template.replace(/\{([^}]+)\}/g, (_match, fieldId: string) => {
    const val = answers[fieldId];
    if (val === undefined || val === null || val === '') return '';
    return String(val);
  });
}
```

**Per D-10:** Unanswered piped tokens render as empty string (blank), not the raw token.

**Usage in public form (`app/s/[slug]/page.tsx`):**
```typescript
// Before rendering a field's label/helpText:
const resolvedLabel = resolvePiping(field.label, answers);
const resolvedHelp = resolvePiping(field.helpText, answers);
```

### Pattern 4: ConditionalLogicPanel Component

**What:** A sub-panel inside the expanded field editor in `SurveyBuilder.tsx` that lets users add/edit/remove `showIf` rules visually.

**Where it lives:** Inside the expanded editor area (the grid at line 231 in `SurveyBuilder.tsx`). Added as a new section below the "Required" toggle.

**Component structure:**
```tsx
// components/admin/ConditionalLogicPanel.tsx
interface Props {
  field: SurveyFieldMinimal;
  allFields: SurveyFieldMinimal[]; // pre-filtered fields for the "field" dropdown
  onChange: (patch: { showIf?: ShowIfCondition | undefined }) => void;
}
```

**UI flow:**
1. "No condition" state: shows "Add condition" button
2. Single rule state: shows field selector + operator dropdown + value input(s)
3. Compound state: shows list of AND'd rules with add/remove controls (per D-05: AND-only, no OR toggle)

**Operator options exposed in UI per D-02:** `equals` ("Is"), `not_equals` ("Is not"), plus "Is one of" and "Is not one of" which map to `equals`/`not_equals` with multiple values in the `values` array.

**Why a separate component file:** `SurveyBuilder.tsx` is already 411 lines. The panel is complex enough (multiple rules, add/remove, multi-value input) to warrant its own file.

### Pattern 5: Builder Preview State for Live Logic

**What:** The builder must maintain a preview answer state so that conditional logic can be evaluated live during editing.

**Current builder state:** No preview answer map — the builder only shows field configuration, not a form simulation.

**Required addition to `SurveyBuilder.tsx`:**
```typescript
// New state in SurveyBuilder component
const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({});
```

This preview state is local to the builder session and never saved to the survey definition.

### Anti-Patterns to Avoid

- **Storing `operator` as freeform string:** Always use a TypeScript union (`'equals' | 'not_equals'`) so the evaluator can exhaustively switch.
- **Replacing `showIf` type outright:** A hard replacement breaks existing surveys. Use the backward-compatible union.
- **Piping in the API response:** Only resolve piping client-side in the browser form. Never store resolved values — the raw token must be in the database so piping works for each respondent with their unique answers.
- **Building a full expression editor:** Scope is AND of simple field+operator+value rules only. Do not build nested groups, date range operators, or regex operators in Phase 2.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Compound AND evaluation | Custom recursive parser | Simple `every` over a flat rules array | Success criteria asks for AND of flat rules only — no nested groups needed |
| Token substitution regex | Complex parser | Single `.replace(/\{([^}]+)\}/g, ...)` | One regex handles all token replacements; no library needed |
| Flow diagram (LOGIC-03) | Custom SVG/canvas graph | @xyflow/react | Phase 6 scope; complex enough to warrant a dedicated library |
| Drag-to-reorder rules | Custom DnD | @dnd-kit (already installed) | Project already uses @dnd-kit/sortable — use for rule reordering if needed |

**Key insight:** Both Phase 2 features (conditional logic UI and piping) are pure React state + TypeScript computation. No new dependencies are needed.

---

## Common Pitfalls

### Pitfall 1: Breaking Existing showIf Data

**What goes wrong:** Changing `SurveyFieldDef.showIf` from `{ fieldId: string; values: string[] }` to the new compound type causes TypeScript errors AND breaks `isFieldVisible` for all surveys that have the simple shape stored in JSON.
**Why it happens:** The JSON column stores the literal object — changing the TypeScript type doesn't migrate the data.
**How to avoid:** Use the union type. The evaluator's `isLegacyRule()` discriminator detects which shape is present at runtime.
**Warning signs:** TypeScript errors saying `showIf.fieldId` doesn't exist, or `isFieldVisible` returning wrong results for existing surveys.

### Pitfall 2: Circular Field References in showIf

**What goes wrong:** Field A shows if Field B has value X, Field B shows if Field A has value Y — infinite evaluation loop.
**Why it happens:** The evaluator is called on every answer change for every field simultaneously.
**How to avoid:** The evaluator is non-recursive (no field triggers another field's evaluation). `isFieldVisible` reads only from `answers`, not from other fields' visibility state. No loop is possible with a flat evaluation pass.
**Warning signs:** Would only be a problem if the evaluator called itself on another field inside — it does not.

### Pitfall 3: Piping Unresolved Tokens in Form Submission

**What goes wrong:** The stored survey definition has `"You said {abc123}"` as a label and that literal string gets submitted to the server in the form data.
**Why it happens:** Developer wraps `resolvePiping` in a `useMemo` but forgets to apply it to the submission payload.
**How to avoid:** `resolvePiping` must only be applied for rendering labels, never for field IDs, keys, or submission data. Submission payload uses field IDs (never labels).
**Warning signs:** Submitted answers contain token strings like `{abc123}` as keys.

### Pitfall 4: Builder Preview Answers Not Cleared on Field Delete

**What goes wrong:** User deletes Field A but `previewAnswers` still contains an entry for Field A's ID. Subsequent `isFieldVisible` evaluations return wrong results if another field has `showIf.fieldId === deletedField.id`.
**Why it happens:** `deleteField()` in `SurveyBuilder.tsx` removes the field definition but the preview answer map is separate state.
**How to avoid:** In `deleteField()`, also remove the deleted field's ID from `previewAnswers`.
**Warning signs:** ConditionalLogicPanel shows "Visible" for a field that depends on a deleted field.

### Pitfall 5: showIf Field Selector Showing Page Break Fields

**What goes wrong:** The ConditionalLogicPanel's "field to depend on" dropdown includes `page_break` fields, which have no user-entered answer value.
**Why it happens:** The dropdown iterates all fields including structural fields.
**How to avoid:** Filter the field list to only include fields that have user-entered answer values: exclude `page_break` and `heading` types.
**Warning signs:** Users selecting a page break in the condition and the rule never evaluating to true.

### Pitfall 6: TypeScript Discriminator Not Working

**What goes wrong:** The `isLegacyRule()` discriminator `'fieldId' in showIf` returns true for a `ShowIfCondition` that also happens to have a field named `fieldId` (won't happen with the defined type but worth noting).
**Why it happens:** Union discriminator relies on a unique property name.
**How to avoid:** `ShowIfCondition` has no `fieldId` property — the discriminator is reliable. Uses both `'fieldId' in showIf` AND `!('combinator' in showIf)` for extra safety.

---

## Code Examples

Verified patterns from direct codebase inspection:

### Existing SurveyField Schema Shape (lib/db/schema.ts lines 1811-1814)
```typescript
// Source: lib/db/schema.ts
showIf?: { fieldId: string; values: string[] };
conditionalOptions?: { fieldId: string; map: Record<string, string[]>; default?: string[] };
goToPage?: Record<string, number>; // { "option_value": pageIndex }
```

### Existing isFieldVisible Call in Public Form (app/s/[slug]/page.tsx)
```typescript
// Source: app/s/[slug]/page.tsx lines 131-133
function isFieldVisible(field: SurveyField): boolean {
  return evalFieldVisible(field, answers);
}
```

### Existing SurveyBuilder updateField Guard (components/admin/SurveyBuilder.tsx lines 85-93)
```typescript
// Source: components/admin/SurveyBuilder.tsx — immutability guard from Phase 1
function updateField(id: string, patch: Partial<SurveyField>) {
  if ('id' in patch) {
    console.error('[SurveyBuilder] Attempted to change field ID — blocked');
    return;
  }
  onChange(fields.map(f => f.id === id ? { ...f, ...patch } : f));
}
```

### Existing Skip Logic UI Pattern (SurveyBuilder.tsx lines 356-390)
```typescript
// Source: components/admin/SurveyBuilder.tsx — existing per-field logic section
// The ConditionalLogicPanel follows the same section pattern inside the expanded editor
{hasBranching(field.type) && field.options.length > 0 && (() => {
  // ... select dropdowns per option
})()}
```

### ConditionalLogicPanel Integration Point (SurveyBuilder.tsx line ~353)
```tsx
{/* Conditional Logic — insert after Required toggle (~line 353) */}
<ConditionalLogicPanel
  field={field}
  allFields={fields.filter(f => f.type !== 'page_break' && f.type !== 'heading' && f.id !== field.id)}
  onChange={(patch) => updateField(field.id, patch)}
/>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline visibility logic in page.tsx | Shared `isFieldVisible` in lib/survey-logic.ts | Phase 1 (2026-04-05) | Phase 2 extends the evaluator without touching page.tsx call sites |
| Single field + values showIf | Compound AND with typed operators | Phase 2 | Schema type change + evaluator update required |
| No piping | Token substitution `{fieldId}` | Phase 2 | New pure function in survey-logic.ts |

**Deprecated/outdated:**
- Single-shape `showIf: { fieldId, values }`: Still valid as backward-compatible union member, but new rules created via the UI will use the compound shape.

---

## Open Questions (RESOLVED)

1. **Should single-rule creation via UI write the simple shape or the compound shape?** (RESOLVED)
   - Resolution: Always write the compound shape `{ combinator: 'AND', rules: [{ fieldId, operator: 'equals', values }] }` for all new rules created via UI. Plan 01 and Plan 02 implement this — the evaluator's backward-compat path handles old simple-shape data, and new data is always compound. No branching in the writer path.

2. **Should piping be shown in builder labels during editing (not just preview)?** (RESOLVED)
   - Resolution: Per D-12, piping tokens are displayed as raw `{fieldId}` in the label editor with a tooltip hint. Tokens are NOT substituted in the builder view. Substitution only occurs in the public form renderer via `resolvePiping()`. Plan 02 Task 2 implements the piping hint below the label input.

3. **Operator scope in Phase 2 UI** (RESOLVED)
   - Resolution: Per D-02, the UI exposes four operator labels: "Is" (equals), "Is not" (not_equals), "Is one of" (equals with multiple values), "Is not one of" (not_equals with multiple values). The data model uses only `equals` and `not_equals` operators — "is one of" / "is not one of" are achieved through multi-value `values: string[]` arrays. Plan 02 Task 1 implements multi-value input (checkboxes for choice fields, comma-separated text for free-text fields).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | vitest.config.ts (root) |
| Quick run command | `npx vitest run lib/survey-logic.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOGIC-01 | `isFieldVisible` returns false when AND rule not met | unit | `npx vitest run lib/survey-logic.test.ts` | Wave 0 — new tests needed |
| LOGIC-01 | `isFieldVisible` returns true when all AND rules met | unit | `npx vitest run lib/survey-logic.test.ts` | Wave 0 |
| LOGIC-01 | `isFieldVisible` backward-compat: old simple shape still works | unit | `npx vitest run lib/survey-logic.test.ts` | Wave 0 |
| LOGIC-01 | `isFieldVisible` with `not_equals` operator | unit | `npx vitest run lib/survey-logic.test.ts` | Wave 0 |
| LOGIC-01 | `isFieldVisible` with multi-value equals (is one of) | unit | `npx vitest run lib/survey-logic.test.ts` | Wave 0 |
| LOGIC-02 | `resolvePiping` replaces answered token | unit | `npx vitest run lib/survey-logic.test.ts` | Wave 0 |
| LOGIC-02 | `resolvePiping` renders empty string for unanswered token per D-10 | unit | `npx vitest run lib/survey-logic.test.ts` | Wave 0 |
| LOGIC-02 | `resolvePiping` is a no-op on strings with no tokens | unit | `npx vitest run lib/survey-logic.test.ts` | Wave 0 |
| LOGIC-03 | Flow diagram out of scope for Phase 2 | -- | -- | N/A |

### Sampling Rate

- **Per task commit:** `npx vitest run lib/survey-logic.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `lib/survey-logic.test.ts` — add compound AND and piping tests (file exists from Phase 1; needs new test cases appended)

*(Existing file from Phase 1 has 10 tests for the simple evaluator — these pass. New compound + piping tests will be added, not replace.)*

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `lib/survey-logic.ts`, `lib/db/schema.ts`, `components/admin/SurveyBuilder.tsx`, `app/s/[slug]/page.tsx`
- `.planning/phases/01-foundation-and-schema/01-01-SUMMARY.md` — confirmed Phase 1 completion state
- `package.json` — confirmed dependency versions

### Secondary (MEDIUM confidence)
- `npm view @xyflow/react` — confirmed version 12.10.2, peer deps `react >= 17` (compatible with React 19.2.3)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all confirmed in package.json
- Architecture: HIGH — based on direct code inspection of all affected files
- Pitfalls: HIGH — derived from actual schema/code patterns in codebase
- Evaluator design: HIGH — union type pattern is established TypeScript practice; backward-compat requirements are clear from stored JSON shape

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (stable domain; no fast-moving dependencies involved)
