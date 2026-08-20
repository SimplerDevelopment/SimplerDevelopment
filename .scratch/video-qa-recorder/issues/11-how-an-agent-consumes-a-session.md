# How a coding agent consumes a session

Type: grilling
Status: resolved
Blocked by: 09 (resolved)

## Question

The point of the tool is the handoff. Both surveyed competitors that thought
about this (Skreno, DevRecorder) shipped an MCP server.

- **Plain files the user @-mentions**, a **CLI** that prints a digest, or an
  **MCP server** the agent queries? Files are free and require nothing; MCP means
  the agent can ask "what failed" without a 40k-token timeline in context.
- A full session's `timeline.json` could be very large. Is there a summarization
  or query layer, or does the consumer just get the raw file?
- Does the tool ship a **skill/prompt** — "here is how to read one of these" — or
  is the format meant to be self-evident?
- If MCP: does it run inside the sidecar (free, if a sidecar exists) or as a
  separate process?
- Does the answer change between the local-me case and a stranger's case?

## Answer

**Ship an MCP server — as a strictly optional, additive consumption layer that
recording never depends on.** Files remain a complete deliverable on their own.

*(Recorded honestly: the recommendation was files-only. The token argument
carried it, and it only strengthens as sessions get longer. What follows is the
version of this decision that does not cost the property tickets 03 and 07
fought for.)*

---

### The split that makes this compatible with 03 and 07

Tickets 03 and 07 killed the sidecar to win one property: **install is "load the
extension."** An MCP server reintroduces a second component with its own
runtime — so the two must not be allowed to become one story.

| | Requires |
|---|---|
| **Record a session** | Load the extension. No runtime, no native dependency, zero network calls. |
| **Let an agent query sessions** | Optional. `npx -y video-qa-mcp` in an MCP config block. |

The non-negotiable was that **core function** is fully local and dependency-free.
Recording is core function; consumption is not. So this is legitimately additive
in a way the whisper.cpp sidecar never was — that sidecar was *required to
produce the artifact*, needed a compiler, and had no macOS binary at all. This
needs Node, which is already present on any machine running a coding agent, and
`npx` means there is no install step to speak of.

**Hard constraint: files must keep working standalone.** A user who never
configures MCP still `@`-mentions `report.md` and gets everything. If the MCP
server ever becomes the only good way to read a session, this decision has gone
wrong.

### Why the token argument is right

`report.md` is already a summarisation layer — 3.5 KB for the 26-second example
where `timeline.json` is 9 KB for 18 events. But a 15-minute session runs to
several hundred events and a raw timeline near **50k tokens**, and pasting that
to ask "what failed" is exactly the waste the tool exists to remove. A query
surface keeps the answer proportional to the question.

### The tool surface — four tools

- **`sessions_list`** — recent sessions: id, title, when, duration, failure count.
- **`session_report`** — return `report.md` for one session.
- **`session_query`** — filtered slice of the timeline by event type, time range,
  or text match. This is the token-saving one and the reason the server exists.
- **`session_frame`** — return one frame image by timestamp, for a multimodal
  agent.

`session_query({type: 'network', failedOnly: true})` covers "what failed", so no
dedicated failures tool. Four is the whole surface.

### Read-only, and validated — not lazy here

The server reads a local directory of real session data. Two rules, neither
negotiable:

- **Read-only.** No write, no delete, no move. An agent must not be able to
  destroy evidence, and there is no use case that needs it.
- **No path concatenation.** A session id from a tool call is resolved by
  matching against the actual directory listing, never by joining it onto the
  root path. Session ids are attacker-influenced the moment a session folder is
  shared, and `../` is the obvious way out of the sandbox.

### The papercut worth writing down now

**`showDirectoryPicker` never exposes an absolute path.** The extension only
ever learns `handle.name` — the folder's own name, not where it is. So the
extension *cannot* tell the MCP server where sessions live, and the user states
the path twice: once in the picker, once as `--dir` in MCP config.

Not a blocker, but it belongs in the README rather than being discovered during
implementation. The extension should display the chosen folder name in its UI so
the two can at least be matched up by eye.

### Does it ship a skill?

**No.** `report.md` is self-describing — it states what it is, that it contains
no analysis, and what every other file in the folder holds. The MCP tool
descriptions carry the rest. *`ponytail:` add a skill only if real users turn
out to be confused; a manual for a format that needs one is a sign the format is
wrong.*

### Local-me vs a stranger

**No difference, and that is the test.** Files work identically for both; MCP is
one config block for both. If the answer had diverged, the tool would be
optimised for its author rather than published.

---

### Consequences for other tickets

- **01 (where the code lives)** — now materially affects this: the repo holds
  **two publishable things**, an extension and an npm package. That shapes the
  repo layout question rather than being incidental to it.
- **12 (install and distribution)** — the README grows a second, clearly
  optional install section, and the npm package needs its own release path
  alongside the extension.
- **09** — `schemaVersion` becomes load-bearing rather than decorative: the MCP
  server is a versioned consumer of the format, so an additive-only rule is now
  a compatibility promise.
