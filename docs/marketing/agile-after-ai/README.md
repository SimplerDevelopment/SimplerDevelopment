# If Agile Were Invented After AI

Source for the scroll-driven WebGL essay served at `/agile-after-ai`.

## Files

| File | Role |
|---|---|
| `index.src.html` | Editable source. Links `css/main.css` + `js/app.js` as separate files. |
| `main.css` | Blueprint design system. SD teal = machine execution, amber = human decision. |
| `app.js` | Scene layer: 8 scenes, blended camera, GLSL point shader. Pure enhancement. |
| `build.py` | Inlines the three into the deployed single-file artifact. |
| `check.mjs` | Playwright check for the narration transport. Stubs its own clips. |

The deployed artifact is `public/agile-after-ai/index.html` — a single self-contained
file with CSS and JS inlined. `app/agile-after-ai/route.ts` serves it at the clean URL.

## Rebuilding after an edit

Edit the three source files here, then inline them into the deployed asset:

```bash
# from the repo root
bun build docs/marketing/agile-after-ai/app.js \
  --outfile=/tmp/app.min.js --minify --format=esm --target=browser
python3 docs/marketing/agile-after-ai/build.py
node   docs/marketing/agile-after-ai/check.mjs      # transport still behaves
```

> **The build collapses every indented line onto one line, inside `<script>` too.**
> That is why the base-layer script in `index.src.html` uses only `/* block */`
> comments — a `//` comment would swallow the rest of the script. `build.py` runs
> `node --check` over each inlined block so this fails loudly rather than silently.

## Narration

Nine clips, one per slide (the hero plus the eight `data-scene` sections), listed in
the `window.__sdNarration` manifest near the bottom of `index.src.html`. A slide whose
entry is `null` simply gets no listen button; the piece reads exactly the same.

The transport is dependency-free and lives in the base-layer script, so it works on the
reduced-motion path where `app.js` never loads. Its one contract: **it never starts
sound on its own.** A clip plays only from a click, or — once *Auto* has been switched
on by hand — as the continuous run advances. `Auto` and mute both persist in
`localStorage`, and even a persisted `Auto` waits for a gesture before the first play.

The nine live clips run 83–118s each and total ~7 MB, hosted in the portal media
library (rows 440–448 on site 241) and served same-origin from `/api/media/proxy/…`.

### Regenerating the clips

```bash
nlm login                    # NotebookLM tokens expire mid-session; expect to redo this
```

Then, per slide: create a NotebookLM notebook, add each section's text as its own
source, and generate one `audio` artifact per source with
`audio_format: 'brief'`, `audio_length: 'short'` and `source_ids` pinned to that one
section — scoping by source keeps a clip from wandering into the rest of the essay,
which a bare `focus_prompt` does not. Download each, upload to the portal media
library (`media_upload_presign` → `curl --upload-file` → `media_register`), then paste
the returned URLs into the manifest and rebuild.

Section text for the sources is derived from `index.src.html`, so it never drifts from
the published prose — re-extract it rather than keeping a second copy.

Three things that will bite on a rerun:

- **NotebookLM hands back `.m4a`, which the portal rejects.** The media allow-list is
  `audio/mpeg`, `audio/ogg`, `audio/wav` only. Transcode first —
  `ffmpeg -i in.m4a -ac 1 -b:a 64k out.mp3` is transparent for speech and cuts ~3.5 MB
  to under 1 MB.
- **Artifact status is useless as a readiness signal.** The API reports `unknown` for
  both *generating* and *finished*. Infer readiness from a download that succeeds and
  returns a plausibly-sized file.
- **A generation can fail silently** — it just never becomes downloadable. One of the
  nine did. Give it a ceiling and regenerate rather than polling forever.

## Constraints worth knowing

- **Three.js, GSAP and Lenis load from `esm.sh` at runtime**, and only once a scene
  approaches the viewport. If the CDN is unreachable the article still reads: reveals,
  the ladder highlighting and the effort bars run from a dependency-free inline script.
- **`prefers-reduced-motion` opts out entirely** — no WebGL is fetched, and the piece
  degrades to a real static reading path rather than a broken one.
- **It must own the viewport.** It was deliberately not shipped as a `/blog/<slug>`
  html-embed block: that renders a fixed-height iframe which consumes scroll inside a
  page that also scrolls, trapping the reader.
