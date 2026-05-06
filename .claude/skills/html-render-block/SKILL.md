---
name: html-render-block
description: Edit and manage HTML-render block JSON exported from a SimplerDevelopment pitch deck or page. Use when the user pastes a JSON object that has `"type": "html-render"` and `html`, `fields`, `values` keys, or asks to "edit my block JSON", "update this pitch deck block", "translate this block", "rename a field", "add an item to my block", "fix my block content", "change the headline in this block JSON", or any request that operates on the block JSON copied out of the portal's "Full block JSON (export / import)" panel.
user-invocable: true
allowed-tools: Read, Write, Edit
---

# html-render-block

Helps non-developer users edit the JSON that backs an HTML-render block in the SimplerDevelopment portal — the same JSON exposed by the **Full block JSON (export / import)** panel in the block's right-side settings.

## Workflow this skill is designed for

1. User opens a pitch deck or page in the portal, clicks an HTML-render block.
2. In the right panel, scrolls to **Full block JSON (export / import)** and clicks **Copy JSON**.
3. Pastes that JSON into Claude.
4. Asks for an edit (change copy, swap an image, add a card, translate, rename a field, etc.).
5. Claude returns the **complete** modified JSON in a fenced code block.
6. User copies it back into the panel textarea and clicks **Apply**.

The user is round-tripping JSON through Claude. **Output must be ready to paste back as-is.** Anything else breaks their workflow.

## When this is the right tool

Trigger on either of these signals, in any order:

- The user message contains a JSON object whose top level includes `"type": "html-render"` (often with `html`, `fields`, `values` siblings). It may be wrapped in a code fence, or pasted raw.
- The user mentions editing / managing / translating / renaming inside an "HTML-render block", "block JSON", "pitch deck block", or "the full block JSON".

If the user pastes a different kind of JSON (e.g. a full deck, a page's block array, a CRM object), this skill is **not** the right tool — explain politely and ask them to paste a single html-render block.

## The JSON shape

A valid export looks like:

```json
{
  "version": 1,
  "type": "html-render",
  "width": "full",
  "html": "<div class=\"slide\">...</div>",
  "fields": [
    { "name": "headline", "label": "Headline", "type": "text" },
    { "name": "body",     "label": "Body",     "type": "textarea" },
    { "name": "cta_url",  "label": "CTA URL",  "type": "url" }
  ],
  "loop": null,
  "values": {
    "headline": "Most companies don't have a marketing problem.",
    "body": "I figure out what's actually driving growth…",
    "cta_url": "https://form.typeform.com/to/xyz"
  }
}
```

Top-level keys:

| Key | What it is | Notes |
|---|---|---|
| `version` | Schema version, always `1` today | Preserve verbatim. |
| `type` | Always `"html-render"` | Preserve verbatim. |
| `width` | `"full"` or `"contained"` | Visual width on the page. |
| `html` | The HTML template string | May contain `{{name}}` placeholders and `data-field="name"` markers — these are wired to `fields`/`values`. |
| `fields` | Schema array — what variables exist + their input type | See "Field types" below. |
| `loop` | Optional dynamic-content config or `null` | Don't add or remove unless asked. |
| `values` | The actual content, keyed by field `name` | The most common edit target. |

### Field types

`fields[].type` is one of:

- **Scalar**: `text`, `textarea`, `richtext`, `number`, `boolean`, `url`, `image`, `color`, `date`, `datetime`, `select`, `radio` — the matching value in `values` is a **string**. Booleans serialize as `"true"` / `"false"`. Numbers serialize as strings too.
- **`array`** — value is `Array<Record<string, string>>`. Sub-shape is described by `field.itemFields[]`. Used for repeated cards, list items, etc.
- **`group`** / **`link`** — value is a single `Record<string, string>`. `link` has hard-coded sub-fields `{ url, label, target }`.
- **`tab`** — pure organizer. No matching value. Splits the editor form into tabs but doesn't render anything.

### How `html`, `fields`, and `values` connect

- `{{headline}}` in `html` substitutes from `values.headline`. If the field is `richtext`, the substitution is treated as HTML; otherwise it's escaped.
- `data-field="headline"` on an element makes that element's inner HTML the editable surface for `values.headline` (used inline in the visual editor).
- `data-repeat="cards"` on an element repeats it once per item in `values.cards` (an array). Inside the repeat, `{{cards.title}}` resolves to the current item's `title`.
- `data-group="cta"` on an element wraps a single nested object. `{{cta.url}}` reads from `values.cta.url`.
- `<img src="{{logo}}">` — the renderer auto-annotates these so the image is editable.

When you change a field's `name`, you must rename **every** reference: in `fields`, in `values`, and inside `html` (`{{old_name}}` and `data-field="old_name"`, plus dotted forms like `{{old_name.subfield}}` and `data-repeat="old_name"`).

## Common operations

Pattern: read the user's request, modify the smallest part necessary, return the **whole** JSON.

### 1. Change copy / swap an image

User: "change the headline to 'Stop guessing, start deciding.'"

Touch only `values.headline`. Don't reformat the HTML, don't reorder fields, don't change unrelated values.

### 2. Translate content

User: "translate everything to Spanish."

Touch only string entries in `values` (and only the human-readable ones — leave URLs, image paths, slugs untouched). Don't translate field names or labels unless asked.

### 3. Add an item to an array field

User: "add a fifth offering with title 'Workshops'."

Inspect the matching `field` in `fields` to find its `itemFields` shape. Append a new record to the array in `values` with all the sub-keys present (use empty strings for fields the user didn't specify). Don't change `fields` itself unless asked.

### 4. Rename a field

User: "rename `o4_title` to `o4_name`."

Three places: the field entry in `fields[]` (change `name`), the key in `values{}`, and **every** reference in `html` — including `{{o4_title}}` and any `data-field="o4_title"`. Confirm by re-reading the new HTML and checking nothing references the old name.

### 5. Add a new field

User: "add a `read_time` text field with label 'Read time'."

Two places: append to `fields[]` and (optionally) seed `values.read_time` with an empty string or a default. Tell the user they'll also need to add `{{read_time}}` to the HTML if they want it rendered — don't guess where it goes unless they say.

### 6. Edit the HTML template

User: "wrap the headline in an `<h1>` tag" / "fix the typo in the closing div".

Edit `html` only. Be careful with `{{...}}` placeholders and `data-*` attributes — those are load-bearing and easy to break. Don't reformat the whole template; preserve the user's existing indentation and class names.

### 7. Validate / lint

User: "is this valid?" / "anything wrong with my block?"

Check:
- Every `{{name}}` and `data-field="name"` (and dotted variants) in `html` has a matching entry in `fields[]`.
- Every key in `values` corresponds to a field — orphan values are kept by the renderer but flag them as unused.
- Field names are URL-safe identifiers: `^[a-zA-Z_][a-zA-Z0-9_-]*$`.
- `array` field values are arrays; `group` / `link` field values are objects; everything else is a string.
- `loop.source` is `"posts"` if loop is present.

Report issues plainly. Don't auto-fix unless asked.

## Output rules

These are **non-negotiable** — the user's whole workflow depends on them.

1. **Always emit the complete JSON object**, including unchanged fields. Never partial diffs, never "just the changed values". The user pastes your output into a textarea that overwrites the entire block.
2. **Wrap the JSON in a single fenced code block** with the language tag `json`. No commentary inside the fence. Free-form explanation goes before or after the fence.
3. **Pretty-print with 2-space indentation.** Match the export format the user pasted in.
4. **Preserve unknown keys.** If the pasted JSON has a key you don't recognize, keep it untouched in the output. Future portal versions may add fields; dropping them would corrupt the block.
5. **Never invent values.** If the user asks for content you don't have ("set the headline to whatever sounds good"), ask one short clarifying question rather than fabricating copy.
6. **One block per output.** If the user pastes multiple blocks, ask which one to edit first.

Example output structure:

> Updated `cover_headline` and `cover_punchline`. Paste this back into the **Full block JSON** panel and click **Apply**.
>
> ```json
> { "version": 1, "type": "html-render", ... }
> ```
>
> If you want me to also update the Spanish version of those strings, paste that block too.

## What NOT to do

- **Don't strip the `version` or `type` keys.** The portal's Apply button validates these.
- **Don't change `fields[].name` without also updating `values` and `html`.** That breaks the block silently — the field still renders but with no value.
- **Don't switch a field's `type` casually.** Going from `text` → `richtext` is fine; `text` → `array` requires restructuring `values` and `html`. Confirm before changing types.
- **Don't reformat the HTML template** beyond what the user asked. Indentation, class order, comment placement — leave them alone.
- **Don't fetch / browse / search.** This skill is offline-only; you don't have access to the user's site, deck, or images.
- **Don't ask the user to run code.** They aren't a developer. They want to copy a JSON blob, get a new one back, and paste it.

## When something is genuinely unclear

Ask one focused question — not a list. Examples:

- "I see five offerings — should I add the new one at the end, or in a specific position?"
- "Do you want me to translate the field labels too, or only the values shown to readers?"
- "The image path looks like an S3 key, not a URL. Want me to leave it as-is, or do you have a new key?"

Then wait for the answer before producing JSON. A wrong guess wastes a round trip.

## Installation (for the client)

Drop this file at `~/.claude/skills/html-render-block/SKILL.md` (create the directory if it doesn't exist). Restart Claude Code, or open a new chat at claude.ai with this skill enabled. The skill will trigger automatically when JSON containing `"type": "html-render"` is pasted, or when the user mentions editing the block JSON.
