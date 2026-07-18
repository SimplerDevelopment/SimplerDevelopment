#!/usr/bin/env bun
// Read .claude/.runtime/cost-log.jsonl and produce a summary table.
// One line per session, plus daily/weekly/by-model totals.
//
// Usage:
//   bun run scripts/cost-summary.ts                  # full table + totals
//   bun run scripts/cost-summary.ts --since 7d       # last 7 days
//   bun run scripts/cost-summary.ts --by-model       # collapse to per-model
//   bun run scripts/cost-summary.ts --json           # machine-readable
import * as fs from "node:fs";
import * as path from "node:path";

type Entry = {
  session_id: string;
  started_at?: string;
  ended_at?: string;
  duration_s?: number;
  reason?: string;
  assistant_calls?: number;
  cache_hit_ratio?: number;
  totals?: {
    input_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
    output_tokens: number;
    calls: number;
  };
  cost_usd?: number;
  cost_by_model_usd?: Record<string, number>;
  by_model?: Record<string, { calls: number; input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; output_tokens: number }>;
};

const args = new Set(process.argv.slice(2));
const sinceArg = process.argv.find((a) => a.startsWith("--since="))
  || (process.argv[process.argv.indexOf("--since") + 1] && process.argv.includes("--since") ? process.argv[process.argv.indexOf("--since") + 1] : null);
const byModel = args.has("--by-model");
const asJson = args.has("--json");

const logPath = path.resolve(".claude/.runtime/cost-log.jsonl");
if (!fs.existsSync(logPath)) {
  console.error(`No cost log found at ${logPath}.`);
  console.error("Hint: SessionEnd hook writes to it; run a Claude session first.");
  process.exit(1);
}

const cutoffMs = (() => {
  if (!sinceArg) return null;
  const m = sinceArg.match(/^(\d+)([dh])$/);
  if (!m) {
    console.error(`--since must be like '7d' or '24h', got: ${sinceArg}`);
    process.exit(1);
  }
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const ms = unit === "d" ? n * 86_400_000 : n * 3_600_000;
  return Date.now() - ms;
})();

const entries: Entry[] = fs
  .readFileSync(logPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l) as Entry;
    } catch {
      return null;
    }
  })
  .filter((e): e is Entry => e !== null)
  .filter((e) => {
    if (!cutoffMs || !e.started_at) return true;
    return new Date(e.started_at).getTime() >= cutoffMs;
  });

if (entries.length === 0) {
  console.error("No entries in window.");
  process.exit(0);
}

// Aggregate
const totals = {
  sessions: entries.length,
  cost_usd: 0,
  duration_s: 0,
  calls: 0,
  input: 0,
  cache_read: 0,
  cache_create: 0,
  output: 0,
};
const perModel: Record<string, { sessions: number; cost: number; calls: number; cache_read: number; cache_create: number; output: number; input: number }> = {};

for (const e of entries) {
  totals.cost_usd += e.cost_usd ?? 0;
  totals.duration_s += e.duration_s ?? 0;
  if (e.totals) {
    totals.calls += e.totals.calls;
    totals.input += e.totals.input_tokens;
    totals.cache_read += e.totals.cache_read_input_tokens;
    totals.cache_create += e.totals.cache_creation_input_tokens;
    totals.output += e.totals.output_tokens;
  }
  for (const [model, m] of Object.entries(e.by_model ?? {})) {
    const slot = (perModel[model] ??= { sessions: 0, cost: 0, calls: 0, cache_read: 0, cache_create: 0, output: 0, input: 0 });
    slot.sessions += 1;
    slot.cost += e.cost_by_model_usd?.[model] ?? 0;
    slot.calls += m.calls;
    slot.cache_read += m.cache_read_input_tokens;
    slot.cache_create += m.cache_creation_input_tokens;
    slot.output += m.output_tokens;
    slot.input += m.input_tokens;
  }
}

const denom = totals.input + totals.cache_read + totals.cache_create;
const cacheHitRatio = denom ? totals.cache_read / denom : 0;
const avgCost = totals.sessions ? totals.cost_usd / totals.sessions : 0;
const avgDuration = totals.sessions ? totals.duration_s / totals.sessions : 0;

if (asJson) {
  console.log(JSON.stringify({ window: sinceArg ?? "all", totals: { ...totals, cache_hit_ratio: cacheHitRatio, avg_cost_usd: avgCost, avg_duration_s: avgDuration }, perModel }, null, 2));
  process.exit(0);
}

const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
const fmtTok = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`);
const fmtSec = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}m${Math.round(n % 60)}s` : `${Math.round(n)}s`);
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

const range = sinceArg ? `last ${sinceArg}` : "all time";
console.log(`\n=== Claude Code cost summary — ${range} ===\n`);

if (!byModel) {
  console.log("Per-session:");
  console.log("date(UTC)            calls  input  c-read  c-write  output  cache%  dur     cost");
  for (const e of entries) {
    const dt = e.started_at ? e.started_at.replace("T", " ").slice(0, 16) : "?";
    const t = e.totals;
    if (!t) continue;
    const ratio = e.cache_hit_ratio ?? 0;
    console.log(
      `${dt.padEnd(20)} ${String(t.calls).padStart(5)} ${fmtTok(t.input_tokens).padStart(6)} ${fmtTok(t.cache_read_input_tokens).padStart(7)} ${fmtTok(t.cache_creation_input_tokens).padStart(8)} ${fmtTok(t.output_tokens).padStart(7)} ${fmtPct(ratio).padStart(7)} ${fmtSec(e.duration_s ?? 0).padStart(7)} ${fmtUsd(e.cost_usd ?? 0).padStart(8)}`
    );
  }
  console.log();
}

console.log("Per-model totals:");
console.log("model                  sessions  calls   c-read    c-write   output   cost");
for (const [model, m] of Object.entries(perModel).sort((a, b) => b[1].cost - a[1].cost)) {
  console.log(
    `${model.padEnd(22)} ${String(m.sessions).padStart(8)} ${String(m.calls).padStart(6)} ${fmtTok(m.cache_read).padStart(8)} ${fmtTok(m.cache_create).padStart(9)} ${fmtTok(m.output).padStart(8)} ${fmtUsd(m.cost).padStart(7)}`
  );
}

console.log();
console.log("Aggregate:");
console.log(`  Sessions:        ${totals.sessions}`);
console.log(`  Total cost:      ${fmtUsd(totals.cost_usd)}`);
console.log(`  Avg cost/session ${fmtUsd(avgCost)}`);
console.log(`  Total duration:  ${fmtSec(totals.duration_s)}`);
console.log(`  Avg duration:    ${fmtSec(avgDuration)}`);
console.log(`  Cache-hit ratio: ${fmtPct(cacheHitRatio)} (target >60%)`);
console.log(`  Total tokens:    ${fmtTok(totals.input + totals.cache_read + totals.cache_create + totals.output)}`);
console.log();
