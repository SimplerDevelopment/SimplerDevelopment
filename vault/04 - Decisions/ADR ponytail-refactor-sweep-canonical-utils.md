---
type: adr
domain: dx
status: accepted
date: 2026-06-23
sources:
  - lib/publishing/slug.ts
  - lib/utils/money.ts
  - lib/utils/bytes.ts
  - lib/utils/html.ts
  - lib/mcp/types.ts
  - lib/decks/publish-slide.ts
  - lib/plugins/handlers/content-tools/dispatch.ts
  - lib/plugins/handlers/content-tools/runner.ts
  - CLAUDE.md
  - commit 5e8deab3 (refactor(slug): collapse ~43 inline slugifiers into canonical lib/publishing/slug)
  - commit c8d79f49 (refactor(utils): canonical formatMoney + formatBytes; collapse ~35 local copies)
  - commit c8aa2f0d (refactor(utils): extract single canonical escapeHtml to lib/utils/html)
  - commit 79332a52 (refactor(mcp): dedupe json/denied helpers into canonical lib/mcp/types)
  - commit 372ccbad (refactor(decks): collapse duplicate decks-publish into single source)
  - commit 830e79ec (fix(plugins): complete content-tools rename — repoint dead module paths)
  - commit 477f9e32 (chore(dead-code): remove 32 knip-verified unused files)
  - commit 2b99dd54 (docs(agents): require prompt-revision + /grill-me for complex requests)
---

# ADR: Ponytail refactor sweep — canonical utilities + dead-code removal

## Status

Accepted — branch `ponytail/refactor-sweep`, 2026-06-23.

## Context

Across the ~357k-line monorepo, utility logic for slug generation, money formatting,
byte formatting, HTML escaping, MCP response helpers, and deck-publish helpers had
accreted as inline or per-file copies — approximately 110 duplicated implementations
in total. Duplicate logic diverges silently: different slug normalizations produce
different URL shapes for the same input; different currency formatters produce different
display strings for the same amount. Additionally, a directory rename
(`postcaptain-tools/` → `content-tools/`) had been completed incompletely: the
plugin-callback route's side-effect import and several test module paths still pointed
at the deleted directory. Because `tsc` does not check side-effect imports (no bindings),
the project typechecked clean while the plugin-handler registry silently failed to
populate at runtime. Finally, knip identified 40 unreferenced files; 32 were verified
truly dead after completing the rename.

## Decision

### 1. Canonical utility singletons

Each utility is now a single source of truth. All callers import from the canonical
location; no inline copies remain for the covered cases.

| Canonical file | Function | What collapsed onto it |
|---|---|---|
| `lib/publishing/slug.ts` (13 lines) | `slugify(input, maxLength=100)` | ~43 inline slugifiers across MCP tools, brain, AI portal-tools, portal/admin pages, API routes |
| `lib/utils/money.ts` (18 lines) | `formatMoney(cents, {currency?, fractionDigits?})` | ~28 local `formatCurrency`/`formatMoney`/`formatPrice` copies |
| `lib/utils/bytes.ts` (9 lines) | `formatBytes(bytes)` | 7 local `formatFileSize`/`formatBytes` copies |
| `lib/utils/html.ts` (21 lines) | `escapeHtml(str)` | Multiple MCP and server-render copies |
| `lib/mcp/types.ts` (196 lines) | `jsonOk`, `jsonError`, `denied` response helpers | Duplicated per-tool MCP response boilerplate |
| `lib/decks/publish-slide.ts` (87 lines) | `publishOneSlide`, `applyPublishToSlides`, `applyPublishAllToSlides` | Duplicate publish logic that had diverged between the MCP layer and REST routes |

**Intentional exclusions** — the following were deliberately NOT collapsed because they
serve a different semantic domain:

- `slugify`: snake_case field-key sanitizers, email-prefix sanitizers, download
  filenames, and the per-keystroke `sanitizeSlugInput` (a UX formatter, not a slug
  generator) retain their own implementations.
- `formatMoney`: `RoiCalculator` (compact `$K`/`$M` notation on dollar amounts, not
  cents), and three onboarding `"$N/mo"` subscription-plan helpers.
- `formatBytes`: the `mcp-usage` SI/decimal network-bytes counter (binary vs. decimal
  semantics differ; conflating them would produce wrong display values).

### 2. Slug normalization: NFKD diacritic-stripping adopted everywhere

`slugify` now strips diacritics via NFKD decomposition before slug generation. This
changes NEW slugs only — already-stored rows are unaffected (e.g. a post whose slug was
`cafe` remains `cafe`; a new post titled "Café" now also produces `cafe` instead of the
previous `caf` truncation). The behavior is consistent across the ~43 former callsites.

Per-site caps are preserved: subdomain slugs are capped at 63 characters (DNS limit);
upload slugs at 80. The canonical `maxLength` default of 100 covers the general case.

### 3. Money formatting: Intl.NumberFormat adopted everywhere

`formatMoney` wraps `Intl.NumberFormat`. Former bare-string formatters (e.g.
`"$" + (cents/100).toFixed(2)`) produced `"$1234.56"`; `Intl` produces `"$1,234.56"`.
This is a consistent display improvement. Whole-dollar display uses `fractionDigits: 0`;
storefront multi-currency display passes `{currency}` to get locale-correct symbols and
separators.

### 4. Plugin handler rename: `postcaptain-tools` → `content-tools` completed

The directory rename was completed by repointing all module import paths
(`lib/plugins/handlers/content-tools/` is now the canonical path for all handler
modules). The plugin identity slug `'postcaptain-tools'` is preserved in the DB and
in the runtime registry — it is the public contract with the remote plugin origin.

**Key lesson:** a clean `tsc --noEmit` does NOT prove side-effect imports resolve.
`import '@/lib/plugins/handlers/postcaptain-tools/index'` (no binding, just a
registry side-effect) silently vanishes from the type-graph. Directory renames must be
verified by grepping for module path strings across the whole codebase, not by
relying on typecheck alone. After this fix, 99 previously-broken plugin unit tests
passed.

### 5. Dead code: 32 knip-verified files deleted

Files were deleted only after per-file static reference checks (import, dynamic import,
`next/dynamic`, lazy, string registry, barrel re-export). Deleted categories:

- `components/three/` — 9 decorative R3F components (zero importers; the `<Scene>`
  usages elsewhere are local inline components, not imports of `three/Scene`). The
  remaining 10 files in `components/three/` are live.
- `components/product-designer/` — 14 leftover island files from the designer removal.
  The directory retains ~46 live files.
- 7 orphaned singles: `components/blocks/visual/ResponsiveSettings`,
  `components/brain/GlossaryLookupChip`,
  `components/portal/BrainDashboardWidgets` (superseded by `brain-dashboard/`),
  `components/portal/comments/{CommentsButton,CommentSidebar}`,
  `components/portal/SuggestedProjectsModal`,
  `components/portal/voice/VoiceAssistant`.
- `lib/brain/index.ts` — dead barrel; all consumers already imported sub-modules
  directly.
- `lib/printing/upscale.ts` — orphaned after `scripts/magamommy` removal.

Post-deletion: typecheck exit 0, knip reports 0 unused files, no tests reference any
deleted file.

### 6. Prompt intake rule added to CLAUDE.md

A "Prompt intake" section was added requiring that complex or cross-cutting prompts
trigger two pre-work steps before any planning or editing: (1) restate the request
grounded in the current actual state of the codebase (not training priors), and (2)
auto-invoke `/grill-me` to resolve open decision branches. Trivial or fully-specified
single-file work is exempt. This rule is in `CLAUDE.md` (project root).

## Consequences

- **New invariant:** any new slug-generating, money-formatting, byte-formatting, or
  HTML-escaping code must use the canonical utility. Do not add a new inline copy.
- **New invariant:** MCP tool handlers must import `jsonOk`/`jsonError`/`denied` from
  `lib/mcp/types.ts`.
- **New invariant:** Deck-publish helpers must be imported from
  `lib/decks/publish-slide.ts`; no per-route re-implementation.
- **New invariant:** Plugin handler modules live under
  `lib/plugins/handlers/content-tools/` — `postcaptain-tools/` is gone.
- **Behavioral change (approved):** `Intl.NumberFormat` grouping separators now appear
  in all money-formatted strings. Any UI that previously displayed `$1234.56` now
  displays `$1,234.56`.
- **Behavioral change (new content only):** NFKD slugs strip diacritics on new slug
  generation. Existing slugs in the DB are unaffected.
- **Deferred:** knip's unused-dependency list (~22 packages) was skipped — platform
  binaries like `@next/swc-darwin-x64` are false positives; a separate reviewed pass
  is needed. Also deferred: a ~269-site `fetch`/API-envelope wrapper consolidation
  (needs an error-handling contract decision) and a `useDebounce` hook (~11 hand-rolled
  sites).
- **tsc does not gate side-effect imports.** Any future directory rename must be
  verified with `grep -r 'old-dir-name' .` across the codebase, not just `tsc`.

## Alternatives considered

- **Leave duplicates in place, add a lint rule.** Rejected: a lint rule preventing new
  copies does not remove existing divergence; callers already exhibit different
  normalization behaviors that cause real inconsistency in stored data.
- **Single utilities barrel (e.g. `lib/utils/index.ts`):** Rejected in favor of named
  per-concern modules (`slug.ts`, `money.ts`, `bytes.ts`, `html.ts`) to keep imports
  readable and to match the existing per-domain-drizzle-schema pattern.
- **Collapse unused-dependency list in the same sweep.** Deferred because platform
  binary packages require manual review to distinguish false positives from genuine
  removable deps; mixing dependency removal with the utility refactor raises blast
  radius.

## Related

- [[ADR lint-staged-only]] — staged-files lint clears baseline debt in touched files
  during this sweep; each refactor commit also fixed pre-existing lint violations in
  the files it modified.
- [[ADR typecheck-committed-head]] — explains why a clean tsc passed silently on the
  broken side-effect import (tsc does not resolve side-effect-only imports).
- [[Plugins & Extension]] — `content-tools/` handler path and the 99-test fix.
- [[Pitch Decks & Product Designer]] — `lib/decks/publish-slide.ts` canonical source.
- [[Sites, Hosting & Publishing]] — `lib/publishing/slug.ts` canonical source.
- [[CMS & Blocks]] — slug and money utilities used across block and CMS tooling.
