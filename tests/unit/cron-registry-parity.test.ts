import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A cron handler at `app/api/cron/<name>/route.ts` does nothing in production
 * unless a matching `{ path: "/api/cron/<name>" }` entry exists in
 * `vercel.json` `crons[]` — Vercel is what fires the schedule. A route added
 * without its schedule is a silent prod no-op (it has shipped twice:
 * mcp-rollup, mcp-cleanup retention). This asserts the two sets stay in sync.
 *
 * Promoted from the guardrail-distillation report (2026-06-24, candidate #4).
 */
const ROOT = resolve(__dirname, '..', '..');

// Cron routes intentionally triggered another way (not by a vercel schedule).
// Justify each addition inline; keep this empty unless there's a real reason.
const OPT_OUT = new Set<string>([]);

function cronRouteDirs(): string[] {
  return readdirSync(resolve(ROOT, 'app', 'api', 'cron'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => !OPT_OUT.has(n));
}

function vercelCronNames(): string[] {
  const vercel = JSON.parse(readFileSync(resolve(ROOT, 'vercel.json'), 'utf8')) as {
    crons?: Array<{ path: string }>;
  };
  return (vercel.crons ?? []).map((c) => c.path.replace(/^\/api\/cron\//, ''));
}

describe('cron registry parity', () => {
  it('every cron route dir has a vercel schedule and vice versa', () => {
    const dirs = [...new Set(cronRouteDirs())].sort();
    const paths = [...new Set(vercelCronNames())].sort();
    expect(paths).toEqual(dirs);
  });

  it('every vercel cron path points at a real route handler', () => {
    const dirs = new Set(cronRouteDirs());
    for (const name of vercelCronNames()) {
      expect(dirs, `vercel.json schedules /api/cron/${name} but no such route dir`).toContain(name);
    }
  });
});
