# Phase 2: Conditional Logic UI and Piping - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Visual rule builder for showIf/conditionalOptions in SurveyBuilder and answer piping token support. Users can configure conditional field visibility rules without writing code, and reference prior answers in question text using piping tokens. Flow diagram visualization (LOGIC-03) is deferred to Phase 6.

</domain>

<decisions>
## Implementation Decisions

### Rule Builder UX
- **D-01:** Conditional logic controls live in a collapsible section inside the existing field accordion (not a modal or slide-out panel)
- **D-02:** Basic comparison operators only: equals, not equals, is one of, is not one of
- **D-03:** Trigger field dropdown limited to fields on earlier pages or above the current field — prevents circular dependencies
- **D-04:** Conditional fields show a small badge icon with rule summary on hover (tooltip)

### Compound Conditions
- **D-05:** Multiple rules on a field are AND'd together (no OR toggle). Covers 90% of use cases with simpler UI
- **D-06:** No limit on number of rules per field — unlimited "Add rule" capability with scrollable list
- **D-07:** conditionalOptions keeps single-dependency model (one trigger field maps values to option sets) — current schema shape is sufficient

### Piping Syntax & Display
- **D-08:** Token format is `{fieldId}` using single curly braces and the internal field ID (not labels)
- **D-09:** Piping supported in question labels and helpText fields only — not thank-you pages, placeholders, or option labels
- **D-10:** Unanswered piped tokens render as empty string (blank) — text reads naturally with gap

### Builder Preview Behavior
- **D-11:** Builder always shows all fields. Conditional fields rendered with reduced opacity and a conditional badge. No interactive preview mode — users can always see and edit all fields
- **D-12:** Piping tokens displayed as raw `{fieldId}` in the label editor with a tooltip on hover showing the referenced field label. No rich-text or chip rendering needed

### Claude's Discretion
- Exact styling of the conditional badge and dimmed opacity level
- Layout of the "Add rule" button and rule row arrangement
- Tooltip implementation details
- How to insert piping tokens (manual typing vs helper button)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Shared Logic
- `lib/survey-logic.ts` — isFieldVisible() and getConditionalOptions() evaluators. Phase 2 UI must produce showIf structures these functions consume
- `lib/survey-logic.test.ts` — Existing test suite for condition evaluation. Extend with compound AND tests and piping tests

### Field Schema
- `lib/db/schema.ts` (SurveyFieldDef interface, ~line 1798) — showIf, conditionalOptions, goToPage type definitions. showIf schema needs extending from `{ fieldId, values }` to support multiple AND'd rules

### Builder Component
- `components/admin/SurveyBuilder.tsx` — Field accordion editor. Add conditional logic section here. Already has expandedId state and field type helpers

### Public Form Renderer
- `app/s/[slug]/page.tsx` — Public survey form. Already imports isFieldVisible. Add piping token substitution to label/helpText rendering

### Requirements
- `.planning/REQUIREMENTS.md` — LOGIC-01 (showIf rule builder), LOGIC-02 (piping tokens). LOGIC-03 (flow diagram) is Phase 6

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `isFieldVisible()` in `lib/survey-logic.ts`: Already evaluates showIf — Phase 2 extends the schema it consumes, not the function signature
- `getConditionalOptions()` in `lib/survey-logic.ts`: Single-dependency conditional options, no changes needed
- SurveyBuilder field accordion pattern: Collapsible sections per field with expandedId state — add conditional logic section alongside existing sections
- `isConditionalPending()` pattern in portal forms: Shows placeholder when dependency not answered — reusable concept for piping fallback

### Established Patterns
- Tailwind CSS with semantic color tokens (primary, destructive, muted-foreground)
- Material Icons for UI elements (not emojis)
- Local state with onChange callback to parent for field mutations
- Field IDs are immutable after creation (Math.random().toString(36).slice(2, 10))
- Answer values coerced to strings for comparison in visibility checks

### Integration Points
- SurveyBuilder.tsx field editor: New collapsible "Conditional Logic" section per field
- SurveyFieldDef.showIf type: Extend from single rule to array of AND'd rules
- Public form renderer label/helpText: Add piping token substitution before rendering text
- Builder field header: Add conditional badge indicator next to existing required badge

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-conditional-logic-ui-and-piping*
*Context gathered: 2026-04-07*
