#!/usr/bin/env bun
/**
 * Secret-leak pre-commit gate.
 *
 * A live OpenAI key once sat in a tracked `.env` right as this repo was going open-source
 * (claude-mem #7181). This stops that class of mistake at the commit boundary, before the
 * secret ever lands in history — where scrubbing it means a force-push and key rotation.
 *
 * Two independent checks, both on the STAGED change only:
 *   1. Filename gate — refuse to commit a real `.env*` file (env vars belong in the host /
 *      ~/.simplerdev/, never in the repo). `*.example` / `*.sample` templates are allowed.
 *   2. Content gate — scan ONLY newly-added lines (git diff `+`) for well-known key formats
 *      and obvious `SECRET=<literal>` assignments. Added-lines-only keeps false positives near
 *      zero: editing a file elsewhere never re-flags pre-existing content.
 *
 * Escape hatches (use sparingly, they are auditable in the diff):
 *   - append `pragma: allowlist secret` to a line to whitelist that one line (fake fixture keys)
 *   - `git commit --no-verify` bypasses the whole hook once
 *
 * Self-check:  bun scripts/check-secrets.ts --selftest
 */
import { execSync } from 'node:child_process';

// High-signal patterns. Each is specific enough that a match is almost certainly a real
// credential, not a placeholder. The generic assignment rule (last) is the only FP-prone one
// and is guarded hard below.
const RULES: { name: string; re: RegExp }[] = [
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'OpenAI/Anthropic key', re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Stripe live key', re: /\b[sr]k_live_[A-Za-z0-9]{20,}\b/ },
];

// Generic "SECRET = <long literal>" — guarded so placeholders and env-var references don't trip.
const ASSIGN =
  /(?:api[_-]?key|secret|token|password|passwd|client[_-]?secret|access[_-]?key|auth[_-]?token)['"]?\s*[:=]\s*['"]([A-Za-z0-9_\-/+=.]{16,})['"]/i;
// A value is a placeholder (not a real secret) if it looks like one of these.
const PLACEHOLDER =
  /^(?:process\.env|import\.meta|your[_-]|example|placeholder|changeme|change_me|dummy|test|xxx|<|\$\{|\.\.\.)/i;

const FILENAME_ALLOW = /\.(example|sample|template)$|\.env\.example$/i;
const IS_ENV_FILE = /(^|\/)\.env(\.|$)/;
const ALLOWLIST_LINE = /pragma:\s*allowlist secret/i;
// The scanner itself + its tests legitimately contain pattern-shaped strings.
const SELF = /scripts\/check-secrets\.ts$/;

type Finding = { file: string; line: number; rule: string };

function scan(files: string[], diffFor: (f: string) => string): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    if (SELF.test(file)) continue;

    if (IS_ENV_FILE.test(file) && !FILENAME_ALLOW.test(file)) {
      findings.push({ file, line: 0, rule: 'env file must not be committed' });
      continue;
    }
    if (FILENAME_ALLOW.test(file)) continue;

    // Parse `git diff -U0` hunks: track new-file line numbers, inspect only added (`+`) lines.
    let lineNo = 0;
    for (const raw of diffFor(file).split('\n')) {
      const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
      if (hunk) { lineNo = parseInt(hunk[1], 10); continue; }
      if (raw.startsWith('+') && !raw.startsWith('+++')) {
        const text = raw.slice(1);
        if (!ALLOWLIST_LINE.test(text)) {
          for (const { name, re } of RULES) {
            if (re.test(text)) { findings.push({ file, line: lineNo, rule: name }); break; }
          }
          const m = text.match(ASSIGN);
          if (m && !PLACEHOLDER.test(m[1])) {
            findings.push({ file, line: lineNo, rule: 'hardcoded secret assignment' });
          }
        }
        lineNo++;
      } else if (!raw.startsWith('-') && !raw.startsWith('\\')) {
        lineNo++; // context line
      }
    }
  }
  return findings;
}

function selftest(): void {
  const diff = (added: string[]) =>
    '@@ -0,0 +1 @@\n' + added.map((l) => '+' + l).join('\n');
  const bad = [
    'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123',
    'const k = "sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA"',
    'aws=AKIAIOSFODNN7EXAMPLE', // AKIA + exactly 16 chars
    'token: ghp_0123456789012345678901234567890123456',
    'password = "hunter2correcthorsebattery"',
  ];
  const good = [
    'const key = process.env.OPENAI_API_KEY',
    'API_KEY="your-api-key-here"',
    'secret: "example-value-placeholder"',
    'fake = "sk-not-real-but-allowed" // pragma: allowlist secret',
    'const label = "token"',
  ];
  for (const l of bad) {
    const f = scan(['x.ts'], () => diff([l]));
    if (f.length === 0) throw new Error(`selftest FAIL — missed secret: ${l}`);
  }
  for (const l of good) {
    const f = scan(['x.ts'], () => diff([l]));
    if (f.length !== 0) throw new Error(`selftest FAIL — false positive: ${l} (${f[0].rule})`);
  }
  // Filename gate: real .env blocked, .env.example allowed.
  if (scan(['.env'], () => '').length === 0) throw new Error('selftest FAIL — .env not blocked');
  if (scan(['.env.example'], () => '').length !== 0) throw new Error('selftest FAIL — .env.example blocked');
  console.log('check-secrets selftest: OK');
}

if (process.argv.includes('--selftest')) {
  selftest();
  process.exit(0);
}

const staged = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const findings = scan(staged, (f) => {
  try {
    return execSync(`git diff --cached -U0 --diff-filter=ACMR -- "${f}"`, { encoding: 'utf8' });
  } catch {
    return '';
  }
});

if (findings.length > 0) {
  console.error('\n✖ Potential secret(s) in staged changes:\n');
  for (const f of findings) {
    console.error(`  ${f.file}${f.line ? ':' + f.line : ''}  — ${f.rule}`);
  }
  console.error(
    '\nRemove the secret (env vars belong in the host / ~/.simplerdev/, not the repo).' +
      '\nIf this is a fake fixture value, append  pragma: allowlist secret  to the line.' +
      '\nOne-off bypass:  git commit --no-verify\n',
  );
  process.exit(1);
}
