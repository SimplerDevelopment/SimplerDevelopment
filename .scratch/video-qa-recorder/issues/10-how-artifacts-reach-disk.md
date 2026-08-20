# How artifacts reach disk

Type: grilling
Status: open
Blocked by: 07

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
