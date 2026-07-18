# Rubric, gates, and routing

The **live** rubric values are in `.sd/qa-rubric-learnings.md` (they came from the user's survey and can change). This file is the durable structure + the per-card checklist. If the two ever disagree, the ledger wins.

## The six gates (all must hold at ≥95% to reach Approved)

| Gate | Passes when… | Common failure |
|---|---|---|
| **G1 Intent** | The fix does what the user actually wanted, not just the literal card text. | Card is terse and the real intent is ambiguous → **don't guess, mark NEEDS-YOU**. |
| **G2 Both surfaces** | Correct in the editor canvas AND on the published/preview render. | Works in editor, breaks on the prod render path (the classic editor-vs-renderer seam). |
| **G3 All viewports** | Desktop + tablet + mobile look right (where the card affects layout). | Fix assumes desktop; tablet/mobile break or ignore it. |
| **G4 Both themes** | Light and dark both render correctly. | Hardcoded color that only works in one theme. |
| **G5 Evidence** | A Playwright screen recording of the interaction is attached. | Only a still, or no capture — insufficient. |
| **G6 No adjacent regressions** | Target block + visually-adjacent blocks unaffected. | Fix leaks styling/layout onto a neighbor. |

**Confidence rule:** below ~95% on any gate → **NEEDS-YOU**, never a soft pass. The user chose a high bar deliberately; throughput is not worth a wrong approval.

## Verdict routing

- **PASS** (all gates, ≥95%) → move the card to the **Approved** lane. The human taps the final Ship; **never auto-Ship**.
- **FAIL / NEEDS-YOU** → leave in **Validating**, append an annotation naming the exact gate that failed or what's blocking (e.g. "NEEDS-YOU: G2 — renders in editor, 404 on prod page"; "FAIL: G4 — dark mode text invisible").
- **Taste/subjective cards** → **auto NEEDS-YOU**. Don't spend gates on them; they need the user's gut. Still record the user's decision in the Learnings Log.

Deliver one **PASS / FAIL / NEEDS-YOU** table; row = card SKU · verdict · deciding gate(s) · evidence link.

## Ticket types → which gates are material

Classify each card first; it tells you where to spend effort.

- **Mechanical / correctness** (delete buttons, muted controls, keyboard shortcuts): G1, G2, G6 primary; G3/G4 usually trivially pass but spot-check; the recording is the click/interaction.
- **Editor-visual** (a control now appears / a field is rich-text / a panel section): G2(editor) + G3 + G4 heavy; G2(prod) if it also changes render.
- **Prod-render** (something now renders correctly on the published page): G2(prod) is the crux — verify the rendered page, not just the editor.
- **Taste** (spacing, defaults, consistency): auto NEEDS-YOU regardless of the other gates.

## Per-card checklist (run top to bottom)

1. Classify the ticket type (above).
2. Read the card's own RC/Dx note + any prior Learnings Log entry for it.
3. Open the block in the editor; reproduce the fix's interaction; **start the Playwright recording**.
4. **G1**: does the result match the user's actual intent? Ambiguous → NEEDS-YOU, stop.
5. **G2**: editor canvas correct? Then load the published/preview page (self-mint token if draft) — correct there too?
6. **G3**: switch desktop → tablet → mobile in the editor/preview; still correct?
7. **G4**: toggle light/dark; still correct?
8. **G6**: glance at the neighboring blocks — anything leaked?
9. Score at 95%. Save the recording; note its path.
10. Route the card; append to the Learnings Log after the user reacts.

## Bootstrapping the rubric (only if `.sd/qa-rubric-learnings.md` is missing)

The rubric is the user's call, not a default. Capture it durably:

1. Build a short SimplerDevelopment survey (`surveys_create`) with one question per rubric knob: definition of "approved" (literal vs intent vs polished), ambiguity handling, verification surface (editor vs +prod), required viewports, themes, evidence type, taste-card handling, regression scope, PASS authority (auto-ship vs approved-lane), fail handling, cadence, priority ticket-types, confidence threshold. Activate it, share the `/s/<slug>` link.
2. On submission (`surveys_list_responses`), compile answers into `.sd/qa-rubric-learnings.md`: the gate definitions above (adjusted to the answers), an on-paper pre-screen of the current Validating cards (type + current evidence + gate-gap each), and an empty **Learnings Log**.
3. Only then start verifying cards.
