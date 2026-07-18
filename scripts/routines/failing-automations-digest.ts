#!/usr/bin/env bun
/**
 * Daily digest: surface automation rules whose most recent 5 runs are ALL
 * in the 'failed' status (per the automation_logs.status enum:
 * 'success' | 'partial' | 'failed' — see lib/db/schema/brain.ts). Sends one
 * combined Markdown email to DIGEST_TO_EMAIL via Resend. Notification only —
 * always exits 0 so a transient mail failure never gates anything.
 *
 * Conservative by design: a rule with fewer than 5 logged runs is excluded
 * (we can't say "all 5 failed" with confidence). 'partial' runs do NOT count
 * as failures — only 'failed'.
 *
 * Used by .github/workflows/sd2026-failing-automations-digest.yml (daily).
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL_READONLY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DIGEST_TO_EMAIL = process.env.DIGEST_TO_EMAIL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL_READONLY not set.');
  process.exit(0);
}
if (!RESEND_API_KEY) {
  console.error('RESEND_API_KEY not set.');
  process.exit(0);
}
if (!DIGEST_TO_EMAIL) {
  console.error('DIGEST_TO_EMAIL not set.');
  process.exit(0);
}

const FROM_EMAIL = 'noreply@simplerdevelopment.com';
const RUN_WINDOW = 5;
const ERROR_TRUNCATE = 120;

type FailingRow = {
  client_id: number;
  rule_id: number;
  rule_name: string;
  last_failure_at: string;
  last_error_message: string | null;
  total_runs: number;
};

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, '\\|');
}

const sql = postgres(DATABASE_URL, { max: 1, idle_timeout: 5 });

try {
  // For each rule, look at the most recent RUN_WINDOW logs (ordered DESC
  // by created_at). A rule is "consistently failing" iff there are exactly
  // RUN_WINDOW recent runs AND every one has status = 'failed'. Rules with
  // fewer than RUN_WINDOW total runs are excluded — not enough signal.
  const rows = await sql<FailingRow[]>`
    WITH ranked AS (
      SELECT
        l.id,
        l.client_id,
        l.rule_id,
        l.status,
        l.error_message,
        l.created_at,
        ROW_NUMBER() OVER (PARTITION BY l.rule_id ORDER BY l.created_at DESC) AS rn,
        COUNT(*) OVER (PARTITION BY l.rule_id) AS total_runs
      FROM automation_logs l
    ),
    recent AS (
      SELECT * FROM ranked WHERE rn <= ${RUN_WINDOW}
    ),
    rule_summary AS (
      SELECT
        rule_id,
        MIN(total_runs)::int           AS total_runs,
        COUNT(*)::int                  AS recent_count,
        SUM((status = 'failed')::int)::int AS failed_count,
        MAX(created_at)                AS last_failure_at
      FROM recent
      GROUP BY rule_id
    ),
    last_err AS (
      SELECT DISTINCT ON (rule_id)
        rule_id,
        error_message
      FROM recent
      WHERE status = 'failed'
      ORDER BY rule_id, created_at DESC
    )
    SELECT
      r.client_id,
      r.id          AS rule_id,
      r.name        AS rule_name,
      s.last_failure_at,
      e.error_message AS last_error_message,
      s.total_runs
    FROM rule_summary s
    JOIN automation_rules r ON r.id = s.rule_id
    LEFT JOIN last_err e ON e.rule_id = s.rule_id
    WHERE s.recent_count = ${RUN_WINDOW}
      AND s.failed_count = ${RUN_WINDOW}
    ORDER BY r.client_id ASC, s.last_failure_at DESC
  `;

  if (rows.length === 0) {
    console.log('no failing automations');
    process.exit(0);
  }

  // Group by tenant.
  const byTenant = new Map<number, FailingRow[]>();
  for (const row of rows) {
    const list = byTenant.get(row.client_id) ?? [];
    list.push(row);
    byTenant.set(row.client_id, list);
  }

  const tenantIds = [...byTenant.keys()].sort((a, b) => a - b);

  const lines: string[] = [];
  lines.push(`# Failing automations digest`);
  lines.push('');
  lines.push(
    `${rows.length} automation${rows.length === 1 ? '' : 's'} across ${tenantIds.length} tenant${
      tenantIds.length === 1 ? '' : 's'
    } have failed their last ${RUN_WINDOW} consecutive runs.`,
  );
  lines.push('');

  for (const clientId of tenantIds) {
    const tenantRows = byTenant.get(clientId)!;
    lines.push(`## Tenant ${clientId}`);
    lines.push('');
    lines.push('| Tenant ID | Automation | Last failure | Last error |');
    lines.push('|---|---|---|---|');
    for (const r of tenantRows) {
      const name = escapePipes(`${r.rule_name} (#${r.rule_id})`);
      const ts = new Date(r.last_failure_at).toISOString();
      const err = escapePipes(truncate(r.last_error_message, ERROR_TRUNCATE)) || '_(no error message)_';
      lines.push(`| ${r.client_id} | ${name} | ${ts} | ${err} |`);
    }
    lines.push('');
  }

  const body = lines.join('\n');

  const subject = `[sd2026] ${rows.length} automation${rows.length === 1 ? '' : 's'} failing across ${
    tenantIds.length
  } tenant${tenantIds.length === 1 ? '' : 's'}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [DIGEST_TO_EMAIL],
      subject,
      text: body,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`Resend API error ${res.status}: ${text}`);
    // Notification routine — do NOT fail the workflow on mail send error.
    process.exit(0);
  }

  console.log(`sent digest: ${rows.length} automations across ${tenantIds.length} tenants`);
} catch (err) {
  console.error('digest failed:', err);
  // Notification only — never gate.
  process.exit(0);
} finally {
  await sql.end({ timeout: 5 });
}
