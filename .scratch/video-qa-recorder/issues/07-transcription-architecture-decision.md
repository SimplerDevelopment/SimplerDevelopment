# Transcription architecture decision

Type: grilling
Status: resolved
Blocked by: 03

## Question

Given the measured costs, decide the transcription path — this is the single
decision that most constrains the rest of the map, because choosing the sidecar
unlocks real filesystem output and choosing in-browser forecloses it.

- **Sidecar (whisper.cpp), in-browser (transformers.js/WebGPU), or pluggable?**
- If a sidecar: what is it written in, how is it started (does the extension
  detect it and degrade gracefully when absent?), and how does a Windows
  developer install it in one command?
- If in-browser: where does the model come from on first run, given the
  "zero network calls" principle — is a one-time model download an acceptable
  exception, or does the model ship with the extension?
- **Live or post-hoc?** Transcribing the recorded audio track after stop is far
  simpler than a streaming pipeline. Is there any requirement that forces live?
- Is audio recorded as a separate track from the video, so it can be fed to the
  transcriber without demuxing?
- What happens when the user records with no microphone, or says nothing?

## Answer

**In-extension transformers.js. No transcription sidecar.**

Forced by [ticket 03](03-local-transcription-real-costs.md): whisper.cpp ships no
macOS CLI binary in any recent release (verified live — Ubuntu and Windows only;
macOS gets an xcframework), and every Node binding either needs a compiler
toolchain or is a 14-star package unmaintained since 2025. A sidecar therefore
cannot deliver one-command install on the primary developer's own OS, which
fails the map's "any developer, OS-agnostic" constraint outright.

Keep a clean **engine → segments → SRT** seam so a bring-your-own-whisper.cpp
path can be added later as opt-in, without the rest of the system knowing.

### Model delivery — download by default, offline mode available

Ships small; fetches the ONNX model on the first session that needs
transcription, caches it permanently, and never touches the network again.
"Fully local" is a promise about *your data*, not network abstinence — the
extension itself arrives over the network too.

An explicit **offline path** is supported: point at a locally-provided model
file, for air-gapped or high-security environments. Costs one config path and a
README section.

### Model tier — asked once, at first run

No hardcoded default. The first-run dialog presents the trade-off (tiny ~75MB
fast/sloppy · base ~145MB balanced · small ~480MB best on identifiers and
jargon) and remembers the choice.

**This collapses three decisions into one UI moment**: the tier prompt is also
where the download is explained and where the offline/local-model option is
offered. One dialog, not three scattered settings — and it is the only place the
user is asked anything before recording.

### Post-hoc, not streaming

Ticket 03 measured a 10-minute recording transcribing in under a minute even on
the pessimistic benchmark, so there is no requirement forcing a live pipeline.
Transcribe after stop. Drops an entire streaming architecture for nothing lost.

### Audio path — AudioContext tee (resolves a conflict between two tickets)

This ticket originally asked for audio as a **separate track** so the transcriber
would not have to demux, while [ticket 04](04-clock-sources-and-normalization.md)
concluded the opposite — a **single** `MediaRecorder`, because `chrome.tabCapture`
mutes the tab unless routed through an `AudioContext` and separate recorders have
no documented sync guarantee.

The conflict dissolves. Mic → one `AudioContext`, then **tee**:

- one branch mixes into the single `MediaRecorder` — keeps A/V sync, unmutes the tab;
- one branch is an `AudioWorklet` tap emitting raw **16 kHz mono PCM** straight to
  Whisper.

No demux, no sync loss, and Whisper receives exactly the format it wants with no
encode/decode round-trip. Both branches share the `AudioContext` clock, so SRT cue
offsets and video frames stay on the same origin.

### No mic, or silence — optional, default ON

The mic records unless explicitly disabled; narration is the point of the tool, so
the default reflects it. Permission is requested on first record. A session with
no microphone or no speech simply produces **no `.srt`** — the event timeline is
unaffected and the session remains valid. No branching beyond "was there audio".

### Consequences for other tickets

- **[10 How artifacts reach disk](10-how-artifacts-reach-disk.md)** — the sidecar
  option is dead. The real choice is now `chrome.downloads` vs File System Access API.
- **[11 How an agent consumes a session](11-how-an-agent-consumes-a-session.md)** —
  MCP no longer rides along on an existing process; it would cost a separate one.
- **[12 Install and distribution](12-install-and-distribution.md)** — no native
  dependency to distribute. Install is "load the extension", which is exactly what
  the destination needs. Still blocked on 01.
