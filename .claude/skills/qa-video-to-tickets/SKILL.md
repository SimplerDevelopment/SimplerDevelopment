---
name: qa-video-to-tickets
description: "Turn a Google Meet QA screen-recording (+ its transcript) into Kanban tickets on a SimplerDevelopment board — WITHOUT watching the whole video. Reads the full transcript cheaply (text), detects only the ambiguous moments / callouts / questions, pulls frames ONLY for those windows so Claude can see the screen and write a precise ticket, then auto-creates cards. Use when the user says 'turn this QA video into tickets', 'make tickets from this QA recording', 'watch with transcript', 'qa-video-to-tickets', or drops a QA screen-recording / Drive link + a project board."
argument-hint: "<video-or-drive-link-or-path> [board]"
allowed-tools: Bash, Read, AskUserQuestion
user-invocable: true
---

# qa-video-to-tickets

Someone recorded a Google Meet QA session — narrating a build, calling out bugs, asking questions. You do **not** want to watch the whole thing or burn tokens ingesting every frame. This skill reads the transcript (cheap text), finds only the moments that carry **ambiguity / a callout / a question**, looks at the screen **only in those windows**, and files each as a Backlog ticket on a SimplerDevelopment board.

**Core cost principle:** transcript = cheap text, do a full pass. Frames = expensive, pull them only for detected windows, and only to help *you* author an accurate ticket — frames are your comprehension aid, **not** evidence attached to the card (unless the user explicitly asks for screenshots).

`${CLAUDE_SKILL_DIR}` is this skill's dir. The `watch` skill lives at `~/.claude/skills/watch`.

---

## Step 1 — Resolve inputs (board is required)

**Video source** — auto-detect which shape you got:
- **Local file** (`.mp4/.mov/.mkv/.webm` path) — optionally a transcript file alongside (`.txt/.srt/.vtt/.docx` — the Meet/Gemini transcript).
- **Google Drive link** — the recording + (if present) its Gemini transcript Doc. Pull both with the `Google_Drive` MCP tools (`search_files` in the same folder, `download_file_content` for the mp4, `read_file_content`/export for the transcript Doc).

**Board** — REQUIRED, no silent default (wrong board = orphaned tickets). If the user named one, use it. Otherwise call `projects_list` and `AskUserQuestion` to pick — **or offer to create a new board** for this session (`projects_create`, then default lanes; new board → new SKU prefix). Record: `projectId`, `SKU prefix`.

---

## Step 2 — Get the FULL transcript (cheap, text only)

Precedence (Meet-first — free + speaker-labeled):
1. **Transcript file provided / pulled from Drive** → parse it to one line per segment: `[MM:SS] Speaker: text`. Keep speaker labels but detect across **all speakers equally**.
2. **No transcript** → generate one with the `video-ingest` skill's Whisper path (produces `~/.claude/video-ingest/<slug>/transcript.txt`, cached — reuse if it exists). Whisper is speaker-blind; note that as degraded mode.

Read the whole transcript. It's text — this is the cheap pass, no frame cost.

---

## Step 3 — Detect ticket-worthy moments (one semantic pass over the text)

Walk the transcript and mark every moment in these **five categories**. Skip pure narration / approval ("okay, clicking save", "yeah that looks good").

| Category | Sounds like |
|---|---|
| `question` | "why is this here?", "is that supposed to…?" |
| `bug` | "that's broken", "that shouldn't do that", "wait, that's wrong" |
| `change-request` | "this should be bigger", "it'd be better if…" |
| `ambiguity` | "hmm, not sure if this is intended", "I don't know if…" |
| `follow-up` | "we need to add…", "note that…", "let's remember to…" |

For each moment record: `t` (start seconds), `category`, `confidence` (`high`/`medium`/`low`), and the **verbatim quote**.

**Confidence floor:** only create cards for `high` + `medium`. Collect `low` moments separately and report the count at the end (don't silently drop them — the user can re-run looser).

---

## Step 4 — Merge into frame windows

Feed the above-floor moments to the merger (symmetric ±10s, merge windows within 10s):

```bash
echo '[{"t":30,"category":"bug","confidence":"high"}, ...]' \
  | python3 "${CLAUDE_SKILL_DIR}/scripts/windows.py"
```

Returns merged `[{start,end,moments}]`. One `watch` call per window, not per moment.

---

## Step 5 — Pull frames per window (the only expensive step — rationed)

For each merged window, run the `watch` script against the **same video source**, scoped to the window:

```bash
python3 ~/.claude/skills/watch/scripts/watch.py "<source>" \
  --start <start> --end <end> --resolution 512 --max-frames 6
```
- **512px** default (bump to `--resolution 1024` only if on-screen text is unreadable and you need to know exactly what it says).
- `~6 frames/window`. **Global cap ≈ 60 frames** across the whole run. If windows would exceed it, pull frames for the **highest-confidence windows first**; author the remaining (lower-confidence) cards from **transcript text alone** — they still become tickets, just written without visual confirmation. **No callout is ever dropped for budget** — only the frame pull is rationed.

`Read` the frame paths for a window (parallel), combine with the window's transcript quotes, and write a precise ticket: title names the concrete thing on screen; body explains the callout.

---

## Step 6 — Dedup, then auto-create cards

**Before creating**, read the board once (`kanban_list_board({projectId})`):
- **SKU sequence:** find the max existing `PREFIX-NNN` and continue from there (assign once, never renumber/reuse; a new board starts at `PREFIX-001`). Gaps from later pruning are fine — the user prunes on the board.
- **Dedup:** skip any moment whose source `[MM:SS]` (±5s) and title closely match an existing card — makes re-runs on the same recording idempotent instead of doubling.

Then **auto-create** each survivor with `kanban_create_card` into the **Backlog** lane:
- **Title:** `PREFIX-NNN <concise concrete summary>`.
- **Description:**
  ```
  **Category:** bug
  **Timestamp:** [12:34]
  **QA said:** "<verbatim quote>"

  <your one/two-line description of the issue, grounded in what the frames showed>
  ```
  - **Drive input** → also append a best-effort deep-link to the moment: the file view URL with `?t=<seconds>s` (mark it best-effort; Drive's player honors it inconsistently). Local input has no link — that's expected.
- **Checklist, not description to-do lists:** any actionable/verifiable list — repro steps, fix acceptance criteria, pass/fail checks — goes in the card's **checklist** via `kanban_checklist_add` (one call per item), NEVER as markdown `- [ ]` boxes in the description. The description stays prose (category, timestamp, quote, context). Checklist items are tickable and roll up to a progress count; description checkboxes are dead text. (See CLAUDE.md → Conventions → "Ticket checklists".)
- Attach a label matching the category if the board has one (`kanban_labels_list` → `kanban_card_attach_label`).
- **Screenshots are NOT attached** by default (frames were your comprehension aid). **Only if the user explicitly asked for screenshot(s)** on the cards: upload the representative frame via `media_upload_presign` → PUT the JPG → `kanban_card_attach_file_from_url`.

---

## Step 7 — Report (one budget line, no mid-run gate)

Print a single summary:

```
✅ N cards created on <board> (PREFIX-012 … PREFIX-0NN), Backlog lane.
   Frames: M attached-for-authoring @512px across W windows (cap 60).
   Skipped: X low-confidence moments · Y dedup matches already on board.
```

No confirmation gate anywhere — creation is automatic per the locked spec; the user prunes on the board.

---

## Guardrails

- Board is per-run and required — never guess it.
- Frames exist to help *you* write the ticket, not as card evidence — don't attach unless asked.
- Every above-floor moment becomes a card even under the frame cap; ration frames, never tickets.
- SKUs continue the board max; never renumber. Dedup makes same-video re-runs safe.
