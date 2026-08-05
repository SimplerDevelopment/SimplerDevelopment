#!/usr/bin/env python3
"""Inline the three source files into public/agile-after-ai/index.html.

Run from the repo root, after `bun build docs/marketing/agile-after-ai/app.js
--outfile=/tmp/app.min.js --minify --format=esm --target=browser`. See README.md.

Note the whitespace collapse at the end joins every indented line onto one
line — including inside <script>. That is why the base-layer script uses only
/* block */ comments: a // comment would swallow the rest of the file.
"""
import pathlib
import re
import subprocess
import sys
import tempfile

src = pathlib.Path('docs/marketing/agile-after-ai')
html = (src / 'index.src.html').read_text()
css = (src / 'main.css').read_text()
js = pathlib.Path('/tmp/app.min.js').read_text()

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

assert 'window.__sdNarration' in html, 'narration manifest went missing'

# The collapse is the one step that can silently produce broken JS (a stray //
# comment swallows everything after it). Parse what we are about to ship.
for i, block in enumerate(re.findall(r'<script>(.*?)</script>', html, flags=re.S)):
    tmp = pathlib.Path(tempfile.gettempdir()) / f'sd-agile-block-{i}.mjs'
    tmp.write_text(block)
    if subprocess.run(['node', '--check', tmp]).returncode:
        sys.exit(f'inline script block {i} does not parse — see {tmp}')
    tmp.unlink()

pathlib.Path('public/agile-after-ai/index.html').write_text(html)
print('wrote', len(html.encode()), 'bytes', file=sys.stderr)
