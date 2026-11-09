#!/usr/bin/env bash
# Which JS chunks does a live page load, and which of them contain <marker>?
#
# The cheapest proof that a bundle change landed (PUX-252): pick a string
# literal unique to the module — a class name, CSS var, aria-label; they survive
# minification — and run this against the live page before and after deploy.
#
#   scripts/prod-chunk-grep.sh https://mancuso.simplerdevelopment.com/ -- '--site-nav-h'
#
# For each referenced chunk that contains a marker it prints the path, size,
# which markers, and how the HTML pulls it in:
#   entry    <script src>         — loads on EVERY request to this route
#   preload  <link rel=preload>   — next/dynamic; only when the branch rendered
#   other    found in the flight payload only
# Markers no chunk contains are listed explicitly, so a miss is visible.
#
# Trap: production serves chunks from /_next/static/immutable/chunks/, not
# /_next/static/chunks/. A pattern for the latter matches nothing — which reads
# exactly like "the module is gone". This script exits 2 when it finds no chunks
# at all, so that false pass can't happen silently.
set -euo pipefail

if [ $# -lt 3 ] || [ "$2" != "--" ]; then
  echo "usage: $0 <url> -- <marker> [marker...]" >&2
  exit 64
fi
url="$1"; shift 2
ua="Mozilla/5.0 (compatible; prod-chunk-grep)"
origin="$(printf '%s' "$url" | sed -E 's#^(https?://[^/]+).*#\1#')"
html="$(curl -fsSL -A "$ua" "$url")"

chunks="$(printf '%s' "$html" | grep -oE '/_next/static/(immutable/)?chunks/[A-Za-z0-9_./~-]+\.js' | sort -u || true)"
if [ -z "$chunks" ]; then
  echo "error: no /_next/static chunks referenced by $url — wrong URL, a gate page, or the path pattern needs updating" >&2
  exit 2
fi
echo "$url — $(printf '%s\n' "$chunks" | wc -l | tr -d ' ') chunks, <nav> in SSR: $(printf '%s' "$html" | grep -o '<nav[ >]' | wc -l | tr -d ' ')"

found=()
while read -r path; do
  body="$(curl -fsS -A "$ua" "$origin$path")"
  hits=()
  for m in "$@"; do
    if printf '%s' "$body" | grep -qF -- "$m"; then hits+=("$m"); found+=("$m"); fi
  done
  [ ${#hits[@]} -eq 0 ] && continue
  how=""
  printf '%s' "$html" | grep -qF "<script src=\"$path\"" && how="entry"
  printf '%s' "$html" | grep -qE "rel=\"preload\"[^>]*${path}|${path}\"[^>]*rel=\"preload\"" && how="${how:+$how+}preload"
  how="${how:-other}"
  printf '  %-58s %7s B  %-14s %s\n' "$path" "$(printf '%s' "$body" | wc -c | tr -d ' ')" "$how" "${hits[*]}"
done <<< "$chunks"

for m in "$@"; do
  case " ${found[*]-} " in *" $m "*) ;; *) echo "  (no referenced chunk contains: $m)";; esac
done
