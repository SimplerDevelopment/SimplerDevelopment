#!/usr/bin/env bash
# SessionEnd hook — aggregate this session's token usage into .claude/.runtime/cost-log.jsonl.
# One JSON line per session. Used to baseline and track hands-off dev efficiency.
# Always exit 0; never block the session ending.
set +e
set -u

input="$(cat 2>/dev/null || true)"

mkdir -p .claude/.runtime
out=".claude/.runtime/cost-log.jsonl"

python3 - "$input" "$out" <<'PYEOF'
import json, os, sys, time
from datetime import datetime, timezone

raw = sys.argv[1]
out_path = sys.argv[2]

try:
    payload = json.loads(raw) if raw else {}
except Exception:
    payload = {}

session_id     = payload.get("session_id", "")
transcript     = payload.get("transcript_path", "")
reason         = payload.get("reason", "")

if not transcript or not os.path.exists(transcript):
    sys.exit(0)

by_model = {}
first_ts = None
last_ts  = None
assistant_calls = 0
web_search = 0
web_fetch  = 0

with open(transcript, "r") as f:
    for line in f:
        try:
            d = json.loads(line)
        except Exception:
            continue
        ts = d.get("timestamp")
        if ts:
            if first_ts is None or ts < first_ts: first_ts = ts
            if last_ts is None  or ts > last_ts:  last_ts  = ts
        if d.get("type") != "assistant":
            continue
        msg = d.get("message") or {}
        usage = msg.get("usage") or {}
        if not usage:
            continue
        model = msg.get("model", "unknown")
        m = by_model.setdefault(model, {
            "calls": 0,
            "input_tokens": 0,
            "cache_read_input_tokens": 0,
            "cache_creation_input_tokens": 0,
            "output_tokens": 0,
        })
        m["calls"]                       += 1
        m["input_tokens"]                 += int(usage.get("input_tokens") or 0)
        m["cache_read_input_tokens"]      += int(usage.get("cache_read_input_tokens") or 0)
        m["cache_creation_input_tokens"]  += int(usage.get("cache_creation_input_tokens") or 0)
        m["output_tokens"]                += int(usage.get("output_tokens") or 0)
        assistant_calls += 1
        stu = usage.get("server_tool_use") or {}
        web_search += int(stu.get("web_search_requests") or 0)
        web_fetch  += int(stu.get("web_fetch_requests") or 0)

if not by_model:
    sys.exit(0)

# Totals across models
total = {
    "calls": 0,
    "input_tokens": 0,
    "cache_read_input_tokens": 0,
    "cache_creation_input_tokens": 0,
    "output_tokens": 0,
}
for m in by_model.values():
    for k in total:
        total[k] += m[k]

denom = total["input_tokens"] + total["cache_read_input_tokens"] + total["cache_creation_input_tokens"]
cache_hit_ratio = round(total["cache_read_input_tokens"] / denom, 4) if denom else 0.0

# Pricing — $/MTok. Adjust as Anthropic rates change.
# Sources: docs.anthropic.com/en/docs/about-claude/pricing (April 2026)
# input/cache-write: full price; cache-read: 10% of input.
RATES = {
    "claude-opus-4-7":      {"in": 15.0, "out": 75.0},
    "claude-opus-4-6":      {"in": 15.0, "out": 75.0},
    "claude-sonnet-4-6":    {"in":  3.0, "out": 15.0},
    "claude-sonnet-4-5":    {"in":  3.0, "out": 15.0},
    "claude-haiku-4-5":     {"in":  1.0, "out":  5.0},
}
def cost_for(model, m):
    base = None
    for k, v in RATES.items():
        if model.startswith(k):
            base = v; break
    if not base:
        return None
    p_in  = base["in"]  / 1_000_000
    p_out = base["out"] / 1_000_000
    # cache write is 1.25× input for 5m TTL, 2× for 1h TTL — we don't separate yet, assume 1.25
    p_cwrite = p_in * 1.25
    p_cread  = p_in * 0.10
    return round(
        m["input_tokens"]                * p_in
      + m["cache_creation_input_tokens"] * p_cwrite
      + m["cache_read_input_tokens"]     * p_cread
      + m["output_tokens"]               * p_out,
      4,
    )

per_model_costs = {}
total_cost = 0.0
unknown_models = []
for model, m in by_model.items():
    c = cost_for(model, m)
    if c is None:
        unknown_models.append(model)
    else:
        per_model_costs[model] = c
        total_cost += c

def parse_iso(s):
    if not s: return None
    try:
        return datetime.fromisoformat(s.replace("Z","+00:00"))
    except Exception:
        return None

started = parse_iso(first_ts)
ended   = parse_iso(last_ts)
duration_s = int((ended - started).total_seconds()) if (started and ended) else None

record = {
    "session_id": session_id,
    "started_at": first_ts,
    "ended_at":   last_ts,
    "duration_s": duration_s,
    "reason":     reason,
    "assistant_calls": assistant_calls,
    "web_search_requests": web_search,
    "web_fetch_requests":  web_fetch,
    "totals": total,
    "cache_hit_ratio": cache_hit_ratio,
    "by_model": by_model,
    "cost_usd": round(total_cost, 4),
    "cost_by_model_usd": per_model_costs,
    "cost_unknown_models": unknown_models,
    "logged_at": datetime.now(timezone.utc).isoformat(),
}

with open(out_path, "a") as f:
    f.write(json.dumps(record) + "\n")
PYEOF

exit 0
