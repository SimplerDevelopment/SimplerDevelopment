# Phase 2: Conditional Logic UI and Piping - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 02-conditional-logic-ui-and-piping
**Areas discussed:** Rule builder UX, Compound conditions, Piping syntax & display, Builder preview behavior

---

## Rule builder UX (from checkpoint — 2026-04-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Section in expanded editor | Collapsible section inside existing field accordion | ✓ |
| Slide-out panel | Separate panel that slides from the side | |
| Modal dialog | Pop-up modal for rule configuration | |

**User's choice:** Section in expanded editor
**Notes:** Keeps conditional logic close to the field being edited

| Option | Description | Selected |
|--------|-------------|----------|
| Basic set | equals, not equals, is one of, is not one of | ✓ |
| Extended set | Basic + greater than, less than, contains, starts with | |
| You decide | Claude picks | |

**User's choice:** Basic set

| Option | Description | Selected |
|--------|-------------|----------|
| Dropdown of earlier fields | Fields on earlier pages/above only | ✓ |
| Dropdown of all fields | All fields regardless of position | |
| You decide | Claude picks | |

**User's choice:** Dropdown of earlier fields — prevents circular dependencies

| Option | Description | Selected |
|--------|-------------|----------|
| Badge + tooltip | Small icon with rule summary on hover | ✓ |
| Badge only | Icon with no hover info | |
| No indicator | No visual distinction | |

**User's choice:** Badge + tooltip

---

## Compound conditions

| Option | Description | Selected |
|--------|-------------|----------|
| AND-only groups | Multiple rules are all AND'd together. No OR toggle | ✓ |
| AND/OR toggle per group | User can switch between AND/OR logic | |
| Nested groups | Full AND/OR nesting with sub-groups | |

**User's choice:** AND-only groups
**Notes:** Simpler UI, covers 90% of use cases

| Option | Description | Selected |
|--------|-------------|----------|
| Up to 3 rules | Add more disabled after 3 | |
| Up to 5 rules | More flexible | |
| Unlimited | No cap, scrollable list | ✓ |

**User's choice:** Unlimited

| Option | Description | Selected |
|--------|-------------|----------|
| Single dependency | One trigger field maps values to option sets | ✓ |
| Compound dependency | Options change based on multiple fields | |

**User's choice:** Single dependency — current schema sufficient

---

## Piping syntax & display

| Option | Description | Selected |
|--------|-------------|----------|
| {fieldId} with curly braces | Uses internal field ID, simple, no collisions | ✓ |
| {{Field Label}} double curly | Human-readable but breaks on rename | |
| Insertable token chip | Styled chip in editor, stored as fieldId | |

**User's choice:** {fieldId} with curly braces

| Option | Description | Selected |
|--------|-------------|----------|
| Labels and help text only | Question labels and helpText fields | ✓ |
| Labels, help text, and thank-you | Also substitutes in thank-you page | |
| Everywhere text appears | All text fields including placeholders and options | |

**User's choice:** Labels and help text only

| Option | Description | Selected |
|--------|-------------|----------|
| Show blank | Token replaced with empty string | ✓ |
| Show placeholder text | Token replaced with "[Field Label]" | |
| Hide the entire element | Hide label/help text until referenced field answered | |

**User's choice:** Show blank

---

## Builder preview behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Show all, dim conditional | All fields visible, conditional ones at reduced opacity with badge | ✓ |
| Interactive preview mode | Separate preview tab with simulated input | |
| Both | Dimmed default plus toggle for interactive preview | |

**User's choice:** Show all fields, dim conditional ones

| Option | Description | Selected |
|--------|-------------|----------|
| Raw token with tooltip | Show {fieldId} as-is, tooltip shows referenced field label | ✓ |
| Styled inline chip | Colored chips showing field label in editor | |

**User's choice:** Raw token with tooltip

---

## Claude's Discretion

- Exact styling of conditional badge and dimmed opacity
- Rule row layout and Add rule button placement
- Tooltip implementation details
- Piping token insertion mechanism (manual typing vs helper)

## Deferred Ideas

None
