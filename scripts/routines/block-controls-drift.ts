#!/usr/bin/env bun
/**
 * Compares the live block-editor controls coverage report against the
 * committed baseline and flags regressions.
 *
 * Inputs (relative to process.cwd(), which the workflow sets to
 * `simplerdevelopment2026/`):
 *   - .planning/audits/blocks-controls-coverage.json          (current)
 *   - .planning/audits/blocks-controls-coverage.baseline.json (protected)
 *
 * Regression definition (per block type present in the baseline):
 *   - block missing entirely from the current report
 *   - current `fieldsMissingFromBoth.length` > baseline.fieldsMissingFromBoth
 *   - current `deadElementKeys.length`       > baseline.deadElementKeys
 *   - current `hasE2E === false` while baseline.hasE2E === true
 *
 * New blocks in current that aren't in baseline are reported as
 * informational, never as regressions.
 *
 * Behavior split:
 *   - On `pull_request`: print the markdown summary, exit 1 if regressions.
 *   - On `schedule` / `workflow_dispatch`: same comparison, but on regression
 *     open (or comment on a recent open) GitHub issue via `gh`. Dedup window
 *     is 7 days against title prefix `Block controls regression`.
 *   - In any case, exit 0 when no regressions.
 *
 * Used by .github/workflows/sd2026-block-controls-drift.yml.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

type CurrentReport = {
  type: string;
  fieldsMissingFromBoth?: string[];
  deadElementKeys?: string[];
  hasE2E?: boolean;
};

type CurrentFile = {
  generatedAt?: string;
  totalBlocks?: number;
  reports?: CurrentReport[];
};

type BaselineEntry = {
  fieldsMissingFromBoth: number;
  deadElementKeys: number;
  hasE2E: boolean;
};

type BaselineFile = {
  blocks: Record<string, BaselineEntry>;
};

const cwd = process.cwd();
const currentPath = path.join(cwd, '.planning/audits/blocks-controls-coverage.json');
const baselinePath = path.join(cwd, '.planning/audits/blocks-controls-coverage.baseline.json');

if (!fs.existsSync(currentPath)) {
  console.error(`Missing ${currentPath} — run from simplerdevelopment2026/.`);
  process.exit(2);
}
if (!fs.existsSync(baselinePath)) {
  console.error(`Missing ${baselinePath} — run from simplerdevelopment2026/.`);
  process.exit(2);
}

const current: CurrentFile = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
const baseline: BaselineFile = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

if (!Array.isArray(current.reports)) {
  console.error('Current coverage file has no `reports` array.');
  process.exit(2);
}
if (!baseline.blocks || typeof baseline.blocks !== 'object') {
  console.error('Baseline file has no `blocks` object.');
  process.exit(2);
}

const currentByType = new Map<string, CurrentReport>();
for (const r of current.reports) {
  if (r && typeof r.type === 'string') currentByType.set(r.type, r);
}

type Regression = {
  type: string;
  reasons: string[];
};

const regressions: Regression[] = [];
const newBlocks: string[] = [];
const okBlocks: string[] = [];

for (const [type, base] of Object.entries(baseline.blocks)) {
  const cur = currentByType.get(type);
  if (!cur) {
    regressions.push({ type, reasons: ['block missing entirely from current coverage report'] });
    continue;
  }
  const reasons: string[] = [];
  const curMissing = Array.isArray(cur.fieldsMissingFromBoth) ? cur.fieldsMissingFromBoth.length : 0;
  const curDead = Array.isArray(cur.deadElementKeys) ? cur.deadElementKeys.length : 0;
  if (curMissing > base.fieldsMissingFromBoth) {
    reasons.push(
      `fieldsMissingFromBoth: ${curMissing} > baseline ${base.fieldsMissingFromBoth}` +
        (Array.isArray(cur.fieldsMissingFromBoth) && cur.fieldsMissingFromBoth.length
          ? ` (${cur.fieldsMissingFromBoth.join(', ')})`
          : ''),
    );
  }
  if (curDead > base.deadElementKeys) {
    reasons.push(
      `deadElementKeys: ${curDead} > baseline ${base.deadElementKeys}` +
        (Array.isArray(cur.deadElementKeys) && cur.deadElementKeys.length
          ? ` (${cur.deadElementKeys.join(', ')})`
          : ''),
    );
  }
  if (base.hasE2E === true && cur.hasE2E === false) {
    reasons.push('hasE2E regressed: true → false');
  }
  if (reasons.length > 0) {
    regressions.push({ type, reasons });
  } else {
    okBlocks.push(type);
  }
}

for (const type of currentByType.keys()) {
  if (!(type in baseline.blocks)) newBlocks.push(type);
}

// --- markdown summary -----------------------------------------------------

const eventName = process.env.GITHUB_EVENT_NAME ?? '(local)';
const lines: string[] = [];
lines.push('# Block controls coverage drift');
lines.push('');
lines.push(`- Event: \`${eventName}\``);
lines.push(`- Current report generated: ${current.generatedAt ?? '(unknown)'}`);
lines.push(`- Baseline blocks: ${Object.keys(baseline.blocks).length}`);
lines.push(`- Current blocks: ${currentByType.size}`);
lines.push(`- Regressions: **${regressions.length}**`);
lines.push(`- New blocks (informational): ${newBlocks.length}`);
lines.push(`- Clean blocks: ${okBlocks.length}`);
lines.push('');

if (regressions.length > 0) {
  lines.push('## Regressions');
  lines.push('');
  for (const r of regressions) {
    lines.push(`- **${r.type}**`);
    for (const reason of r.reasons) lines.push(`  - ${reason}`);
  }
  lines.push('');
}

if (newBlocks.length > 0) {
  lines.push('## New blocks (not in baseline)');
  lines.push('');
  for (const t of newBlocks) lines.push(`- ${t}`);
  lines.push('');
  lines.push('To bake these into the baseline, add an entry under `blocks` in `blocks-controls-coverage.baseline.json`.');
  lines.push('');
}

const markdown = lines.join('\n');
console.log(markdown);

if (regressions.length === 0) {
  console.log('In sync — no regressions vs baseline.');
  process.exit(0);
}

// --- regression handling --------------------------------------------------

const isPullRequest = eventName === 'pull_request';

if (isPullRequest) {
  console.log('::error::Block controls coverage regressed vs baseline. See summary above.');
  process.exit(1);
}

// schedule / workflow_dispatch: open or comment on a GitHub issue.
const ISSUE_TITLE_PREFIX = 'Block controls regression';
const todayIso = new Date().toISOString().slice(0, 10);
const newTitle = `${ISSUE_TITLE_PREFIX} — ${todayIso}`;

const repo = process.env.GITHUB_REPOSITORY;
const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
const runId = process.env.GITHUB_RUN_ID;
const runUrl = repo && runId ? `${serverUrl}/${repo}/actions/runs/${runId}` : null;

let issueBody = markdown;
if (runUrl) issueBody += `\n\n---\nDetected by [workflow run](${runUrl}).`;

function gh(args: string[]): string {
  try {
    return execFileSync('gh', args, { encoding: 'utf8' });
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string };
    const stderr = e.stderr ? (Buffer.isBuffer(e.stderr) ? e.stderr.toString('utf8') : e.stderr) : '';
    throw new Error(`gh ${args.join(' ')} failed: ${stderr || e.message}`);
  }
}

type ExistingIssue = { number: number; title: string; createdAt: string; url: string };

let existing: ExistingIssue[] = [];
try {
  const raw = gh([
    'issue',
    'list',
    '--state',
    'open',
    '--search',
    `${ISSUE_TITLE_PREFIX} in:title`,
    '--limit',
    '20',
    '--json',
    'number,title,createdAt,url',
  ]);
  existing = JSON.parse(raw) as ExistingIssue[];
} catch (err) {
  console.error(String(err));
}

const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
const recent = existing
  .filter((i) => i.title.startsWith(ISSUE_TITLE_PREFIX))
  .filter((i) => new Date(i.createdAt).getTime() >= sevenDaysAgo)
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

if (recent.length > 0) {
  const target = recent[0];
  console.log(`Commenting on existing issue #${target.number} (${target.url}).`);
  try {
    gh(['issue', 'comment', String(target.number), '--body', issueBody]);
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }
} else {
  console.log('Opening new regression issue.');
  try {
    const out = gh(['issue', 'create', '--title', newTitle, '--body', issueBody, '--label', 'block-editor,drift']);
    console.log(out);
  } catch (err) {
    // Labels may not exist; retry without them rather than failing the run.
    console.error(`Initial issue create failed, retrying without labels: ${String(err)}`);
    try {
      const out = gh(['issue', 'create', '--title', newTitle, '--body', issueBody]);
      console.log(out);
    } catch (err2) {
      console.error(String(err2));
      process.exit(1);
    }
  }
}

console.log('::error::Block controls coverage regressed vs baseline.');
process.exit(1);
