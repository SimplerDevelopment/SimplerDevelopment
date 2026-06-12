# Company Brain Agent — Human E2E Test Guide

A step-by-step, A→B guide for a human to set up, run, and manually test the **Company Brain AI agent** end-to-end on a local machine. No prior context required.

> The agent lives at **`/portal/brain/agent`** (UI) backed by **`POST /api/portal/brain/agent`** (route). It is a streaming, multi-turn conversational assistant that answers questions about — and captures into — a client's Company Brain (decisions, people, tasks, notes, glossary, initiatives, meetings, CRM) using an agentic tool-use loop. No vector DB; tools read live Postgres scoped by `clientId`.

---

## 0. What the agent does (the 6 capabilities you're testing)

| Capability | Example ask | Tools it uses |
|---|---|---|
| **Lookup** | "What decisions have we made about Acme's portfolio?" | `brain_list_decisions`, `brain_get_decision` |
| **Search / knowledge** | "What do we know about Sunrise Family Office?" | `brain_search`, `brain_get_note` |
| **People** | "Who's our compliance officer?" | `brain_list_people` |
| **Procedural / glossary** | "What does AUM mean?" | `brain_lookup_glossary`, `brain_list_glossary` |
| **Summary** | "Give me a status summary of the business." | `brain_dashboard_summary` (+ others) |
| **Capture (write)** | "Make a note: client wants tax-loss harvesting." / "Add a task to send Acme their Q3 report." | `brain_create_note`, `brain_create_task` |

Under the hood each request flows: **classify intent → (plan, if complex) → tool loop (Haiku for simple / Sonnet for complex) → groundedness check → stream answer**. You'll see each of these stages live in the UI.

---

## 1. One-time setup

### 1.1 Environment variables — `.env.local`

```bash
DATABASE_URL=postgresql://localhost:5432/simplerdevelopment   # your local DB
AUTH_SECRET=                # openssl rand -base64 32
ANTHROPIC_API_KEY=sk-ant-...   # platform key — the agent calls Claude
BRAIN_ENTITLEMENT_BYPASS=1  # skip the Brain subscription check locally
# ENCRYPTION_KEY=<openssl rand -hex 32>   # only needed if you test the BYOK key path
```

- `ANTHROPIC_API_KEY` is **required** — the agent makes real Claude calls (classify, plan, tool loop, groundedness). Without it the request 500s with "no API key."
- `BRAIN_ENTITLEMENT_BYPASS=1` is the fastest way past the Brain entitlement gate (`lib/brain/entitlement.ts`). Alternative: set `clients.brain_trial_until` to a future date, or attach a `category='brain'` service.

### 1.2 Install + apply schema

```bash
bun install
bun run db:push        # IMPORTANT: use push, not migrate (see note below)
```

> **Why `db:push` and not `db:migrate`:** the agent reads the `brain_profiles.agent_preferences` column on every request (`lib/brain/agent-preferences.ts`). That column's migration is currently orphaned (not in the Drizzle journal), so `db:migrate` will **not** create it and the agent will error on first use. `db:push` syncs the live schema (which has the column) directly to your DB and sidesteps the issue. `db:push` runs `db:verify-target` first and refuses prod URLs, so it's safe locally.

### 1.3 Seed a login user + a fully-populated Brain

```bash
# 1) Create a portal user you can log in as (prints the new client's id — note it)
tsx scripts/seed-portal-client.ts
#    → Email: client@example.com   Password: client123   (owner of "Acme Corp")

# 2) Fill that client's Brain with demo data (decisions, people, tasks, notes,
#    glossary, initiatives, meetings, CRM). Use the clientId from step 1.
bun run scripts/seed-brain-demo.ts <clientId>
```

`seed-brain-demo.ts` is idempotent (safe to re-run) and now seeds **every** entity the agent can query, so all 12 tools return real results:
- 3 **decisions** (e.g. "Adopt fixed-income tilt for Acme Q3 portfolios")
- 4 **people** (e.g. Diana Castillo — Chief Compliance Officer)
- 4 **glossary terms** (AUM, RIA, Fiduciary, Form ADV)
- 2 **initiatives** (Client Portal Onboarding; Estate Planning Service Line Launch)
- 5 **tasks**, 4 **notes**, 3 **meetings**, 2 CRM companies + contacts + deals

### 1.4 Give the client credits (platform-key path only)

The platform-key path checks credits. Easiest: enable pay-as-you-go for the client (run against your local DB, substituting `<clientId>`):

```sql
INSERT INTO ai_credit_balances (client_id, balance, monthly_grant, pay_as_you_go)
VALUES (<clientId>, 0, 0, true)
ON CONFLICT (client_id) DO UPDATE SET pay_as_you_go = true;
```

> Using a **BYOK** Anthropic key (a `client_api_keys` row) instead skips the credit check entirely — but the platform-key + pay-as-you-go path above is simpler for testing.

### 1.5 Launch

```bash
bun dev
```

---

## 2. Reach the agent (A)

1. Open **http://localhost:3000/portal/login**
2. Log in: **`client@example.com`** / **`client123`**
3. Go to **http://localhost:3000/portal/brain/agent**

You should see the **Brain Agent chat** UI: a message list and a composer input. You're at point **A**.

---

## 3. What you're watching in the UI (read once)

As the agent works, the chat streams these live, in order:

1. **Intent chip** — the classified intent + complexity (`simple`/`complex`). Appears almost immediately.
2. **Plan steps** — *only for complex queries.* A short numbered plan.
3. **Tool-call chips** — one per tool the agent runs (e.g. "Searching decisions…"). They show start → result.
   - ⚠️ *Known cosmetic bug:* every chip currently shows the same generic search icon (the label text is correct). Ignore the icon.
4. **Streamed answer** — the response text types out token-by-token.
5. **Confidence / sources** — a confidence indicator at the end. If the agent isn't sure, the answer is **prefixed with an "I don't have enough reliable information…" disclaimer** (this is the anti-hallucination guard — see Scenario 10).

---

## 4. Play-by-play test scenarios (A→B)

Run these in order. For each: type the **Prompt**, watch for **Expect**, and check **Pass**. Writes are verified in a portal page.

### Scenario 1 — Lookup (decisions) · *simple*
- **Prompt:** `What decisions have we made about Acme's portfolio?`
- **Expect:** intent chip = `lookup` (simple) → a `decisions` tool chip → answer names the **"Adopt fixed-income tilt for Acme Q3 portfolios"** decision and its status (accepted).
- **Pass:** the specific seeded decision is cited; no plan step (simple path).

### Scenario 2 — Search / knowledge
- **Prompt:** `What do we know about Sunrise Family Office?`
- **Expect:** a `brain_search` tool chip → answer pulls from the seeded note(s)/meeting(s)/CRM record for Sunrise.
- **Pass:** answer references real seeded Sunrise content, not generic filler.

### Scenario 3 — People
- **Prompt:** `Who is our compliance officer?`
- **Expect:** `brain_list_people` chip → answer = **Diana Castillo, Chief Compliance Officer**.
- **Pass:** correct seeded person + title.

### Scenario 4 — Glossary / procedural
- **Prompt:** `What does AUM mean in our glossary?`
- **Expect:** `brain_lookup_glossary` chip → the seeded **AUM** definition verbatim-ish.
- **Pass:** returns the glossary definition, not a generic web definition.

### Scenario 5 — Tasks
- **Prompt:** `What tasks are open right now?`
- **Expect:** `brain_list_tasks` chip → list of the seeded open/in-progress tasks.
- **Pass:** shows real seeded task titles with statuses.

### Scenario 6 — Summary · *likely complex*
- **Prompt:** `Give me a status summary of the business right now.`
- **Expect:** intent `summary`; may be classified **complex** → you see a **plan**, multiple tool chips (`brain_dashboard_summary` + others), and the loop runs on **Sonnet**.
- **Pass:** a coherent multi-area summary (tasks, meetings needing review, initiatives, people) grounded in seeded counts.

### Scenario 7 — Capture a note (write + confirmation gate)
- **Prompt:** `Make a note titled "Tax-loss harvesting" — client wants quarterly tax-loss harvesting reviews.`
- **Expect:** the agent **summarizes what it's about to create and asks you to confirm** *before* writing (this confirmation is prompt-enforced).
- **Then type:** `Yes, create it.`
- **Expect:** a `brain_create_note` tool chip → confirmation.
- **Verify (B):** open **http://localhost:3000/portal/brain/knowledge** — the new note appears.
- **Pass:** note is created only after your confirmation and shows up in the Knowledge page.

### Scenario 8 — Capture a task (write)
- **Prompt:** `Add a task: send Acme their Q3 report by Friday.`
- **Expect:** confirmation prompt → on `yes`, a `brain_create_task` chip.
- **Verify (B):** open **http://localhost:3000/portal/brain/tasks** — the new task appears.
- **Pass:** task created post-confirmation and visible in the Tasks page.

### Scenario 9 — Planning · *complex*
- **Prompt:** `Help me plan onboarding for a new wealth-advisory client.`
- **Expect:** intent `planning` (complex) → a **plan** with steps → multiple tool chips (initiatives, tasks, notes) → Sonnet-quality synthesized plan.
- **Pass:** you see the plan frame and a multi-step, grounded answer (references the seeded onboarding initiative).

### Scenario 10 — Groundedness guardrail (anti-hallucination)
- **Prompt:** `What were the findings of our 2019 Tokyo office security audit?`
- **Expect:** tools return nothing (no such data) → the agent **does not invent an answer**; the response is **prefixed with "I don't have enough reliable information…"** and low confidence.
- **Pass:** no fabricated audit details; the disclaimer is shown. *(This validates the grounder's fail-closed behavior — if the grounder itself errors, it now defaults to "uncertain" rather than confidently passing an unsupported answer.)*

You've now exercised all six capabilities + the write-confirmation gate + the hallucination guard. That's **B**.

---

## 5. Troubleshooting (symptom → cause → fix)

| Symptom | Cause | Fix |
|---|---|---|
| Redirected to `/portal/login` | Not authenticated | Log in as `client@example.com` / `client123` |
| 403 / "Brain not enabled" | Entitlement gate | Set `BRAIN_ENTITLEMENT_BYPASS=1` in `.env.local`, restart `bun dev` |
| 402 / plan-gate block | Client is on `starter` tier without a key | Seeded test client has no subscription row → should pass; otherwise add a BYOK `anthropic` key |
| 500 "no API key" | Missing platform key | Set `ANTHROPIC_API_KEY` in `.env.local` |
| 402 / "insufficient credits" | Platform-key credit check | Run the `ai_credit_balances` pay-as-you-go SQL (§1.4) |
| **Agent errors on the very first message** | `agent_preferences` column missing | Run **`bun run db:push`** (not `db:migrate`) — see §1.2 |
| Agent always says "I don't have information" | Brain is empty | Run `bun run scripts/seed-brain-demo.ts <clientId>` |
| All tool chips show the same icon | Known cosmetic bug (`BrainAgentChat.tsx` icon map keys are stale) | Ignore — labels are correct |
| Answer cuts off / API error on a long chat | No conversation-history truncation yet | Start a new conversation |

---

## 6. Optional — run the automated eval

A behavioral/hallucination eval harness (15 fixtures across all intents) can be run manually (it needs a live key + seeded DB; it is **not** in CI):

```bash
bun run eval:brain --clientId=<clientId> --userId=<userId> --key=sk-ant-...
# optional: --fixtures=<id1,id2> to run a subset
```

It runs the tool-use loop directly (no UI/SSE) and asserts each fixture called the expected tools, avoided forbidden ones, and didn't hallucinate planted fake entities.

---

## 7. Known limitations (not blockers for human testing)

- **Tool-chip icons** are all the generic search icon (label text is correct) — cosmetic.
- **No conversation-history truncation** — very long chats can hit the model's context limit and error; start a new conversation.
- **Write confirmation is prompt-enforced**, not route-enforced — the agent is instructed to confirm before `create_note`/`create_task`, but there's no server-side gate.
- **Tracing is console-only** — spans log as JSON lines; no OTEL/observability backend wired.
- **Migration debt:** the `brain_profiles.agent_preferences` column ships only in an orphaned auto-generated migration (`drizzle/0010_robust_cammi.sql`, not in the journal). Local testing uses `db:push` to sidestep it; **before staging/prod deploy via `db:migrate`, this needs a proper journaled migration.**
