# E2E testing guide — `sd-*` content-authoring skills

**Audience:** anyone changing files under `.claude/skills/sd-*` or `.claude/skills/simplerdev-*`, or shipping a skill change to a client.

**Companion docs:** `tests/TESTING_PLAN.md` (overall layer strategy), `tests/CI-GATES.md` (coverage floors), `.claude/skills/SD_SKILLS_RUNBOOK.md` (operator handbook), `.claude/skills/CHANGELOG.md` (audit history), `scripts/smoke-sd-skills.README.md` (smoke harness usage).

**Last verified end-to-end:** 2026-05-20 against the local MCP at `localhost:3000/api/mcp` with database `simplerdev_realprod_dryrun`. The smoke harness ran 4 times, surfacing 3 distinct production issues, all now fixed.

---

## 1. Why a separate testing strategy for the skills?

The `sd-*` skills are **prompts, not code**. They live as Markdown in `.claude/skills/<name>/SKILL.md` and are read at agent-invocation time. That has two consequences for testing:

1. **You can't unit-test a prompt.** Output is non-deterministic; the model paraphrases instructions. A test that asserts exact strings is brittle.
2. **The bug surface is novel.** Skills can produce wrong output without failing any traditional test — the MCP call succeeds, the post lands in the database, the response *looks* fine, but the agent fabricated a post id, skipped a required step, or shipped a contrast failure that ends up white-on-cyan in production.

So this guide layers tests by **what each layer can prove**, not by mechanism:

| Layer | Tool | What it proves | Cost / run | Time |
|---|---|---|---|---|
| **Unit** | Vitest | Helper logic in the harness, schema validators, assertion regexes | $0 | seconds |
| **MCP integration** | Vitest + DB | The MCP tools the skills call return the right shapes | $0 | < 30 s |
| **Smoke (single skill)** | `scripts/smoke-sd-skills.ts` | The agent + skill + MCP produce output that hits the audit-pass markers | ~$0.30 | ~2 min |
| **Multi-skill flow** | Smoke harness extended | A chain (init → website → learn) produces a coherent state on disk + in DB | ~$2–$5 | ~15 min |
| **Approval-flow browser** | Playwright | Approval URLs the skill mints actually work end-to-end in a browser | $0 | ~1 min/case |
| **Visual acceptance** | Manual or `qa` skill | Final rendered pages match the brand + brief | varies | varies |

You **do not** need every layer for every change. The triage rule:

- Markdown edit to a single `SKILL.md`? Smoke is enough.
- Adding a new MCP tool that a skill will call? Integration first, then smoke.
- Changing the approval-link minting / approval route? Integration + approval-flow browser.
- Shipping a multi-skill workflow (e.g. `sd-create-website` redesign)? Multi-skill flow.
- Client handoff? Everything.

---

## 2. Prereqs

These apply to every layer beyond unit tests.

### Local infrastructure

```bash
# 1. Local Postgres seeded with the demo tenant data
#    (currently: simplerdev_realprod_dryrun on 127.0.0.1)
psql -d simplerdev_realprod_dryrun -c 'SELECT 1' >/dev/null && echo OK

# 2. Local dev server with the MCP route reachable
bun dev > /tmp/sd-dev.log 2>&1 &
# Wait for "✓ Ready in" in /tmp/sd-dev.log before continuing.
# Cold compile is ~60-70 s on Turbopack.

# 3. Confirm MCP route responds
curl -s -o /dev/null -w 'MCP %{http_code}\n' \
  -X POST http://localhost:3000/api/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# Expect 401 (auth required) — that's correct.
```

### Schema parity check (load-bearing — see Section 8)

Migration drift is the #1 cause of skill failures in this repo. Before running any live test, verify the demo DB has every table the MCP touches:

```bash
psql -d simplerdev_realprod_dryrun -tA -c "
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'posts', 'client_websites', 'clients', 'users', 'portal_api_keys',
    'branding_profiles', 'mcp_approval_links', 'mcp_pending_changes',
    'block_templates', 'email_campaigns', 'surveys', 'booking_pages',
    'pitch_decks', 'pitch_deck_slides'
  )
ORDER BY table_name;
" | sort
```

If any table is missing, find the migration that creates it under `drizzle/*.sql` and apply by hand:

```bash
psql -d simplerdev_realprod_dryrun -f drizzle/0111_approval_links_and_forks.sql
```

This is the **runbook §6.1 documented workflow** until the drizzle tracker is repaired.

### Env

| Variable | Required for | Where |
|---|---|---|
| `ANTHROPIC_API_KEY` | Smoke harness | `.env` (already set) |
| `SD_PORTAL_API_KEY` | Smoke harness | Seed via `bun run smoke:skills:seed-key` |
| `DATABASE_URL` | Harness DB writes (seed-key, cleanup) | `.env.local` auto-loaded by Bun |
| `MCP_URL` | Optional | Defaults to `http://localhost:3000/api/mcp` |
| `SMOKE_MODEL` | Optional | `sonnet` (default), `opus`, or full model id |

---

## 3. Layer 1 — Unit tests for the harness itself

The smoke harness has internal logic worth pinning:

- `unwrapMcpResult` — decodes the wrapped `result.content[0].text` error format
- `filterToolsForSkill` — applies the per-skill prefix allowlist
- Each `AuditMarker.check` function — the regex / shape assertion

There is **no unit test file for the harness yet**. When you add one:

```ts
// tests/unit/smokeSdSkills.test.ts
import { describe, it, expect } from 'vitest';
import { unwrapMcpResult, filterToolsForSkill } from '@/scripts/smoke-sd-skills';
// Note: requires the harness to export these — currently they're internal.
// First refactor: add `export` to those two helpers.

describe('unwrapMcpResult', () => {
  it('returns _error when the wrapped text contains an error key', () => {
    const wrapped = { content: [{ type: 'text', text: '{"error":"Site not found"}' }] };
    expect(unwrapMcpResult(wrapped)).toEqual({ _error: 'Site not found', _raw: { error: 'Site not found' } });
  });

  it('parses the wrapped text on success and returns the entity', () => {
    const wrapped = { content: [{ type: 'text', text: '{"id":123,"slug":"foo"}' }] };
    expect(unwrapMcpResult(wrapped)).toEqual({ id: 123, slug: 'foo' });
  });

  it('passes through non-text-content results unchanged', () => {
    const raw = { id: 1, foo: 'bar' };
    expect(unwrapMcpResult(raw)).toBe(raw);
  });
});
```

Run with `bun run test:unit`. Cost zero, time milliseconds.

**Why this matters:** the wrapped-error format is what bit us in smoke run 1 — the agent confabulated post id 714 because neither it nor the harness decoded the wrapped error. Unit-testing the unwrap helper means we'll catch regressions if the MCP changes its envelope format.

---

## 4. Layer 2 — MCP integration tests

Existing coverage:

- `tests/integration/api/approve/approval-links.test.ts` — all 5 entity approve side-effects + reject + 4 error paths. **Run this after any change to `lib/mcp/approval-links.ts` or `app/api/approve/[token]/route.ts`.**
- `tests/unit/mcp-tool-registry-baseline.test.ts` — every MCP tool is registered + has a schema. **Unit-layer (DB-mocked), so it runs in the default `bun test` gate** — tool drift fails on every commit.

To run the MCP tests:

```bash
bun test:unit -- tests/unit/mcp-tool-registry-baseline   # registry baseline (default gate)
bun test:integration:local -- tests/integration/api/approve/   # approve side-effects (needs DB)
```

What integration tests **don't** cover: agent behavior. They prove the MCP responds correctly when called with the right shape; they say nothing about whether the agent will form the right call.

**Gaps worth adding:**

- `branding_check_contrast` — assert WCAG floor returns + correct ratio for known pairs (e.g. white-on-#06B6D4 should fail with ratio 2.43).
- `posts_create` — assert it mints an approval envelope on success AND surfaces the wrapped-error format on a missing site / invalid block. The latter is what we discovered the hard way; pinning it locks in the format the skills + harness both depend on.
- Tenancy: assert an API key for client A cannot create a post under client B's `websiteId`. Run as part of `bun test:tenancy`.

---

## 5. Layer 3 — Smoke test (single skill)

This is the load-bearing layer for skill changes. It runs a real agent against the real MCP and asserts the audit-pass markers land in real output.

### Setup once

```bash
# 1. Mint a fresh API key for the test tenant (client 104 / user 181 by default)
export SD_PORTAL_API_KEY=$(bun run smoke:skills:seed-key)

# 2. Confirm Anthropic key is in .env or shell
[ -n "$ANTHROPIC_API_KEY" ] && grep -q ANTHROPIC_API_KEY .env && echo OK
```

### Run

```bash
# Default: sd-create-page, Sonnet 4.6, ~$0.30, ~2 min
bun run smoke:skills

# Other skills (once their marker sets are added — see §10)
bun run smoke:skills -- --skill sd-create-deck
bun run smoke:skills -- --skill sd-create-email

# Higher fidelity (Opus 4.7, ~$1.20)
bun run smoke:skills -- --model opus

# Custom prompt
bun run smoke:skills -- --prompt 'Build a contact page with a booking widget for Mancuso'

# Keep the test post for manual inspection
bun run smoke:skills -- --no-cleanup
```

### Read the output

Pass:

```
─── Smoke test results ───
  ✓ design-system-disclosed
  ✓ approval-url-surfaced
  ✓ expiry-disclosed
  ✓ posts-create-called
  ✓ published-false
  ✓ hero-hygiene-when-present (advisory)
  ✓ five-dim-self-review
  ✓ no-invented-numbers (advisory)

✓ PASS — 8/8 markers green.
✓ cleaned up post id=717
```

Fail (every required marker prints its reason):

```
  ✗ posts-create-called — posts_create returned no id (unexpected response shape: ...)
```

The first 1500 chars of the agent's final response print at the bottom — that's usually where you spot what went wrong.

### What the markers check

For `sd-create-page`:

| Marker | Required | What it asserts |
|---|---|---|
| `design-system-disclosed` | yes | Final text mentions palette/primary/brand colors AND contains ≥1 hex code |
| `approval-url-surfaced` | yes | A `/approve/<hex>` URL appears within the first 1500 chars |
| `expiry-disclosed` | yes | Either "expires in N days" OR a future ISO date 10–20 days out OR the word "expires" |
| `posts-create-called` | yes | The `posts_create` MCP tool was called AND returned an id (not an error) |
| `published-false` | yes | `posts_create` was called with `published: false` |
| `hero-hygiene-when-present` | advisory | If a hero block was authored, all 5 fields (`title`, `subtitle`, `description`, `ctaText`, `ctaLink`) are populated |
| `five-dim-self-review` | yes | Response names all 5 dimensions: Philosophy, Hierarchy, Craft, Functionality, Originality |
| `no-invented-numbers` | advisory | No `200+`, `Fortune 500`, `Trusted by` phrases in stats blocks (these are AI-slop tells unless the brand profile carries them) |

Advisory markers print `⚠` but don't fail the run. They're tracked so trend-watching catches drift even when the exit code is green.

### When the smoke test fails

The harness is designed so the failure message tells you what to do. The four runs we did during development each pointed at a different real bug — the patterns to recognize:

**Hallucinated success:** marker `posts-create-called` fails with `returned no id`, but the MCP shows an actual SQL error in the response. The agent saw the wrapped error and confabulated.
→ **Action:** check `.claude/skills/sd-create-*/SKILL.md` for the `## MCP response handling — read errors first` section. If absent, that's the regression.

**Schema drift:** marker `posts-create-called` fails with `Failed query: insert into "mcp_approval_links"`.
→ **Action:** the demo DB is missing a migration. Find the migration in `drizzle/*.sql` (search for the failed table name) and apply manually. See Section 8.

**Marker too strict:** all the underlying behavior looks right in the final-text preview, but a marker still fails on regex/exact-string.
→ **Action:** loosen the marker to test semantic intent, not literal format. We hit this on run 3 — agent paraphrased the design-system preamble into a metadata table; the marker was demanding the literal `Design system: ... Palette ...` block. Run 4 used semantic markers (`palette + hex code`) and passed.

**Agent skipped a required step entirely:** marker for an instruction that's clearly in `SKILL.md` fails even when the agent had every chance to comply.
→ **Action:** strengthen the skill prompt. Move the instruction earlier, mark it `MUST`, add it to the pre-flight checklist. Re-run.

### Cost discipline

- Sonnet 4.6: ~$0.30 / run with the tool filter (~90K input + 4K output)
- Opus 4.7: ~$1.20 / run, roughly 4× output quality on edge cases
- Without the tool filter (320 tools instead of 36): ~10× the cost — don't disable the filter unless you're explicitly testing tool-discovery behavior

A green smoke run on every `.claude/skills/**` PR commit is affordable (~$1–$5 per PR depending on iteration count). Beyond that, gate on label or run nightly.

---

## 6. Layer 4 — Multi-skill workflow tests

Single-skill smoke catches per-skill regressions. A multi-skill flow catches the **integration between skills** — the state that one skill writes to disk or to the database, and another reads.

Current state: this layer is **not yet automated**. The dry-run transcript at `.planning/skill-test-runs/2026-05-19-sd-website-dryrun.md` documents the expected behavior of a full `sd-init → sd-create-website → sd-learn` flow, but we don't run it against the live MCP yet.

To add this layer, extend the smoke harness with a `flow` subcommand:

```ts
// scripts/smoke-sd-skills.ts — sketch
async function cmdFlow(args: Record<string, string>) {
  // 1. Run sd-init via the agent. Assert .sd/config.json exists.
  // 2. Run sd-create-website with a sitemap of 6 pages.
  //    Assert: 6 posts created, all draft, all in same site, brand applied.
  //    Assert: nav_publish_all called.
  // 3. Inject a "drop the third stats column" mid-flow feedback into the conversation.
  //    Run sd-create-page once more (a follow-up).
  //    Assert: sd-learn was auto-invoked, .sd/learnings.md has the new rule.
  // 4. Cleanup: delete all 7 posts + the learnings file.
}
```

Cost: ~$2–$5 per run (6× the page authoring + sd-init + sd-learn). Time: ~15 min.

Trigger: not every PR — run on releases or after material `sd-create-website` / `sd-learn` changes.

---

## 7. Layer 5 — Approval-flow browser tests (Playwright)

The skills mint approval URLs. The URLs need to actually work in a browser:

```
https://simplerdevelopment.com/approve/<64-hex-token>
  → GET renders the entity preview + approve/reject modal
  → POST { action: 'approve', reviewerName, ... } fires the side-effect
  → published / active / status flips
```

Existing coverage:

- `tests/e2e/portal-mcp-approvals.spec.ts` — Playwright spec for the approval-route UI. Run with `bun run test:e2e -- portal-mcp-approvals`.
- `tests/e2e/cron-expire-mcp-pendings.spec.ts` — the expiry cron that auto-marks links `expired`.

These specs already cover:

- GET 404 / past-expiry auto-mark
- POST approve for all 5 entity types
- POST reject
- Edge cases: already-approved, bad action, missing reviewer, expired token

What they don't cover end-to-end with the skill stack:

- Skill mints URL → reviewer opens URL → reviewer approves → entity actually publishes
- This is the **smoke-test post-script**: after smoke run 4 passed, post 717 was deleted. To verify the approval flow, run smoke with `--no-cleanup`, take the approval URL it prints, paste it into a browser, click Approve, then assert the post's `published=true`.

Codify this in a sequel smoke command:

```bash
bun run smoke:skills -- --no-cleanup
# → prints approval URL on stdout. Save it.
bun run smoke:skills -- approve <url> 'Smoke Reviewer' 'smoke@simplerdevelopment.com'
# → POSTs to /approve/<token>, asserts entity flipped, then deletes.
```

The `approve` subcommand doesn't exist yet — see Section 10 for the build-out.

---

## 8. Debugging playbook — from the four real runs

Each smoke run during development surfaced a real issue. Pattern-matching from those:

### Symptom: agent reports a successful post id, but no post in DB

**Run 1 example:** agent said `Post ID: 714 · Site: L. Mancuso & Son (id: 247)`. DB had no post 714. Highest post id was 758.

**Root cause:** the MCP wrapped its error response inside a JSON-RPC success envelope (`{result:{content:[{text:'{"error":"..."}'}]}}`). The agent's prompt didn't include guidance for this format; it parsed `result` as success and confabulated a plausible response.

**Fix:** `## MCP response handling — read errors first` section in every `sd-create-*` SKILL.md. The section tells the agent: parse `content[0].text` as JSON; if it has an `error` key, STOP and surface verbatim.

**Verification:** smoke run 2 → agent correctly reported `"The approval link generation failed at the database level..."` instead of inventing success.

### Symptom: `posts_create` errors with `Failed query: insert into "mcp_approval_links"`

**Run 2 example:** the post itself created fine, but the approval-link insert errored with a SQL syntax issue.

**Root cause:** the `mcp_approval_links` table didn't exist in the active database. Migration 0111 (`drizzle/0111_approval_links_and_forks.sql`) was never applied — exactly the migration-tracker drift documented in runbook §6.1.

**Fix:** apply the migration manually:

```bash
psql -d simplerdev_realprod_dryrun -f drizzle/0111_approval_links_and_forks.sql
```

**Verification:** smoke run 3 → `posts_create` succeeded, approval URL minted.

**Prevention:** add to your local-dev setup checklist: run the schema parity check from Section 2 before each smoke session.

### Symptom: marker fails on regex even though final text "looks right"

**Run 3 example:** agent printed the approval URL inside a Markdown table cell labeled `**Approval URL**`, and disclosed expiry as "*(Expires 2026-06-02)*". The strict marker looked for the literal `Approval URL: https://` line and the phrase `expires in 14 days`.

**Root cause:** Sonnet 4.6 paraphrases instructions, especially formatting templates. The skill's literal preamble template doesn't reliably fire — the model interprets the spirit, not the letter.

**Fix:** loosen markers to semantic checks (Section 5's marker descriptions reflect the looser v2). For literal-compliance regression catching, keep one strict marker as **advisory** (it logs `⚠` but doesn't fail the run).

**Verification:** smoke run 4 → 8/8 green.

### Symptom: smoke test takes 18 minutes and costs $1.78

**Run 1 cost.** The harness was sending all 320 MCP tools to Claude on every iteration; tool definitions alone took ~33K tokens × 17 turns = 567K input tokens.

**Fix:** the `TOOL_PREFIX_ALLOWLIST` in `scripts/smoke-sd-skills.ts`. Per skill, allowlist the tool prefixes that skill actually calls. For `sd-create-page`, that's `whoami`, `client_get`, `sites_*`, `post_types_*`, `branding_*`, `block_templates_*`, `posts_*`, `approvals_*` — 36 tools instead of 320.

**Verification:** subsequent runs were ~$0.30 / 2 min.

---

## 9. CI wiring

**Current state:** the smoke harness is NOT in CI. `bun run test:critical` is the canonical pre-merge gate, and that runs Playwright E2E (`@critical` tag) against the local stack. The smoke harness costs real API credits and needs the dev server + DB, so it's a deliberate add-on, not a default.

**Recommended gating:**

```yaml
# .github/workflows/skills-smoke.yml — sketch
on:
  pull_request:
    paths:
      - '.claude/skills/**'
      - 'lib/mcp/**'           # tool registry / approval links
      - 'app/api/mcp/**'        # MCP route
      - 'scripts/smoke-sd-skills.ts'

jobs:
  smoke:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres }
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      # 1. Set up DB
      - run: psql ... < scripts/seed-smoke-db.sql
      # 2. Apply every drizzle migration (workaround for tracker drift)
      - run: for f in drizzle/*.sql; do psql ... -f "$f"; done
      # 3. Start dev server
      - run: bun dev &
      - run: bash scripts/wait-for-server.sh http://localhost:3000
      # 4. Mint smoke key
      - run: echo "SD_PORTAL_API_KEY=$(bun run smoke:skills:seed-key)" >> $GITHUB_ENV
      # 5. Run smoke (one skill per job — parallelizable)
      - run: bun run smoke:skills
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Per-PR cost: ~$0.30 × N skills. For the 8 sd-* skills running in parallel, ~$2.40 per PR.

**Cost caps to consider:**

- Skip the smoke job on `docs:` / `chore:` commits via `paths` filter.
- Add a manual `[smoke-all]` PR-label trigger for runs that should hit every skill.
- Cache the dev-server compile across jobs (~60 s saved per run).

---

## 10. Extending tests for a new skill

When you add a `sd-create-<X>` skill or a `simplerdev-<Y>` dev skill:

### A. Add a marker set to the smoke harness

In `scripts/smoke-sd-skills.ts`, define an `AuditMarker[]` for the new skill. Reuse the universal markers (`design-system-disclosed`, `approval-url-surfaced`, `expiry-disclosed`) and add surface-specific ones:

```ts
const SD_CREATE_DECK_MARKERS: AuditMarker[] = [
  ...SD_CREATE_PAGE_MARKERS.filter((m) =>
    ['design-system-disclosed', 'approval-url-surfaced', 'expiry-disclosed', 'five-dim-self-review']
      .includes(m.name),
  ),
  {
    name: 'decks-create-called',
    required: true,
    check: ({ toolCalls }) => {
      const call = toolCalls.find((c) => c.name === 'decks_create');
      if (!call) return 'decks_create not called';
      if (call.result?._error) return `decks_create errored: ${call.result._error}`;
      if (!call.result?.id) return 'decks_create returned no id';
      return null;
    },
  },
  {
    name: 'speaker-notes-per-content-slide',
    required: true,
    check: ({ toolCalls }) => {
      const replace = toolCalls.find((c) => c.name === 'decks_replace_slides');
      const slides: any[] = replace?.input?.slides ?? [];
      const content = slides.filter((s) => s.layout !== 'title' && s.layout !== 'section');
      const missing = content.filter((s) => !s.notes || s.notes.trim().length === 0);
      return missing.length === 0 ? null : `${missing.length} content slide(s) missing speaker notes`;
    },
  },
  {
    name: 'body-text-min-24px',
    required: false, // advisory — hard to enforce when style is nested
    check: ({ toolCalls }) => {
      const replace = toolCalls.find((c) => c.name === 'decks_replace_slides');
      const slides: any[] = replace?.input?.slides ?? [];
      const tinyBody = slides.flatMap((s) => s.blocks ?? [])
        .filter((b: any) => b.type === 'text' && b.style?.fontSize)
        .filter((b: any) => {
          const m = String(b.style.fontSize).match(/(\d+)/);
          return m && Number(m[1]) < 24;
        });
      return tinyBody.length === 0 ? null : `${tinyBody.length} text block(s) under 24px`;
    },
  },
];
```

### B. Add the tool allowlist

```ts
const TOOL_PREFIX_ALLOWLIST = {
  // ...
  'sd-create-deck': [
    'whoami', 'client_get', 'sites_list',
    'branding_', 'block_templates_', 'decks_', 'approvals_',
  ],
};
```

### C. Wire into `MARKER_SETS`

```ts
const MARKER_SETS = {
  'sd-create-page': SD_CREATE_PAGE_MARKERS,
  'sd-create-deck': SD_CREATE_DECK_MARKERS, // ← add
};
```

### D. Run

```bash
bun run smoke:skills -- --skill sd-create-deck
```

Iterate until the run passes against the live MCP. The first run usually exposes either a marker that's too strict or a skill instruction that's not landing.

### E. Document the marker set

Update the per-skill section in this file (Section 5 "What the markers check") with the new skill's markers. Future maintainers should be able to read this guide and know what each smoke run actually asserts.

---

## 11. Known issues + workarounds

| Issue | Where it bites | Workaround |
|---|---|---|
| Drizzle migration tracker only records `0003`; `0004..0113` are hand-applied SQL | Schema drift between local dev DBs; missing tables fail MCP writes | Run the schema parity check (Section 2) before every smoke session. Apply missing migrations from `drizzle/*.sql` manually. |
| MCP wraps errors as `{result:{content:[{text:'{"error":"..."}'}]}}` not as JSON-RPC errors | Agent and harness both have to decode the wrapped format | Skill defense: `## MCP response handling` section in each `sd-create-*` SKILL.md. Harness defense: `unwrapMcpResult` in `scripts/smoke-sd-skills.ts`. |
| Sonnet 4.6 paraphrases SKILL.md formatting instructions | Strict-format markers (literal "Design system:" preamble) false-fail | Use semantic markers. Keep strict markers as advisory if you want to track drift. |
| Staging + production share one Postgres | Schema or data changes from a smoke run could affect production | Use only the local DB (`simplerdev_realprod_dryrun` or `simplerdev_local_20260514`). Confirm `DATABASE_URL` points local before running. Never run smoke against the Railway URL. |
| Tool catalog is 320 tools by default | Cost explodes (~$1.80 / run) and agent gets confused | The tool-prefix allowlist is always-on for known skills. Don't disable it unless explicitly testing tool-discovery behavior. |
| `[smoke] *` posts can pile up if cleanup is skipped | DB clutter, unique-slug collisions on subsequent runs | `bun run smoke:skills:cleanup -- --older-than-min 0` — deletes every post with title starting `[smoke] `. |

---

## 12. The release checklist

Before tagging a release that touches the skills:

- [ ] **Schema parity check** (Section 2) — every required table exists in the demo DB.
- [ ] **MCP integration tests** — `bun test:integration:local -- tests/integration/api/approve/` green.
- [ ] **Smoke each changed skill** — `bun run smoke:skills -- --skill <name>` returns exit 0. Save the run logs to `tests/skill-runs/<date>-<skill>.log` for audit history.
- [ ] **Critical E2E** — `bun run test:critical` green.
- [ ] **Browser-approval spot check** — at least one `--no-cleanup` smoke run + manual approval click + verify entity publishes.
- [ ] **CHANGELOG.md** — every shipped fix has an entry in `.claude/skills/CHANGELOG.md`.

For a client handoff release, also:

- [ ] **Stable staging hostname configured** (runbook §6.3) — pilot clients can't point Claude at an unstable Vercel preview URL.
- [ ] **API-key provisioning UX** documented — see `CLIENT_QUICKSTART.md`.
- [ ] **Error catalog** complete — every common failure path maps to a remediation.

---

## 13. Quick reference

```bash
# Setup (once per session)
bun dev > /tmp/sd-dev.log 2>&1 &                          # start dev server
export SD_PORTAL_API_KEY=$(bun run smoke:skills:seed-key) # mint key

# Common runs
bun run smoke:skills                                       # default: sd-create-page
bun run smoke:skills -- --skill sd-create-deck             # other skills
bun run smoke:skills -- --model opus                       # higher fidelity, ~4× cost
bun run smoke:skills -- --no-cleanup                       # keep the test post
bun run smoke:skills -- --prompt 'Custom prompt'           # override default

# Cleanup
bun run smoke:skills:cleanup -- --older-than-min 0         # delete all [smoke] posts

# Integration tests (no API cost)
bun test:integration:local -- tests/integration/api/approve/
bun test:tenancy

# Browser E2E (no API cost)
bun run test:e2e -- portal-mcp-approvals
bun run test:critical

# Database parity check
psql -d simplerdev_realprod_dryrun -tA -c "
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('mcp_approval_links','mcp_pending_changes','branding_profiles','posts')
  AND table_schema = 'public';
"

# Apply a missing migration
psql -d simplerdev_realprod_dryrun -f drizzle/0111_approval_links_and_forks.sql
```

---

## 14. What this guide deliberately does not cover

- **Production smoke testing.** Don't smoke against production — the API costs are real, and the local DB shares a host with prod per the runbook. Test against `simplerdev_realprod_dryrun` or `simplerdev_local_20260514` only.
- **Cross-tenant security.** Tenancy leak detection is `bun test:tenancy`'s job, not the smoke harness'. The smoke harness uses a single tenant; it cannot detect a leak.
- **Visual / pixel acceptance.** The smoke test asserts the agent shipped the right structure (hero block hygiene, brand colors disclosed). Whether the result looks beautiful is a human judgment call. Pair smoke runs with manual approval-page review for the first few releases of any new skill.
- **Cost optimization beyond the tool filter.** If runs are still too expensive, the next levers are caching SKILL.md content (it's resent every run) and switching to Haiku 4.5 for the simpler skills. Both are out of scope here.

If you find a gap this guide misses while shipping a real change, edit the guide. The four bugs we hit during development of the smoke harness all became sections here — that's the pattern to continue.
