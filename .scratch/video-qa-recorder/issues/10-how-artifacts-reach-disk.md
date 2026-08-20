# How artifacts reach disk

Type: grilling
Status: resolved
Blocked by: 07 (resolved)

## Question

MV3 cannot write to arbitrary paths. Three routes, and the transcription
decision has probably already narrowed them:

- **`chrome.downloads`** — everything lands in `~/Downloads` as separate files,
  with the browser's own filename-collision mangling. Zero install, ugly output.
- **File System Access API** (`showDirectoryPicker`) — the user grants a real
  directory once and the extension writes a proper session folder into it.
  Confirm this works from an extension context in MV3 and that the grant
  persists across restarts.
- **Sidecar HTTP POST** — if a sidecar already exists for transcription, it can
  own the filesystem, and this is nearly free.

Decide the primary route and the fallback when the primary is unavailable.
Also: where do sessions live by default, and can the path be configured?

## Answer

**File System Access API as the primary route, with a single-`.zip`
`chrome.downloads` fallback.** The sidecar option died with ticket 07.

---

### Why FSA wins, and it is not about aesthetics

The ticket frames this as "zero install, ugly output" versus "a proper session
folder." The real argument is **memory**.

With `chrome.downloads`, every `MediaRecorder` chunk is held in RAM until the
session stops and a blob URL can be handed to the downloads API — roughly
**170 MB for a 15-minute session and ~350 MB for 30 minutes** at ticket 08's
settings. With FSA you call `createWritable()` at record start and stream each
`dataavailable` chunk straight to disk as it arrives, so peak memory is one
chunk. That is not a nicety; it is what makes long sessions possible at all.

The secondary problems with `chrome.downloads` are real but would not, alone,
have decided it:

- **~205 shelf entries per session** (one webm, four text files, ~200 frames).
- The Downloads API *does* accept subdirectory paths, so the folder shape is
  achievable — but the default `conflictAction: 'uniquify'` appends ` (1)` to a
  colliding name, which would **silently invalidate every `frame` path in
  `timeline.json`**. Correctness, not ugliness. (`'overwrite'` avoids it.)

### The fallback: one zip, not 205 files

When FSA is unavailable or declined, write the entire session as a **single
`.zip`** via `chrome.downloads` to `~/Downloads/video-qa/<session-id>.zip` —
one file, one shelf entry, no collision mangling, no broken references. `fflate`
is ~8 KB.

**The fallback exists because of enterprise policy, not user error.** Managed
Chrome can block FSA writes outright via `DefaultFileSystemWriteGuardSetting` /
`FileSystemWriteBlockedForUrls`. Without a fallback, a corporate user has a
completely dead tool. That is the case this is buying insurance against.

**State its limits honestly:** the zip path cannot stream to disk, so it
re-inherits the memory ceiling FSA was chosen to escape. Peak is ~1× session
size (a Blob assembled from chunks, not a decoded copy), which is survivable
but not comfortable. The fallback should **warn above ~10 minutes**, and the
README should say the fallback is a degraded mode rather than an equal option.

### Where sessions live

**The user picks, on first run. There is no default path** — the extension
cannot know or create `~/qa-sessions` without a picker anyway, so inventing a
default would just add a step. Reconfiguring is re-picking.

### Handle persistence, and one thing needing manual confirmation

The `FileSystemDirectoryHandle` is structured-cloneable, so it persists in
**IndexedDB** across restarts. On startup, `queryPermission({mode:
'readwrite'})` — expect it to return `'prompt'` after a browser restart,
requiring `requestPermission()` under a user gesture, i.e. **roughly one
re-grant click per browser session**.

**Flagged as unverified rather than asserted.** Confirming it means driving a
native OS directory dialog, which Playwright cannot do — so unlike the CDP work
in ticket 13, this one is not spikeable and needs a human clicking through it
once. If the re-grant turns out to fire more often than per-restart, the
recording UX has to absorb it.

### The offscreen document can reach the handle

`MediaRecorder` needs a DOM context, so it lives in an offscreen document, and
handles cannot travel through `chrome.runtime.sendMessage` (JSON-serialized).
They do not need to: the offscreen document shares the extension origin and
reads the handle **directly from IndexedDB**.

---

### Consequences for other tickets

- **12 (install and distribution)** — the first-run flow now includes a
  directory grant, and the README must cover the enterprise-policy fallback.
- **11** — the MCP server needs a filesystem *path*, which FSA never exposes.
  See the papercut recorded there.
- **Fog: session storage and retention** — the user owns the directory, so
  pruning is theirs. Nothing in the tool deletes anything.
