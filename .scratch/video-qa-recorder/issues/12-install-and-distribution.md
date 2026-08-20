# Install and distribution across macOS, Linux and Windows

Type: grilling
Status: resolved
Blocked by: 01, 07 (both resolved)

## Question

The destination is "another developer can follow the README and record their
first session." That is a shipping requirement, not a design principle.

- **Chrome Web Store listing or unpacked load from a release zip?** The Store
  means review (and review may care about `chrome.debugger` and
  `host_permissions: <all_urls>`); unpacked means every user needs developer
  mode, and Chrome nags about it on every launch.
- If there is a sidecar: how is it distributed and started? `npx`, a single
  prebuilt binary per platform, a Docker image, or a build-from-source step?
- What is the **honest minimum** README install path, in numbered steps, and how
  many steps is too many before someone gives up?
- Windows specifically — the most likely place a Unix-shaped design breaks.
- Versioning and release process: how does a user find out the extension and the
  sidecar have gone out of sync?
- What does "works" mean on first run — is there a self-test that proves capture,
  transcription and disk output all function before a user trusts a real session?

## Answer

**Release zip on day one, Store submission in parallel. Four-step install, no
terminal on the core path. A four-check self-test after first run.**

---

### Distribution: both, sequenced

Publish an unpacked-loadable **zip on the first GitHub release** so the project
is usable immediately, and submit to the **Chrome Web Store** alongside it.

**The launch is never gated on a review nobody controls.** Store review of this
extension is a genuine risk, not a formality: `chrome.debugger`, tab capture,
and microphone access is close to the exact permission profile reviewers
scrutinise hardest. Ticket 05 helps materially — dropping `<all_urls>` for
`activeTab` plus programmatic injection removes the single most-questioned
manifest entry — but it does not make review predictable.

The Store is also not free: a developer account, a hosted privacy policy, and an
unknown timeline.

So the zip is not a stopgap. It permanently serves three groups: users whose
enterprise policy blocks the Store or developer mode, users who want to read the
source and load it themselves before trusting it with their screen, and everyone
at all during any review gap.

**Store review, when it lands, is worth having** — for a tool that records your
screen and your network traffic, third-party attestation is real trust, and
one-click install with no developer-mode nag is materially better UX.

### There is no sidecar, and that is the whole install story

Ticket 07 killed it. The consequence shows up here: **there are no shell scripts
anywhere in the install path, no compiler, no per-platform binary, no Docker.**
That is what makes Windows tractable rather than a porting project.

The one optional runtime component is the MCP server from ticket 11, distributed
as an npm package and invoked via `npx -y bugcast` — no install step, and Node
is already present on any machine running a coding agent.

### The honest minimum README path

**Four steps to a session. Five to agent handoff. The core path never touches a
terminal.**

1. Install the extension (Store link, or load the release zip unpacked).
2. Click the toolbar icon and press **Record**.
   *First run only: choose a folder for sessions, and pick a Whisper model tier.*
3. Do the thing. Press **Stop**.
4. The session folder is in the folder you chose.

Optional, for agent handoff:

5. Add one block to your MCP config pointing `--dir` at that same folder.

**How many steps is too many?** Drop-off gets steep past five or six for a
developer tool, and much steeper for anything requiring a terminal. Protecting
the no-terminal property of steps 1–4 is the concrete payoff of the whisper.cpp
decision in ticket 03, and it should be defended in any future change.

### Windows — where a Unix-shaped design breaks

One already handled, two live:

- **Handled:** the session folder name is deliberately colon-free (ticket 09) —
  `T14-32-09`, not `T14:32:09` — because colons are illegal in Windows filenames.
- **`.srt` must be written CRLF.** The SubRip format expects it. Most players
  tolerate LF, but "most players" is not a shipping standard.
- **The MCP server is the only component that builds paths as strings**, so it
  uses `path.join` throughout and must accept a `--dir` of the form
  `C:\Users\...`. The extension never constructs a path at all — FSA hands it
  handles, not strings — which removes the entire class of bug from the larger
  component.

Minor and noted, not designed around: Windows' 260-character path limit could
bite if a user picks a deeply nested sessions folder, since session id plus
`frames/` plus filename runs ~70 characters on its own.

### Version drift between the extension and the npm package

Two independently installed artifacts can drift. The mechanism to detect it
already exists from ticket 09: every session carries `schemaVersion` and
`tool.version` in `session.json`.

**Rule: the MCP server refuses loudly on a `schemaVersion` it does not know** —
*"this session was written by a newer bugcast; upgrade the package"* — rather
than best-effort parsing a format it does not understand. Failing clearly beats
returning subtly wrong answers to an agent that will act on them.

Both artifacts release from the **same git tag**, so versions match by
construction even though they install separately.

### First-run self-test — four checks

The tool has four independent subsystems, and a failure in any one produces a
**quietly bad artifact rather than an error**. That asymmetry is what justifies
the check: the alternative is a user narrating ten careful minutes and then
discovering the transcript never happened.

Run once automatically after first-run setup, and available afterwards as a
**Run self-test** button:

1. **CDP** — attach the debugger to a blank tab, then detach.
2. **Capture** — run a 2-second `tabCapture` and confirm bytes arrived.
3. **Disk** — write a probe file into the chosen directory and read it back.
4. **ASR** — run the downloaded Whisper model against a bundled ~20 KB audio
   clip with known text.

Reports pass/fail per subsystem, so a failure names its own cause.

**Check 4 is the one that earns its place.** Model download plus first inference
is the slowest step, the most platform-dependent, and the most likely to fail
silently — and it is the only way to prove transcription works *before* a real
session depends on it. It also settles the WebGPU-vs-WASM question in passing by
being the first real measurement on that machine.

---

### Consequences

- **Fog: WebGPU vs WASM benchmark** — the self-test's ASR check is a natural
  place to measure it on real hardware, which is where that question always
  belonged.
- **Ticket 05's README requirements are release-blocking**, and the Store
  submission needs a hosted privacy policy saying the same things.
- **CI is built from scratch** (ticket 01) — nothing is inherited from the
  monorepo. Minimum: typecheck, lint, build the extension zip, publish both
  artifacts from a tag.
