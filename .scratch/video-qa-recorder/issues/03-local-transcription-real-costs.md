# Local transcription: the real cost of each engine

Type: research
Status: resolved

## Question

Two candidate architectures, and the "any developer, any OS" constraint decides
between them on facts we do not have yet:

**A. whisper.cpp via a local sidecar.** Native `--output-srt`, so SRT is free
rather than hand-rolled. But MV3 cannot shell out, so it needs a companion
process, and that process must install on macOS, Linux and Windows without a
Homebrew assumption.

**B. transformers.js Whisper on WebGPU, inside the extension.** Zero native
dependencies, nothing to install, works for a stranger who only loads the
extension. But the model must be downloaded, WebGPU must be available in an MV3
offscreen document, and SRT timing has to be derived by hand.

Establish:

- Real transcription speed for ~10 minutes of narration on a mid-range machine,
  both paths. Is post-hoc transcription fast enough that no live pipeline is
  needed at all?
- Model size on disk / over the wire, and which model tier (`base`/`small`) is
  the honest default for QA narration.
- Does transformers.js Whisper emit **word- or segment-level timestamps** good
  enough for SRT, and does WebGPU actually work in an MV3 offscreen document
  today?
- Cross-platform distribution options for whisper.cpp: prebuilt binaries,
  `npx`/`bunx` wrapper, `nodejs-whisper`, or a Rust/Go single binary.
- Whether a **pluggable** design (ship B, allow A) costs meaningfully more than
  picking one.

Note: "LocalVocal" is an OBS plugin and "OpenWispr"/Wispr Flow are dictation
apps — all wrap whisper.cpp. Evaluate the primitive, not the wrappers.

## Answer

### Recommendation (opinion, separate from the facts below)

**Ship B (transformers.js + WebGPU, in-extension) as the only default path.**
Do not attempt full A/B pluggability now. The single fact that decides this:
whisper.cpp's own official releases ship **zero macOS CLI binaries** (checked
live, last 30 releases) — the only real macOS distribution channels are
Homebrew or building from source with Xcode CLT, and the project's constraints
rule both out for the default path. Every Node.js binding evaluated for A
either requires a real compiler toolchain at `npm install` time or is a
low-adoption, under-vetted project. B has no such blocker: WebGPU-in-an-MV3-
offscreen-document is demonstrated in official Google and Hugging Face
samples, and even the **pessimistic** case found in real benchmarks (WASM
fallback, no WebGPU) is fast enough for post-hoc transcription of a 10-minute
recording. Build the internal boundary cleanly (engine → timestamped segments
→ one shared SRT writer) so A can be bolted on later as an opt-in "bring your
own whisper.cpp" escape hatch if a trustworthy no-compiler macOS binary shows
up — but don't build the sidecar-lifecycle machinery (native messaging host,
install detection, start/stop, IPC) until there's a real reason to.

---

### Q1 — Does WebGPU work in an MV3 offscreen document today?

**CONFIRMED, yes, and it's demonstrated, not theoretical.**

- The documented pattern: the service worker calls `chrome.offscreen.createDocument()` to open `offscreen.html`; `navigator.gpu` is accessible from that document's script, and the service worker talks to it over `chrome.runtime` messaging. Google's own official sample repo demonstrates exactly this: [`GoogleChrome/chrome-extensions-samples/functional-samples/sample.webgpu`](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/sample.webgpu).
- Hugging Face's own tutorial for putting transformers.js in a Chrome MV3 extension exists and is current: [huggingface.co/blog/transformersjs-chrome-extension](https://huggingface.co/blog/transformersjs-chrome-extension). It uses `device: "webgpu"` in the pipeline call and treats the service-worker-suspend/resume lifecycle as the main gotcha (re-init model state on wake), not WebGPU availability.
- Real, working extensions exist doing tab-audio → transformers.js Whisper → WebGPU: [`AIex7/Local-Whisper-Captions-Chrome-Extension-`](https://github.com/AIex7/Local-Whisper-Captions-Chrome-Extension-) (captures tab audio, not mic; explicitly "lean on WebGPU for accelerated speech-to-text"), and [`tantara/transformers.js-chrome`](https://github.com/tantara/transformers.js-chrome). Caveat: these are small/low-adoption demo projects (the AIex7 one has 4 stars, 8 commits) — proof it *works*, not proof it's *battle-tested*.
- Nuance worth flagging: the official `chrome.offscreen` `Reason` enum ([developer.chrome.com/docs/extensions/reference/api/offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen)) has **no explicit `WEBGPU` or GPU reason** — the documented reasons are `AUDIO_PLAYBACK, IFRAME_SCRIPTING, DOM_SCRAPING, BLOBS, DOM_PARSER, USER_MEDIA, DISPLAY_MEDIA, WEB_RTC, CLIPBOARD, LOCAL_STORAGE, WORKERS, BATTERY_STATUS, MATCH_MEDIA, GEOLOCATION`. In practice implementers pick the closest fit (commonly `WORKERS`, since ONNX Runtime Web spins up worker threads). This is a documentation gap, not a functional blocker.
- Additional nuance: as of **Chrome 124 (April 2024)**, WebGPU became directly accessible from the extension **service worker itself**, no offscreen document required for pure compute — confirmed in a Chromium extensions Google Group thread where a Google engineer (Patrick Kettner) states the offscreen-document workaround was necessary pre-124, and a later reply confirms "Chrome 124 supports WebGPU in Service Worker and Shared Worker" ([groups.google.com/a/chromium.org/g/chromium-extensions/c/ZEcSLsjCw84](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/ZEcSLsjCw84)). Given our target audience is "any developer," and Chrome 124 is old (2024) at this point, either pattern is safely available; the offscreen-document route is the better-trodden path in existing examples and keeps AudioWorklet tab-capture and inference co-located anyway.

### Q2 — Timestamp granularity from transformers.js Whisper

**CONFIRMED — both segment- and word-level timestamps are available, segment-level is the safer default for SRT.**

- API: `pipeline('automatic-speech-recognition', model, { return_timestamps: true })` → segment-level `chunks`, each `{ text, timestamp: [start, end] }`. `return_timestamps: 'word'` → same shape but one chunk per word. Source: multiple transformers.js issues confirm this shape, e.g. [huggingface/transformers.js#1198](https://github.com/huggingface/transformers.js/issues/1198), [#551](https://github.com/huggingface/transformers.js/issues/551).
- Segment-level `chunks` map directly onto SRT cues (this is genuinely "free" once you have them — same shape whisper.cpp's own `--output-srt` produces). Word-level timestamps let you build finer-grained or karaoke-style cues if wanted, but are not required for a correct SRT.
- Known correctness bugs specifically in the timestamp path (relevant because SRT correctness depends on it):
  - Pre-2.14.0 transformers.js: word-level timestamps sometimes all collapsed to the total audio duration ([#551](https://github.com/huggingface/transformers.js/issues/551), now fixed).
  - `onnx-community/whisper-base_timestamped` with the **default** `chunk_length_s: 30` produced corrupted word timestamps (all chunks reporting `29.98 → 29.98`); reducing to `chunk_length_s: 29` fixed it. Filed July 2025, closed via PR #1594. Source: [huggingface/transformers.js#1358](https://github.com/huggingface/transformers.js/issues/1358). **Take-away: verify actual timestamp output on a real >30s recording before trusting it, don't assume the default chunking config is safe.**
  - Whisper's word-level timestamps in general (not transformers.js-specific — inherited from the underlying cross-attention + dynamic-time-warping technique) are known to be less reliable than segment-level across the ecosystem: [huggingface/transformers#25605](https://github.com/huggingface/transformers/issues/25605), [#21412](https://github.com/huggingface/transformers/issues/21412).
- **Recommendation for this project:** build SRT from segment-level `return_timestamps: true` output as the primary path; treat word-level as an optional future enhancement, not a dependency.

### Q3 — Real speed and model size, both paths

**Model size — CONFIRMED via direct file-size check (HTTP HEAD, huggingface.co, Aug 2026):**

| Model | transformers.js ONNX (int8, both encoder+decoder) | whisper.cpp GGML fp16 | whisper.cpp GGML q5_1 |
|---|---|---|---|
| tiny | ~41 MB (10.1 + 30.7) | 77.7 MB | 32.2 MB |
| base | ~77 MB (23.2 + 53.7) | 148.0 MB | 59.7 MB |
| small | ~249 MB (92.3 + 156.8) | 487.6 MB | 190.1 MB |

Both paths are in the same "tens to a couple hundred MB" ballpark; whisper.cpp's quantized (q5_1) variant is somewhat smaller than transformers.js's default quantized ONNX at the same tier, but neither is a meaningful download-time or disk-space blocker for a one-time fetch.

**Speed — mixed confidence, this is the part that most needs a local benchmark:**

- whisper.cpp on CPU (x86, no GPU): blog-reported "3–5 minutes to process a 60-minute file with `base.en`" (~12–20x real-time) and "`small.en` took ~24 minutes for a ~1-hour speech" (~2.5x real-time) — UNVERIFIED-tier sources (SEO/aggregator blogs, not a primary benchmark harness): [getspeakup.app](https://getspeakup.app/blog/whisper-cpp-benchmark-mac/), [localaimaster.com](https://localaimaster.com/blog/whisper-local-speech-to-text). Directionally consistent with well-known whisper.cpp behavior (base is the CPU sweet spot, small is markedly slower) but treat exact multipliers as approximate.
- On weaker CPUs the "small" tier can drop **below** real-time: Raspberry Pi 5 reported at 0.4–0.6x real-time for `small`, ~1–2x for `base` — again UNVERIFIED/blog-tier ([promptquorum.com](https://www.promptquorum.com/power-local-llm/local-whisper-stt-comparison-2026)). Relevant because "mid-range laptop" spans a wide range; base is the safer floor.
- **transformers.js WebGPU vs WASM — the one piece of real, primary-source benchmark data found, and it contradicts the marketing claim.** In [huggingface/transformers.js#894](https://github.com/huggingface/transformers.js/issues/894), a user benchmarked `onnx-community/whisper-base_timestamped` (transformers.js v3.0.0-alpha.6) transcribing 60s of audio on a Mac mini M2: **WASM was faster than WebGPU in every configuration tested** (WASM 4.9–5.9s vs WebGPU 9.5–27s, depending on quantization). This is CONFIRMED primary-source data, not a vendor claim, and it's exactly the kind of result the ticket asked to hunt for instead of trusting "WebGPU is 5-10x faster" marketing copy (which does appear elsewhere as an unsupported blog claim, e.g. [offlinetts.com](https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/), itself explicitly disclaiming universal numbers and recommending exactly the kind of local benchmark this ticket was told not to run).
- **Practical reading:** WebGPU is not a guaranteed win for Whisper-sized models — kernel-dispatch overhead can dominate for small/quantized models, and results are hardware/driver/quantization-format dependent. The saving grace (see Q4) is that WASM alone is still fast enough for post-hoc use, so this uncertainty does not block the architecture, it just means "assume WASM-class speed, treat WebGPU as a possible bonus, and verify on real target hardware before advertising a specific speedup."
- **Honest default model tier:** `base`. It's the CPU-viable, blog-consistent "few minutes per hour of audio" tier on both engines, small enough to bundle, and safely inside real-time on modest hardware. `small` is a reasonable **opt-in** "higher accuracy" tier (better on cleaner audio/technical vocabulary) since post-hoc tolerates it being slower — but it should not be the shipped default given it can go sub-real-time on weak/no-GPU machines. `tiny` was not evaluated for accuracy on technical QA narration (UI element names, URLs, jargon) in this research; treat it as unverified for this use case and prefer `base`.

### Q4 — Is post-hoc transcription fast enough (no live pipeline needed)?

**CONFIRMED (by inference from Q3 numbers, not a direct benchmark of "10 minutes exactly").** Yes, comfortably, on both architectures:

- whisper.cpp CPU with `base`: ~12–20x real-time ⇒ a 10-minute recording transcribes in well under a minute, likely 30–60s.
- transformers.js even in the **pessimistic WASM-only** case from the M2 benchmark above (~5–6s per 60s of audio ⇒ ~10–12x real-time) ⇒ a 10-minute recording finishes in under a minute, before WebGPU is even considered.
- Both numbers are an order of magnitude faster than "wait for a 10-minute post-hoc transcode," which is itself already an acceptable UX for a "press stop, get your artifacts" QA tool. **A live/streaming transcription pipeline is not justified by speed** — it would add real complexity (chunk stitching, partial-result reconciliation, latency budgeting) to solve a problem that doesn't exist. Recommend: transcribe the full recorded audio track once, after Stop is pressed.

### Q5 — Cross-platform distribution of whisper.cpp

**This is the ticket's decisive finding.** Every option evaluated:

| Option | No compiler needed? | Windows | Linux | macOS | Notes |
|---|---|---|---|---|---|
| **whisper.cpp official GitHub releases** | Partial | ✅ prebuilt (Win32/x64, +BLAS/+cuBLAS variants) | ✅ prebuilt (Ubuntu x64/arm64) | ❌ **no CLI binary at all** | CONFIRMED live via GitHub API, checked latest + last 30 releases (Aug 2026): only Windows/Linux CLI zips + an iOS/macOS **xcframework** (a Swift-embeddable library, not a runnable CLI). |
| `nodejs-whisper` | ❌ No | needs MinGW-w64/MSYS2 | needs `build-essential` | needs Xcode CLT | CONFIRMED from README: explicitly documents installing a compiler before `npm i`. |
| `smart-whisper` | ❌ No (despite README wording) | node-gyp rebuild | node-gyp rebuild | node-gyp rebuild | CONFIRMED by reading `package.json` directly: `"install": "node-gyp rebuild"`, `"gypfile": true`, no prebuild-install/prebuildify fallback. README says "out of the box" but that refers to *GPU library* config, not *compiler* — every install still runs a native build requiring Python + a C/C++ toolchain. Actively maintained (pushed Aug 16, 2026), 76 stars. |
| `@kutalia/whisper-node-addon` | ✅ Yes, for the default path | ✅ prebuilt `.node` | ✅ prebuilt `.node` | ✅ prebuilt `.node` | CONFIRMED from README: "Pre-built .node binaries for Windows (x64), Linux (x64/arm64), macOS (x64/arm64)... No native compilation headaches." The listed compiler/CMake/Vulkan requirements apply only if you build extra GPU backends yourself. **Best-fitting Node binding found**, but low adoption (14 stars, last push July 2025 — over a year stale) — an installability/maintenance risk for "any developer." |
| `whisper-node` (ariym) / `@lumen-labs-dev/whisper-node` | Partial | ✅ downloads precompiled binary, shells out | ❌ falls back to source build | ❌ falls back to source build | UNVERIFIED/secondary-source claim — worth direct verification before relying on it. |
| `faster-whisper` (CTranslate2, Python) | ✅ Yes | ✅ | ✅ | ✅ (arm64 + x86_64) | CONFIRMED via live PyPI JSON API: `ctranslate2` 4.8.1 ships prebuilt wheels for macOS (both arches), manylinux (both arches), and Windows across Python 3.9–3.14. Genuine no-compiler install on all three OSes — **provided Python is already present**, a separate runtime dependency alongside the Node.js the extension tooling already needs. **But: no built-in SRT/VTT export** — CONFIRMED via [SYSTRAN/faster-whisper#93](https://github.com/SYSTRAN/faster-whisper/discussions/93), users hand-roll SRT (e.g. via `pysubs2`). This erases whisper.cpp's stated advantage ("SRT is free") — with faster-whisper you're back to deriving SRT by hand, same cost as architecture B, but now shipping two runtimes (Node + Python) instead of one. |
| `npx`/`bunx` thin wrapper fetching the right release asset | N/A | would work | would work | **would not** — nothing to fetch, see above | No such wrapper package was found already built; someone would have to write it, and it inherits the macOS gap. |
| Rust/Go single static binary | N/A | — | — | — | No dedicated cross-platform single-binary whisper product was found beyond whisper.cpp's own C++ binaries and community forks/rehosts (e.g. [`yaklang/whisper.cpp.binary`](https://github.com/yaklang/whisper.cpp.binary), unverified maintenance). `whisper-rs` (Rust bindings to whisper.cpp) exists but was not evaluated in depth — flag for follow-up if A is revisited later. |

**LocalVocal / OpenWispr / Wispr Flow — "reusable local server" check (rung 5 of the lazy ladder):**
- **LocalVocal** ([locaal-ai/obs-localvocal](https://github.com/locaal-ai/obs-localvocal)): CONFIRMED an in-process OBS plugin wrapping whisper.cpp for live captions inside OBS. No evidence found of it exposing a standalone local HTTP/WebSocket transcription API independent of OBS — the only "server" in that ecosystem is `obs-websocket`, a general remote-control API for OBS itself, unrelated to transcription. Not reusable here.
- **OpenWispr / OpenWhispr / open-wispr** (the several similarly-named open-source Wispr-Flow-alternative dictation apps): Tauri/Electron apps that record → whisper.cpp locally → inject text at the OS cursor via a global hotkey. No evidence found that any of them run a persistent local transcription server a third-party extension could call — they're single-purpose keyboard-injection tools, not services.
- **Wispr Flow** itself (the closed-source original the user also named): CONFIRMED **cloud-only, no offline/local mode at all** ([parakeety.com](https://www.parakeety.com/resources/does-wispr-flow-run-locally)) — irrelevant to a local-first requirement regardless of API surface.
- **Conclusion: no existing local server to "just talk to."** Any A-path implementation has to ship/manage its own whisper.cpp process.

### Q6 — Cost of a pluggable design (ship B, allow A) vs. committing to one

Judgment call, grounded in the above facts rather than a citable external source:

- The two engines are shape-compatible at the boundary the project actually needs: both ultimately produce timestamped text segments, which feed one shared SRT writer. That abstraction (`engine → TranscriptSegment[] → writeSRT()`) is cheap to build regardless of how many engines are supported, and should be built that way from day one either way.
- The real cost of pluggability isn't the data shape, it's operational: architecture A needs a **native-messaging host + external-process lifecycle manager** (detect install, version-check, start/stop, IPC framing over stdio or a local socket) that B doesn't need at all, plus a settings UI to pick/detect the active engine, plus roughly double the test/QA matrix (in-browser WebGPU/WASM path × 3 OSes, **and** external-process path × 3 OSes × "is whisper.cpp even installed" states).
- Given Q5's finding — there is currently no clean no-compiler, no-Homebrew whisper.cpp distribution story for macOS — **fully productizing A as a first-class shippable default is not viable today** without violating the project's own constraints. That makes "commit to B now, leave a clean seam for A later" strictly cheaper than building real pluggability today: you'd be paying the sidecar-lifecycle cost for a path that can't legitimately reach all three target OSes yet anyway.
- Recommended shape: ship B only, but keep the engine boundary abstract internally. If a trustworthy no-compiler macOS whisper.cpp binary later appears (upstream starts shipping one, or a vetted third party does), A can be added as an **opt-in "bring your own whisper.cpp"** power-user path — user points the extension at an existing local install — without touching the SRT-writing code, and without the extension being responsible for installing/updating whisper.cpp itself.

### What only a local benchmark can settle

- Real transformers.js WebGPU vs. WASM speed **on the actual target laptop classes** (the one primary data point found, Mac mini M2, showed WASM winning — this needs re-checking on current transformers.js/Chrome versions, and on a non-Apple-Silicon mid-range Windows/Linux laptop, since GPU driver quality varies far more there).
- Whether `base`-tier accuracy is actually acceptable for QA narration containing UI element names, URLs, and technical jargon, vs. `small` — no WER data specific to this content type was found for either engine.
- Whether `@kutalia/whisper-node-addon`'s prebuilt binaries actually work cleanly across all three OSes in practice today (project is real but low-adoption and over a year since last push relative to Aug 2026).
- Exact current-Chrome-version behavior of WebGPU directly in the service worker vs. via offscreen document (Chrome 124 added the former; whether it's now the simpler/preferred route for a pure-compute ONNX Runtime Web workload wasn't verified hands-on).
- End-to-end power/thermal impact of a 10-minute post-hoc WebGPU transcription burst on battery-powered laptops (not researched).

### Sources

- [GoogleChrome/chrome-extensions-samples — sample.webgpu](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/sample.webgpu)
- [Hugging Face — How to Use Transformers.js in a Chrome Extension](https://huggingface.co/blog/transformersjs-chrome-extension)
- [AIex7/Local-Whisper-Captions-Chrome-Extension-](https://github.com/AIex7/Local-Whisper-Captions-Chrome-Extension-)
- [tantara/transformers.js-chrome](https://github.com/tantara/transformers.js-chrome)
- [Chrome for Developers — chrome.offscreen API reference](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Chromium extensions Google Group — WebGPU API not accessible in service_worker](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/ZEcSLsjCw84)
- [huggingface/transformers.js#1198 — word-level timestamps](https://github.com/huggingface/transformers.js/issues/1198)
- [huggingface/transformers.js#551 — word-level timestamps broken](https://github.com/huggingface/transformers.js/issues/551)
- [huggingface/transformers.js#1358 — whisper-base_timestamped broken with chunk_length_s=30](https://github.com/huggingface/transformers.js/issues/1358)
- [huggingface/transformers#25605, #21412 — Whisper word-level timestamp accuracy](https://github.com/huggingface/transformers/issues/25605)
- [huggingface/transformers.js#894 — Whisper WebGPU vs WASM performance (Mac mini M2, primary benchmark data)](https://github.com/huggingface/transformers.js/issues/894)
- [offlinetts.com — Browser Speech Recognition: Whisper STT Guide (unverified blog claims + explicit disclaimer)](https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/)
- Hugging Face model file sizes: `Xenova/whisper-{tiny,base,small}` `onnx/*_quantized.onnx` (checked live via HTTP HEAD)
- Whisper.cpp GGML model file sizes: `ggerganov/whisper.cpp` on Hugging Face (checked live via HTTP HEAD)
- [ggml-org/whisper.cpp — GitHub Releases](https://github.com/ggml-org/whisper.cpp/releases) (checked live via `gh api`, latest + last 30 releases)
- Homebrew `whisper-cpp` formula (confirmed present via `brew info whisper-cpp`)
- [ChetanXpro/nodejs-whisper](https://github.com/ChetanXpro/nodejs-whisper)
- [JacobLinCool/smart-whisper](https://github.com/JacobLinCool/smart-whisper) (`package.json` read directly)
- [Kutalia/whisper-node-addon](https://github.com/Kutalia/whisper-node-addon)
- [SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper) and [PyPI — ctranslate2](https://pypi.org/project/ctranslate2/) (wheel list checked live via PyPI JSON API)
- [SYSTRAN/faster-whisper#93 — no built-in SRT export](https://github.com/SYSTRAN/faster-whisper/discussions/93)
- [locaal-ai/obs-localvocal](https://github.com/locaal-ai/obs-localvocal)
- [parakeety.com — Does Wispr Flow run locally? No, it's cloud-only](https://www.parakeety.com/resources/does-wispr-flow-run-locally)
- [getspeakup.app — whisper.cpp benchmark](https://getspeakup.app/blog/whisper-cpp-benchmark-mac/), [localaimaster.com](https://localaimaster.com/blog/whisper-local-speech-to-text), [promptquorum.com](https://www.promptquorum.com/power-local-llm/local-whisper-stt-comparison-2026) (blog-tier speed claims, flagged UNVERIFIED throughout)
