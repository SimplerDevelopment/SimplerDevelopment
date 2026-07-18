# Smoke-test harness — sd-* skills

A standalone Bun script that runs a SimplerDevelopment content-authoring skill
end-to-end against the **local** MCP, captures the output, and asserts the
audit-pass markers we shipped in `.claude/skills/CHANGELOG.md` actually land in
real output.

It's not a vitest test — it needs `bun dev` running so the MCP route at
`localhost:3000/api/mcp` is reachable, and it makes a real Anthropic API call
(uses ~$0.05–$0.30 per run depending on model).

## Prereqs

- `bun dev` running on `localhost:3000` (the local SD portal + MCP)
- A local Postgres seeded with the SD tenant (`simplerdev_local_20260514` by default)
- `ANTHROPIC_API_KEY` in env (Claude API call)
- A `sd_mcp_*` portal API key for the test tenant (see "Seed a key" below)

## One-time setup — seed a key

The script can mint a fresh API key for the SD tenant (client_id=104, user_id=181 by default):

```bash
export SD_PORTAL_API_KEY=$(bun run smoke:skills:seed-key)
```

That generates a new `sd_mcp_*` key, inserts it into `portal_api_keys`, and
prints the raw value once to stdout (key hashes are stored — the raw key isn't
recoverable from the DB later).

If you want a gated key (every mutation stages as a `pending_change`):

```bash
bun run smoke:skills:seed-key --require-approval true
```

## Run the smoke test

```bash
bun run smoke:skills                              # default: sd-create-page, Sonnet 4.6
bun run smoke:skills -- --model opus              # use Opus 4.7 for highest fidelity
bun run smoke:skills -- --prompt "Custom prompt"  # override the synthetic user prompt
bun run smoke:skills -- --no-cleanup              # keep the test post for manual inspection
```

The harness:

1. Loads `.claude/skills/<skill>/SKILL.md` as the agent's system prompt.
2. Pulls the MCP tool catalog from `localhost:3000/api/mcp` via `tools/list`.
3. Sends a synthetic user prompt to Claude with the MCP tools wired up.
4. Loops on `tool_use` — forwards every MCP call through the local server.
5. Captures the final agent text + the full tool-call trace.
6. Asserts the audit markers:
   - **`design-system-preamble`** — "Design system: ... Palette ..." block in final text.
   - **`approval-url-leading`** — `Approval URL: https://...` within first 600 chars.
   - **`fourteen-day-expiry-disclosure`** — `expires in 14 days` near the URL.
   - **`posts-create-called`** — at least one `posts_create` call.
   - **`published-false`** — `posts_create` called with `published: false`.
   - **`hero-hygiene-when-present`** *(advisory)* — if a hero block is authored, all 5 fields populated.
   - **`five-dim-self-review`** — Philosophy / Hierarchy / Craft / Functionality / Originality all named in final text.
   - **`no-invented-numbers`** *(advisory)* — stats-row blocks use `[STAT TBD]` placeholders rather than invented "200+" / "Trusted by" / "Fortune 500" claims.

Required markers gate exit code; advisory markers print a `⚠` but don't fail
the run.

7. Deletes the test post (`title LIKE '[smoke] %'`) unless `--no-cleanup`.

## Cleanup

If runs got aborted mid-flight and stale `[smoke] %` posts piled up:

```bash
bun run smoke:skills:cleanup -- --older-than-min 0     # deletes all smoke posts now
bun run smoke:skills:cleanup -- --older-than-min 60    # only ones >1 hour old
```

## Adding a marker set for another skill

Each skill in `MARKER_SETS` (in `scripts/smoke-sd-skills.ts`) is an array of
`AuditMarker`s. To add `sd-create-deck`:

```ts
const SD_CREATE_DECK_MARKERS: AuditMarker[] = [
  // reuse the universal ones
  ...SD_CREATE_PAGE_MARKERS.filter((m) => ['design-system-preamble', 'approval-url-leading', 'fourteen-day-expiry-disclosure', 'five-dim-self-review'].includes(m.name)),
  // deck-specific
  {
    name: 'speaker-notes-per-content-slide',
    required: true,
    check: ({ toolCalls }) => {
      const call = toolCalls.find((c) => c.name === 'decks_replace_slides');
      const slides: any[] = call?.input?.slides ?? [];
      const contentSlides = slides.filter((s) => s.layout !== 'title' && s.layout !== 'section');
      const missing = contentSlides.filter((s) => !s.notes || s.notes.trim().length === 0);
      return missing.length === 0
        ? null
        : `${missing.length} content slide(s) missing speaker notes.`;
    },
  },
  // ...etc
];

const MARKER_SETS = {
  'sd-create-page': SD_CREATE_PAGE_MARKERS,
  'sd-create-deck': SD_CREATE_DECK_MARKERS,
};
```

Then `bun run smoke:skills -- --skill sd-create-deck`.

## Limits / known issues

- The script puts the SKILL.md content into the system prompt. Real Claude
  Code agents load skills slightly differently (via the skill registry +
  user-invocable activation), so behavior may diverge marginally. The audit
  markers are written to be robust against either.
- The MCP currently lives on the same Postgres as production (per
  `SD_SKILLS_RUNBOOK.md` §6.2). Be careful what tenant you test against —
  default `--client-id 104` is the SD-internal SimplerDevelopment client.
- Each run costs API credits. Sonnet ≈ $0.05–$0.10, Opus ≈ $0.20–$0.40.
- The `posts_create` schema validation lives server-side; if you change the
  block schema, update the hero-hygiene marker to match.

## CI gate (future)

This script is intentionally NOT wired into `scripts/test.sh` yet — it costs
real API credits per run and needs the dev server + DB. To gate it on PRs:

1. Add a `smoke-skills` job to `.github/workflows/ci.yml`.
2. Boot `bun dev` + a Postgres in the job.
3. Mint a key, export `SD_PORTAL_API_KEY`, `ANTHROPIC_API_KEY` from secrets.
4. `bun run smoke:skills` — non-zero exit fails the job.

Only run on PRs that touch `.claude/skills/` to keep cost bounded.
