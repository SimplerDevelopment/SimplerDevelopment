# If Agile Were Invented After AI

Source for the scroll-driven WebGL essay served at `/agile-after-ai`.

## Files

| File | Role |
|---|---|
| `index.src.html` | Editable source. Links `css/main.css` + `js/app.js` as separate files. |
| `main.css` | Blueprint design system. SD teal = machine execution, amber = human decision. |
| `app.js` | Scene layer: 8 scenes, blended camera, GLSL point shader. Pure enhancement. |

The deployed artifact is `public/agile-after-ai/index.html` — a single self-contained
file with CSS and JS inlined. `app/agile-after-ai/route.ts` serves it at the clean URL.

## Rebuilding after an edit

Edit the three source files here, then inline them into the deployed asset:

```bash
# from the repo root
bun build docs/marketing/agile-after-ai/app.js \
  --outfile=/tmp/app.min.js --minify --format=esm --target=browser

python3 - <<'PY'
import re, pathlib
src = pathlib.Path('docs/marketing/agile-after-ai')
html = (src / 'index.src.html').read_text()
css  = (src / 'main.css').read_text()
js   = pathlib.Path('/tmp/app.min.js').read_text()

css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
css = re.sub(r'\s+', ' ', css)
css = re.sub(r'\s*([{}:;,>])\s*', r'\1', css).replace(';}', '}').strip()

html = html.replace('<link rel="stylesheet" href="css/main.css">', '<style>' + css + '</style>')
html = html.replace('<script src="js/app.js" defer></script>', '<script>' + js + '</script>')
html = re.sub(r'<!--.*?-->', '', html, flags=re.S)

# collapse whitespace only between block tags — never joins prose words
BLOCK = r'(?:div|section|main|ol|ul|li|p|h1|h2|h3|footer|style|script|body|html|head|title|meta|link)'
html = re.sub(rf'(</{BLOCK}>)\s+(<)', r'\1\2', html)
html = re.sub(rf'(<{BLOCK}\b[^>]*>)\s+(<)', r'\1\2', html)
html = re.sub(r'\n\s*\n+', '\n', html)
html = re.sub(r'\n\s+', ' ', html)

# the importer strips nav/banner tags; the hero must stay a plain div
assert '<header' not in html and '<nav' not in html
assert html.count('data-scene=') == 8
pathlib.Path('public/agile-after-ai/index.html').write_text(html)
print('wrote', len(html.encode()), 'bytes')
PY
```

## Constraints worth knowing

- **Three.js, GSAP and Lenis load from `esm.sh` at runtime**, and only once a scene
  approaches the viewport. If the CDN is unreachable the article still reads: reveals,
  the ladder highlighting and the effort bars run from a dependency-free inline script.
- **`prefers-reduced-motion` opts out entirely** — no WebGL is fetched, and the piece
  degrades to a real static reading path rather than a broken one.
- **It must own the viewport.** It was deliberately not shipped as a `/blog/<slug>`
  html-embed block: that renders a fixed-height iframe which consumes scroll inside a
  page that also scrolls, trapping the reader.
