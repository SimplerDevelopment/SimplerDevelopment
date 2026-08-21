---
name: bugcast-follower
description: "Follow a LIVE bugcast QA recording from a dedicated Claude Code session and act on it as it happens — file/update Kanban cards on the master board when the tester drops a marker or the page throws, and dispatch worktree missions when the tester asks for a fix out loud. Use when the user says 'follow my QA session', 'start the bugcast follower', 'watch me QA', 'I'm about to record a bugcast', or when a bugcast channel event arrives in a session running this skill."
argument-hint: "[projectId] — defaults to 153, the SD master board"
allowed-tools: Bash, Read, Write, Edit, Agent, AskUserQuestion, EnterWorktree, ExitWorktree
user-invocable: true
---

# bugcast-follower

Someone is recording a QA pass in the browser right now and narrating it. You sit
in a dedicated session, get woken by the recording, and turn what happens into
Kanban cards and — when asked — into actual fixes, without the tester ever
switching to a terminal.

The post-hoc sibling is `qa-video-to-tickets` (a finished Meet recording → tickets).
This one is live. If the session is already over, use that skill instead.

---

## Launch (the operator does this, once)

The channel only pushes into a session launched to accept it:

```bash
claude --dangerously-load-development-channels bugcast
```

Launch it **in the repo the fixes belong to** — worktrees and gates run from
there. Without that flag you still get the bugcast *tools* but never a push, and
the symptom is indistinguishable from a quiet recording: silence. If you are
unsure which you are in, say so rather than sitting idle.

One session per recording. The channel follows the newest live session and
switches on its own, so a second follower double-files every card.

---

## What actually reaches you

`channel.mjs` filters hard before waking you. It pushes exactly:

| Event | Pushed |
|---|---|
| `marker` | always — the tester pressed a key |
| `exception` | always |
| `console` | only `level === 'error'` |
| `network` | `status >= 400`, or a failure that was not canceled |
| **`speech`** | **never** |
| clicks, navigations, ordinary logs, 2xx | never |

Three lifecycle pushes bracket the rest: `session_started`, `session_events`
(batched — several notables in one wake), `session_finished`.

### Two facts that decide the whole design

**1. A marker is a pointer, never a payload.** Both marker paths in the
extension are hardcoded — the keyboard shortcut writes `"Marked from the
keyboard"`, the popup button writes `"This is the bug"`. Neither carries what
the tester meant. The meaning is in the *speech around it*, and speech never
arrives on the channel. **So every marker costs you a speech lookup. There is no
shortcut.**

**2. `session_query` and `session_report` DO NOT WORK during a live recording.**
Both read `timeline.json`, which is only generated at stop — `isLive` is
literally defined as "`events.ndjson` exists and `timeline.json` does not". The
bugcast server's own instructions recommend them without that caveat; ignore
that while live. Live you have exactly two tools:

- `session_tail(sessionId, cursor, limit, waitMs, stream)` — `stream: 'events'`
  or `stream: 'speech'` (separate files, same `t` origin, merge on it)
- `session_frame(sessionId, at)` — a JPEG of what the page showed

After `session_finished`, the full set works.

---

## On `session_started`

Do this once, quickly — the tester is already clicking.

1. Note the `sessionId`. Start a **speech cursor at 0**.
2. Resolve the board: `$ARGUMENTS` or **project 153** (SD master board),
   `clientId: 104`. Lanes: Backlog 608 · Planned 609 · In Progress 610 ·
   Validating 611 · Approved 612 · Shipped 613.
3. Find the next SKU: `kanban_cards_search({projectId, query: "PUX-", limit: 200})`,
   take the max, continue from it. Never renumber, never reuse.
4. Count free worktree slots: `git worktree list`. Repo cap is **3 concurrent**.
5. Say one line back to the tester: board, next SKU, free slots. Then go quiet —
   they are testing, not reading.

Do **not** pre-read the board. `kanban_cards_search` answers dedup on demand;
caching a lane just goes stale while another session writes to it.

---

## On `session_events`

The push already told you what happened, in one line per event. Do not re-fetch
the timeline. Handle markers first — they outrank everything in the same batch.

### A marker

1. **Let the speech catch up.** Writes are batched ~2s, so the words covering the
   marker may not be on disk yet. `session_tail(stream: 'speech', waitMs: 3000)`
   from your cursor, advance the cursor, keep every event.
2. **Take the window `t - 45000` to `t + 15000`.** Biased backwards on purpose:
   people narrate intent *before* acting (bugcast measured narration landing
   ~670ms ahead of the click), and the tester presses the key *after* noticing.
3. **Look, if the words are thin.** `session_frame(sessionId, at: t)`. The frame
   is for *your* comprehension — do not attach it to the card unless asked.
4. **Classify** into one of four:

   | Class | Sounds like | Action |
   |---|---|---|
   | `directive` | "go fix that", "can you make that wider", "work on this" | card **+ worktree mission** |
   | `bug` | "that's broken", "that shouldn't happen" | card |
   | `change-request` | "this should be bigger", "it'd be better if" | card |
   | `unclear` | nothing usable in the window | card + `NEEDS-HUMAN` |

   Never guess a directive. "That's annoying" is a `bug`; only dispatch on an
   actual instruction. When torn between `directive` and anything else, pick the
   other one — a wrong card is cheap, a wrong worktree is not.
5. **Write the card** (below). A marker always produces one.

### An error (exception / console error / failed request)

Read the response body first — on a failed request it is usually the whole
answer, and it is already in the push.

**One card per signature, not per occurrence:**

- network → `METHOD + route-with-ids-normalized + status`
  (`PATCH /api/portal/cards/:id → 500`)
- exception → message + top stack frame
- console → the message, ids and timestamps stripped

First occurrence of a signature files a card. Every repeat adds a comment with
the count and timestamps — never a second card.

**Severity** → `sev:blocker` (132) if it breaks the flow the tester is on,
`sev:major` (133) for an exception or a 5xx, `sev:minor` (134) for a console
error or a lone 4xx.

---

## Writing a card

1. **Dedup first — always.**
   `kanban_cards_search({projectId, query: <signature or route>, limit: 10})`.
   Also search without a lane filter so a card sitting in Shipped surfaces: a
   regression **reopens the old card** (comment + move back to Backlog) rather
   than starting a fresh one.
2. **Hit** → `kanban_card_add_comment` with the new information only: the new
   timestamp, the new body, what is different this time. Do not restate the card.
3. **Miss** → `kanban_create_card` in **Backlog (608)**, titled
   `PUX-### · [area] · what is wrong`, `cardType: 'bug'` for a defect,
   `'task'` for a change-request. Description carries prose context: the
   verbatim quote, the page URL, the session id and `t`, the response body.
4. **Label it**: the severity label, plus the existing domain label matched from
   the page URL — `/portal/projects` → `PROJ79`, `/portal/crm` → `CRM79`, the
   visual editor → `VEDT79`, and so on. `kanban_labels_list` has all 45; match,
   never invent. Do not add a provenance or per-session label.
5. **Checklist, not description to-dos.** Every verifiable step is a
   `kanban_checklist_add` call. Markdown checkboxes in a description are dead text.

---

## Dispatching a directive

1. Create the card, move it to **In Progress (610)**.
2. **Free slot?** `git worktree list` against the cap of **3**.
   - **Yes** → dispatch now.
   - **No** → leave the card in Backlog, comment `queued — worktree cap`, and
     tell the tester once. **Drain the queue automatically** the moment a slot
     frees; do not make them ask again.
3. Dispatch one agent per card, in its own worktree, with the card as the brief:
   the SKU, the quote, the URL, the frame timestamp, the gate it must pass, and
   the **escalation contract** from CLAUDE.md verbatim.
4. Keep the boss/worker split: reasoning-model for anything touching auth,
   billing, tenancy, migrations or data access; Sonnet for mechanical,
   already-specified work.
5. **When it returns green** — right gate first (`bun test:tenancy` after any
   data-access change, `bun test:critical` before declaring done) — open the PR,
   comment the PR link on the card, move it to **Validating (611)**, and
   `ExitWorktree` with `remove`. Merge back before dispatching the next one;
   never batch-merge a pile of branches.
6. **When it returns `ESCALATE:`** — attach `NEEDS-HUMAN` (131), comment what is
   blocked and the exact decision needed, leave the card In Progress, free the
   slot. Do not re-dispatch it to another worker.

Never merge to `main` and never deploy from here without the tester saying so.
Those are outward-facing and stay their call, mid-session or not.

---

## On `session_finished`

The provisional speech you filed against has now been replaced by the
authoritative transcript. Reconcile before you report:

1. `session_report(sessionId)` — the full set works now.
2. `session_query({sessionId, type: 'speech'})` for the final words. For each
   card filed this session, re-read its window. **If the quote changed
   materially, fix the card** (`kanban_update_card`) and comment that it was
   amended and why. Live Whisper runs on ~10s windows and mangles boundaries —
   "ticket models" for "ticket modals" is the normal failure, not the rare one.
3. `session_query({sessionId, failedOnly: true})` — sweep for failures whose
   signature you never filed, and file them now.
4. Report **once**, compactly: cards created, cards updated, cards amended,
   missions dispatched / queued / escalated, and anything you deliberately did
   not file. Never end a session having silently dropped something.

---

## Guardrails

- **Do not act on every event.** A recording produces hundreds; the channel
  already dropped the noise, and most of what survives is still context around
  the one thing that matters. Markers first.
- **Never file a duplicate.** `kanban_cards_search` before every create, no
  exceptions. That tool exists because this skill needed it (PUX-088).
- **Never invent a label.** Match the existing 45 or use the four this skill
  owns: `NEEDS-HUMAN`, `sev:blocker`, `sev:major`, `sev:minor`.
- **Never silently truncate.** If you skipped something — a queued directive, an
  unfiled signature, a marker you could not classify — say so in the final report.
- **One session per recording**, and stay in it. Two followers double-file.
- **The card is the record, not the transcript.** A reviewer reading only the
  card should be able to reconstruct what happened without the video.
