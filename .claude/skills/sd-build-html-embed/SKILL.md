---
name: sd-build-html-embed
description: Author a self-contained HTML experience (single index.html OR multi-file bundle with css/js/images/fonts) entirely in Claude Code, then upload it to the SimplerDevelopment portal as a draft page or single-slide pitch deck. The output is a sandboxed iframe-rendered `html-embed` block — useful for interactive prototypes, motion-design experiments, custom calculators, immersive landing pages, or anything that would otherwise be impossible inside the visual block editor. Supports two upload paths — `posts_upload_html` for a single ≤1 MB HTML file, or `posts_upload_html_zip` (and the deck variants) for a multi-file zipped bundle up to 50 MB. Returns a portal post + approval URL. Use when the user says 'build an HTML embed', 'make an interactive widget', 'custom landing page with a working demo', 'huashu-style hi-fi mockup', 'upload this prototype', 'zip and ship', 'embed this single-file HTML into the portal'.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, WebFetch, Glob, Grep
---

# sd-build-html-embed

A skill for authoring HTML content **locally first, in this Claude Code session**, then uploading the finished artifact to the SimplerDevelopment portal as an `html-embed` block. Two upload paths exist:

1. **Single-file** — one `index.html` with everything inlined (CSS in `<style>`, JS in `<script>`, images as data-URLs). Goes through `posts_upload_html` / `decks_upload_html`. Cap: 1 MB raw.
2. **Multi-file bundle** — a directory tree (`index.html` + `style.css` + `script.js` + `assets/`) zipped and shipped through `posts_upload_html_zip` / `decks_upload_html_zip`. Cap: 50 MB total / 200 files / 10 MB per file. Relative refs in `index.html` resolve through the path-based media proxy.

Pick the bundle path when the artifact needs real fonts, real images, modular JS, or genuinely large assets. Pick single-file when the artifact is small and you want zero infrastructure complexity.

## Pre-flight

1. **Read `.sd/config.json`** — confirm `client.id`, `defaultSiteId`, `brand`.
2. **Read `.sd/learnings.md`** if present.
3. **Read `SD_DESIGN_PRINCIPLES.md`** — every authoring rule applies here, doubly so because there's no editor safety net.
4. **Decide path:** single-file or bundle? Default to **single-file** unless one of these is true:
   - Custom non-system fonts (woff/woff2).
   - Real photography or non-trivial illustrations (> 200KB each, > 5 images).
   - Modular JS (multiple .js files, ES modules, or a small framework).
   - The HTML alone exceeds 800KB.

   If yes to any: bundle path.

## Authoring conventions

The vendored `huashu-design` skill is the gold standard for hi-fi HTML — read its `references/content-guidelines.md` if doing motion design / hi-fi prototype work. Don't paste huashu output directly into a CMS block (per the repo's CLAUDE.md hard rule); use it as inspiration, then translate into your own authored HTML.

### Working directory

Author files under a **project-local scratch dir**, e.g. `./.sd/embeds/<slug>/`. Never commit these to git — `.sd/` is already gitignored. The skill writes:

```
.sd/embeds/<slug>/
  index.html
  style.css        (only if bundle path)
  script.js        (only if bundle path)
  assets/
    hero.jpg
    logo.svg
    fonts/inter.woff2
```

### `index.html` — the constants

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>...</title>
  <!-- Single-file: inline <style>. Bundle: <link rel="stylesheet" href="style.css"> -->
</head>
<body>
  ...
  <!-- Single-file: inline <script>. Bundle: <script src="script.js"></script> -->
</body>
</html>
```

**Critical constraints** (this is rendered in a sandboxed iframe):

- The iframe defaults to `sandbox="scripts"` — allows JS, NOT `same-origin`, NOT `forms` (except with `iframeTitle`-prefixed permissions). So local-storage / cookies / parent-window access are blocked. Fine for visuals; do not rely on persistence.
- The iframe height is fixed (`100vh` by default). Author the document to fit; tall documents are scrollable inside the frame.
- No external requests get a same-origin cookie. Calling `fetch(...)` is allowed but cross-origin and cookieless.
- Relative paths (`./style.css`, `assets/img.png`) resolve **relative to the index.html's S3 location** through the media-proxy. Absolute paths (`/something`) DO NOT — they hit the parent site, which is wrong.

### Design system — apply, don't invent

The brand profile in `.sd/config.json:brand` is your palette + type pairing source:

```html
<style>
  :root {
    --primary: <brand.primaryColor>;
    --secondary: <brand.secondaryColor>;
    --accent: <brand.accentColor>;
    --bg: <brand.backgroundColor>;
    --text: <brand.textColor>;
    --heading-font: '<brand.headingFont>', system-ui;
    --body-font: '<brand.bodyFont>', system-ui;
  }
  body { font: 16px/1.6 var(--body-font); color: var(--text); background: var(--bg); }
  h1, h2, h3 { font-family: var(--heading-font); letter-spacing: -0.025em; }
</style>
```

Run a contrast check on `--text` vs `--bg` before shipping. Call `branding_check_contrast` to confirm ≥ 4.5:1 for body, ≥ 3:1 for large text.

### Logo

If `brand.logoUrl` is set, fetch it server-side once (via `WebFetch`) and either:

- **Single-file path:** base64-encode and inline as a `<img src="data:image/...">`.
- **Bundle path:** save to `./assets/logo.svg` (or .png) and reference relatively.

Never hot-link the logo from S3 inside the embed — the embed is sandboxed without same-origin, and intermittent failures look terrible.

### Accessibility

The same WCAG rules from `SD_DESIGN_PRINCIPLES.md` apply:

- Body 16px+, headings 36+ for hero scale.
- `prefers-reduced-motion` respected for any animation.
- `alt` on informational images, `alt=""` on decorative.
- Headings in hierarchical order, one `h1`.
- Buttons / links have accessible names.

## Build steps

### Single-file path

1. Write `./.sd/embeds/<slug>/index.html` with `<style>` and `<script>` inline.
2. Inline images as data-URLs:
   ```js
   import { readFileSync } from 'node:fs';
   const b64 = readFileSync('./hero.jpg').toString('base64');
   const dataUrl = `data:image/jpeg;base64,${b64}`;
   ```
3. Verify size ≤ 1 MB (`wc -c index.html`).
4. Base64-encode the whole file and call `posts_upload_html`:
   ```
   mcp__simplerdevelopment-postcaptain__posts_upload_html {
     websiteId: <defaultSiteId>,
     filename: "<slug>.html",
     contentBase64: "<base64 of index.html>"
   }
   ```
5. Returns `{ id, slug, ..., approval: { url, ... } }`. Done.

### Bundle path

1. Author the tree under `./.sd/embeds/<slug>/`.
2. Verify the entry: `ls -la ./.sd/embeds/<slug>/index.html` exists.
3. Verify total size:
   ```bash
   du -sb .sd/embeds/<slug>/ | awk '{print $1}'
   ```
   Must be < 52428800 (50 MB).
4. Zip the directory contents (NOT the wrapper directory):
   ```bash
   cd .sd/embeds/<slug>
   zip -r ../<slug>.zip . -x '.DS_Store' '*/.DS_Store'
   ```
   The zip should have `index.html` at the root, NOT `<slug>/index.html`.
5. Base64-encode and call `posts_upload_html_zip`:
   ```bash
   base64 -i .sd/embeds/<slug>.zip -o /tmp/sd-zip.b64
   ```
   ```
   mcp__simplerdevelopment-postcaptain__posts_upload_html_zip {
     websiteId: <defaultSiteId>,
     filename: "<slug>.zip",
     contentBase64: "<paste of /tmp/sd-zip.b64>"
   }
   ```
6. Returns `{ id, slug, ..., bundleFileCount, bundlePrefix, url, approval: { ... } }`.

### Deck variants

Same flow but call `decks_upload_html` (single-file) or `decks_upload_html_zip` (bundle). The result is a 1-slide deck with `showSlideNumber: false` for full-bleed presentation. Approve the deck to flip status to `published` and call `decks_publish_all` to make the slide live.

## Self-review (the 5 dimensions)

Run before returning the approval URL. The HTML path has higher risk of slop because there's no block-shaped guardrail.

1. **Philosophy alignment** — does the design carry the brand voice? Or did Claude default to neutral / "Apple knockoff"?
2. **Visual hierarchy** — squint test. Three to four clear levels.
3. **Craft quality** — 8pt grid? Real type pairing? Color contrast ≥ 4.5:1?
4. **Functionality** — every section earns its place. Cut whatever fails the test.
5. **Originality** — does it look like any other huashu hero, or does it look like SimplerDevelopment / the client?

Score 1–10. If any < 6, surface explicitly and recommend a revision pass before approval.

## MCP response handling — read errors first

SimplerDevelopment's MCP wraps every response — successes AND errors — in a JSON-RPC success envelope shaped like:

```
{"result":{"content":[{"type":"text","text":"{...JSON...}"}]}}
```

Before reporting success to the user, parse `result.content[0].text` as JSON. If the parsed object contains an `error` key (e.g. `{"error":"Site not found"}` or `{"error":"Unauthorized"}`), the call FAILED — even though the JSON-RPC envelope said `result`. STOP immediately. Surface the error verbatim to the user. Do NOT invent a successful response with a made-up post id, approval URL, slug, or site name. Hallucinated success is worse than a visible failure — the user will publish content that doesn't exist or copy approval URLs to stakeholders that 404.

Only treat the call as successful when the parsed text contains the expected entity shape (e.g. `{"id":..., "approval":{...}}` for `posts_create`).

## Output

Return to the user:
- Local working directory: `.sd/embeds/<slug>/`
- File tree (so the user can inspect)
- Total upload size in bytes
- Post id + portal edit URL: `/portal/websites/<siteId>/posts/<id>/edit`
- Public preview URL (once approved): `/sites/<siteId>/<slug>` or whatever the site routing is.
- **Approval URL** — share for review
- Self-review scores + quick wins

## Failure modes

- **No `.sd/config.json`** → run `sd-init`.
- **Bundle has no .html file** → upload tool rejects. Verify `index.html` exists at the root of the zip.
- **Bundle exceeds limits** (200 files, 10 MB/file, 50 MB total) → split or downsample assets.
- **Disallowed file extension** → only html/css/js/png/jpg/jpeg/webp/gif/svg/ico/woff/woff2/ttf/otf/eot/json/txt/xml/csv are accepted. Move others to a hosted URL and reference absolutely.
- **Same-origin / cookie need** → cannot work in the sandboxed iframe. Re-scope the artifact.
- **External CDN dependency** (e.g. Google Fonts via `<link>`) → works fine, the iframe can hit external URLs. But you lose offline-style reliability; prefer self-hosted fonts in the bundle.
- **Relative path with `..`** → the zip pipeline rejects path-traversal entries. Restructure your tree.

## Iteration

To revise the embed:

- **Same slug, different content** → author locally again, then re-upload. The new upload creates a **new** post (the slug auto-bumps `-2`, `-3`, ...). The old post stays.
- **Same post, edited HTML** → there's no in-place edit for the embedded HTML via MCP today. Best path is to re-upload (new post) and update any pages that reference the previous one.

The new MCP tool `posts_update` on an html-embed post would need a new code path; for now, treat embeds as immutable once uploaded.

## Self-improvement

After every run where the user accepts or rejects the result, invoke `sd-learn` with the artifact + feedback. Rules that accumulate here:

- "Always use the bundle path for client X — they need real photography."
- "Single-file path is fine for prototypes; bundle for production."
- "Inline the brand's webfont; don't load from Google Fonts."

## Install

This skill ships as part of the SimplerDevelopment client skills bundle. Install all 10 sibling skills in one step from the portal:

**https://simplerdevelopment.com/install**

macOS, Windows, and Linux installers download the bundle to `~/.claude/skills/`. Both Claude Desktop and Claude Code auto-discover skills from that path on next restart.

See `CLIENT_QUICKSTART.md` (installed alongside this file) for the full setup walkthrough, including the MCP-server config Claude Desktop needs and the one-time `sd-init` bootstrap.
