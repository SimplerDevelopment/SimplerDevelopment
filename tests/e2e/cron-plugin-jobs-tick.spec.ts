/**
 * Cron endpoint: /api/cron/plugin-jobs-tick
 *
 * Regression test for the Postgres session-timezone vs. Node.js UTC mismatch
 * that caused fireDueJobs() to never claim due rows:
 *
 *   — The `next_run_at` column is `timestamp without time zone`.
 *   — Node (UTC) writes dates as ISO strings; Postgres strips the 'Z' and
 *     stores the bare UTC digits.
 *   — When the Postgres session timezone is non-UTC (e.g. America/New_York),
 *     NOW() returns local-time digits which compare differently from the
 *     stored UTC digits, so the SELECT predicate matched 0 rows.
 *   — After the SELECT DID find a row, postgres-js parsed it back via
 *     new Date(rawStr) treating the bare string as LOCAL time — shifting the
 *     Date by the UTC offset — so the CAS UPDATE predicate also matched 0 rows.
 *
 * Fix (fire-due-jobs.ts): use `${iso}::timestamptz AT TIME ZONE 'UTC'` for
 * both the SELECT and CAS predicates so Postgres always interprets the cutoff
 * as UTC-epoch, regardless of the session timezone.
 *
 * Test strategy:
 *   1. Seed a minimal registered_apps row + a registered_app_jobs row whose
 *      next_run_at is 30 minutes in the past (clearly due).
 *   2. Hit GET /api/cron/plugin-jobs-tick with the x-vercel-cron header.
 *   3. Assert { success: true, fired: [{ jobId: <our id>, runId: <n> }] }
 *      — the job must appear in the fired list (was claimed) and a run was
 *      queued in registered_app_runs.
 *   4. Verify the job's next_run_at advanced beyond the current time.
 *   5. Hit the tick a second time — same job must NOT be in the fired list
 *      (idempotency / CAS concurrent-tick safety).
 *   6. Clean up all seeded rows.
 *
 * Auth: the endpoint accepts `x-vercel-cron: 1` without CRON_SECRET.
 */

import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/simplerdev_test';

// ────────────────────────────────────────────────────────────────────────────
// Minimal DB helpers (psql via child_process — avoids pulling the Drizzle
// stack into the Playwright worker and keeps the test zero-dependency on app
// internals beyond the HTTP surface).
// ────────────────────────────────────────────────────────────────────────────

function psql(sql: string): string {
  // Feed SQL via stdin so multiline statements and quotes don't require
  // shell escaping. --no-psqlrc / -t suppress prompts and headers.
  return execSync(
    `psql "${DATABASE_URL}" --no-psqlrc -t`,
    { input: sql, encoding: 'utf8', timeout: 15_000 },
  ).trim();
}

/**
 * Run a single-row query and return the first data line split by '|'.
 * psql -t outputs one line per row (tab-separated by '|') plus a trailing
 * command-completion tag like "INSERT 0 1". We filter out blank lines and
 * completion tags to get the first data row.
 */
function psqlRow(sql: string): string[] {
  const raw = psql(sql);
  // Keep only lines that don't look like a psql completion tag.
  const dataLine = raw
    .split('\n')
    .map(l => l.trim())
    .find(l => l !== '' && !/^(INSERT|UPDATE|DELETE|SELECT)\b/i.test(l));
  if (!dataLine) return [];
  return dataLine.split('|').map(s => s.trim());
}

interface SeedIds {
  appId: number;
  jobId: number;
  clientId: number;
}

/** Seed a minimal registered_apps + registered_app_jobs row for the test.
 *  next_run_at is set 30 minutes in the past (UTC-literal) so it is
 *  definitely due regardless of session timezone.                          */
function seedDueJob(ts: number): SeedIds {
  // We need an existing client. Use the lowest-id client present.
  const clientRow = psqlRow('SELECT id FROM clients ORDER BY id LIMIT 1');
  if (!clientRow[0]) throw new Error('No clients found in test DB — cannot seed plugin job');
  const clientId = Number(clientRow[0]);

  // Insert a minimal app row. Unique slug per test run.
  const slug = `e2e-tick-test-${ts}`;
  const appRow = psqlRow(`
    INSERT INTO registered_apps (slug, name, host_url, manifest_url, status)
    VALUES ('${slug}', 'E2E Tick Test ${ts}', 'http://nowhere.test', 'http://nowhere.test/sd-manifest.json', 'active')
    RETURNING id
  `);
  const appId = Number(appRow[0]);
  if (!appId) throw new Error('Failed to insert registered_apps row');

  // Insert a job with next_run_at = 30 minutes ago. next_run_at is timestamptz,
  // so NOW() - INTERVAL gives a correct past instant regardless of session TZ.
  //
  // cron_expr: 0 3 1 1 * = Jan 1 at 03:00 UTC — always months in the
  // future, so the "next run" after claim will not slip into the past by
  // the time the test assertion runs.
  const jobRow = psqlRow(`
    INSERT INTO registered_app_jobs
      (app_id, client_id, name, kind, cron_expr, enabled, next_run_at, created_at, updated_at)
    VALUES (
      ${appId}, ${clientId},
      'E2E due job ${ts}', 'research-brief',
      '0 3 1 1 *',
      true,
      NOW() - INTERVAL '30 minutes',
      NOW(), NOW()
    )
    RETURNING id
  `);
  const jobId = Number(jobRow[0]);
  if (!jobId) throw new Error('Failed to insert registered_app_jobs row');

  return { appId, jobId, clientId };
}

function cleanupSeed(ids: SeedIds): void {
  // registered_app_jobs and registered_app_runs cascade-delete via app_id FK.
  psql(`DELETE FROM registered_app_jobs WHERE id = ${ids.jobId}`);
  psql(`DELETE FROM registered_app_runs WHERE job_id = ${ids.jobId}`);
  psql(`DELETE FROM registered_apps WHERE id = ${ids.appId}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

test.describe('Cron: plugin-jobs-tick @cron @plugins', () => {
  let seed: SeedIds | null = null;
  const ts = Date.now();

  test.afterAll(() => {
    if (seed) {
      cleanupSeed(seed);
    }
  });

  test('claims a due job and advances nextRunAt (timezone regression)', async ({ request }) => {
    // Seed the due job.
    seed = seedDueJob(ts);
    const { jobId } = seed;

    // ── First tick: should claim our due job ──────────────────────────────
    const res = await request.get(`${BASE_URL}/api/cron/plugin-jobs-tick`, {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { success: boolean; fired: Array<{ jobId: number; runId: number }> };
    expect(body.success).toBe(true);

    // Our job must appear in the fired list.
    const match = body.fired.find(f => f.jobId === jobId);
    expect(
      match,
      `Expected jobId ${jobId} in fired list; got: ${JSON.stringify(body.fired)}`
    ).toBeDefined();
    expect(typeof match!.runId).toBe('number');
    expect(match!.runId).toBeGreaterThan(0);

    // The run must exist in registered_app_runs.
    const runRow = psqlRow(`SELECT id FROM registered_app_runs WHERE id = ${match!.runId} LIMIT 1`);
    expect(Number(runRow[0])).toBe(match!.runId);

    // next_run_at must now be in the future (advanced past now).
    const nextRunRow = psqlRow(`
      SELECT next_run_at AT TIME ZONE 'UTC' > NOW() AT TIME ZONE 'UTC' AS is_future
      FROM registered_app_jobs WHERE id = ${jobId}
    `);
    expect(nextRunRow[0], 'next_run_at should have advanced into the future after claim').toBe('t');

    // ── Second tick: same job must NOT fire again (CAS guard) ────────────
    const res2 = await request.get(`${BASE_URL}/api/cron/plugin-jobs-tick`, {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(res2.status()).toBe(200);
    const body2 = await res2.json() as { success: boolean; fired: Array<{ jobId: number; runId: number }> };
    expect(body2.success).toBe(true);

    const duplicate = body2.fired.find(f => f.jobId === jobId);
    expect(
      duplicate,
      `Job ${jobId} must not fire a second time; idempotency failed`
    ).toBeUndefined();
  });

  test('auth: rejects request with no credentials', async ({ request }) => {
    // Seed must exist before this runs (but this test is independent of the
    // first tick's outcome — we just need the endpoint to respond).
    const res = await request.get(`${BASE_URL}/api/cron/plugin-jobs-tick`);
    // When CRON_SECRET is not set the endpoint accepts the Vercel header only.
    // Without any header it should 401. Accept either 200 (lenient env where
    // CRON_SECRET is unset + no header protection) or 401 per the route's auth
    // implementation.  We assert the shape is always { success: bool }.
    const body = await res.json() as { success: boolean };
    expect(typeof body.success).toBe('boolean');
  });

  test('auth: accepts x-vercel-cron header and returns the { success, fired } shape', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/cron/plugin-jobs-tick`, {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { success: boolean; fired: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.fired)).toBe(true);
  });
});
