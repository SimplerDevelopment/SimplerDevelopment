#!/usr/bin/env bash
# Lighthouse every page of a site, in parallel, and print a scoreboard.
#
#   scripts/lighthouse-audit.sh                       # all sitemap URLs, mobile
#   scripts/lighthouse-audit.sh -p desktop            # desktop preset
#   scripts/lighthouse-audit.sh -f '^/(home|about)'   # only matching paths
#   scripts/lighthouse-audit.sh -j 1                  # accurate perf numbers (slow)
#   scripts/lighthouse-audit.sh https://x/one-page    # explicit URLs, skip sitemap
#
# ponytail: parallelism is the whole speed story. -j >1 makes the CPU-bound
# metrics (TBT, and to a lesser degree LCP/SI) read WORSE than reality because
# the runs fight each other for cores — we burned an hour on that on 2026-08-19.
# Use the default for regression sweeps, -j 1 for a number you'll quote.
set -euo pipefail

BASE="https://integratouch.simplerdevelopment.com"
JOBS=4
PRESET=mobile
OUT=""
FILTER=""

while getopts "u:j:p:o:f:h" o; do
  case $o in
    u) BASE="${OPTARG%/}" ;;
    j) JOBS="$OPTARG" ;;
    p) PRESET="$OPTARG" ;;
    o) OUT="$OPTARG" ;;
    f) FILTER="$OPTARG" ;;
    h) sed -n '2,16p' "$0"; exit 0 ;;
    *) exit 2 ;;
  esac
done
shift $((OPTIND - 1))

OUT="${OUT:-.lighthouse/$(date +%Y%m%d-%H%M%S)-$PRESET}"
mkdir -p "$OUT"

# URLs: explicit args win, else the sitemap.
if [ $# -gt 0 ]; then
  printf '%s\n' "$@" > "$OUT/urls.txt"
else
  curl -sf --max-time 20 "$BASE/sitemap.xml" \
    | grep -oE '<loc>[^<]+</loc>' | sed 's/<[^>]*>//g' \
    | sort -u > "$OUT/urls.txt"
  [ -s "$OUT/urls.txt" ] || { echo "no URLs in $BASE/sitemap.xml" >&2; exit 1; }
fi
[ -n "$FILTER" ] && { grep -E "$FILTER" "$OUT/urls.txt" > "$OUT/urls.f" && mv "$OUT/urls.f" "$OUT/urls.txt"; }

TOTAL=$(wc -l < "$OUT/urls.txt" | tr -d ' ')
echo "▶ $TOTAL pages · preset=$PRESET · jobs=$JOBS · out=$OUT"
START=$(date +%s)

run_one() {
  url="$1"; out="$2"; preset="$3"
  slug=$(printf '%s' "${url#*://}" | sed 's#[^A-Za-z0-9._-]#_#g'); slug=${slug:-root}
  [ "$preset" = desktop ] && flags=(--preset=desktop) || flags=()
  for attempt in 1 2; do
    if lighthouse "$url" "${flags[@]}" \
        --quiet --output=json --output=html --output-path="$out/$slug" \
        --chrome-flags="--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage" \
        --max-wait-for-load=45000 >"$out/$slug.log" 2>&1; then
      echo "  ✓ $url"; return 0
    fi
    [ "$attempt" = 1 ] && sleep 2
  done
  echo "  ✗ $url (see $out/$slug.log)" >&2
}
export -f run_one

xargs -P "$JOBS" -I{} bash -c 'run_one "$@"' _ {} "$OUT" "$PRESET" < "$OUT/urls.txt"

# Scoreboard. Missing category (e.g. PWA off) => "-", not a crash.
jq -r '
  def s(c): (.categories[c].score // empty | .*100 | round | tostring) // "-";
  def m(a; k): (.audits[a].numericValue // empty | .*k | round | tostring) // "-";
  [ (.finalDisplayedUrl // .finalUrl), s("performance"), s("accessibility"),
    s("best-practices"), s("seo"),
    m("largest-contentful-paint"; 1), m("cumulative-layout-shift"; 1000),
    m("total-blocking-time"; 1) ] | @tsv
' "$OUT"/*.report.json 2>/dev/null | sort -t$'\t' -k2 -n > "$OUT/summary.tsv"

{
  echo "url	perf	a11y	bp	seo	lcp_ms	cls_x1000	tbt_ms"
  cat "$OUT/summary.tsv"
} | column -t -s$'\t' | tee "$OUT/summary.txt"

DONE=$(wc -l < "$OUT/summary.tsv" | tr -d ' ')
echo
awk -F'\t' '{p+=$2;a+=$3;b+=$4;s+=$5;n++} END{if(n)printf "avg  perf %.0f · a11y %.0f · bp %.0f · seo %.0f  (n=%d)\n",p/n,a/n,b/n,s/n,n}' "$OUT/summary.tsv"
echo "$DONE/$TOTAL pages in $(( $(date +%s) - START ))s · reports: $OUT/*.report.html"
[ "$DONE" = "$TOTAL" ] || { echo "⚠ $((TOTAL-DONE)) page(s) failed — grep '' $OUT/*.log" >&2; exit 1; }
