#!/bin/bash
# Record a "Simpler Development" take from the MacBook Pro mic (device [1]).
# Say your line, then press  q  to stop. Re-run for more takes.
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/take-$(date +%H%M%S).wav"
echo "🎙  Recording -> $OUT"
echo "   Say 'Simpler Development' (be big!), then press  q  to stop."
ffmpeg -hide_banner -loglevel error -f avfoundation -i ":1" -ac 1 -ar 48000 "$OUT"
echo ""
echo "✅ Saved: $OUT"
