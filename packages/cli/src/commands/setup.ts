/**
 * `simpler setup` — interactive local-dev bootstrap for the SimplerDevelopment
 * monorepo. Scaffolds `.env.local` (copying the annotated `.env.example` and
 * auto-generating every `openssl`-style secret), picks the Docker or
 * bring-your-own-Postgres path, runs migrate + seed, and validates the result.
 *
 * Runs from source on a fresh clone via `bun run cli setup` (bun is a
 * documented prerequisite) — it is NOT meaningful when the published `simpler`
 * binary is invoked outside the repo, so it hard-gates on the monorepo root.
 *
 * Architecture note (matches the rest of this CLI): the pure logic — repo-root
 * detection, env parse/merge, secret planning, path selection — is exported for
 * `tests/unit/cli/`. `runSetup` is the ONLY impure entrypoint: it prompts,
 * writes files, and spawns child processes.
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve as resolvePath, dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

import { CliError } from '../client.js';

// ─── repo-root detection ──────────────────────────────────────────────────

/**
 * Markers that identify the SimplerDevelopment monorepo root. All must be
 * present so a random project with a `.env.example` isn't mistaken for it.
 */
const REPO_MARKERS = ['.env.example', 'docker-compose.yml', 'drizzle.config.ts'] as const;

/** Walk up from `cwd` looking for the monorepo root; null if not inside one. */
export function findRepoRoot(cwd: string): string | null {
  let dir = resolvePath(cwd);
  // Bounded walk to the filesystem root.
  for (;;) {
    if (REPO_MARKERS.every((m) => existsSync(join(dir, m)))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// ─── secret planning + generation ──────────────────────────────────────────

export type SecretKind = 'base64' | 'hex';

/**
 * Every secret the Core block needs, with the format `.env.example` documents
 * (`openssl rand -base64 32` → base64, `openssl rand -hex 32` → hex). All are
 * 32 random bytes.
 */
export const MANAGED_SECRETS: Record<string, SecretKind> = {
  AUTH_SECRET: 'base64',
  CRON_SECRET: 'hex',
  ENCRYPTION_KEY: 'hex',
  PORTAL_KMS_KEY: 'base64',
  WORKSPACE_TENANT_SECRETS_KEY: 'base64',
  OAUTH_STATE_SECRET: 'hex',
  INBOUND_EMAIL_SECRET: 'hex',
  // Service-to-service secrets — previously fixed dev-string fallbacks;
  // generating real values costs nothing and removes a prod footgun.
  REALTIME_JWT_SECRET: 'hex',
  REALTIME_INTERNAL_SECRET: 'hex',
  CHAT_TOKEN_SECRET: 'hex',
  SD_AGENTS_INTERNAL_SECRET: 'hex',
};

/** Core vars that MUST be non-blank for the app to boot (README minimum). */
export const REQUIRED_CORE = ['DATABASE_URL', 'AUTH_SECRET'] as const;

export function generateSecret(kind: SecretKind): string {
  return randomBytes(32).toString(kind === 'base64' ? 'base64' : 'hex');
}

/** Which managed secrets are currently unset (need generating). */
export function planSecrets(existing: Map<string, string>): string[] {
  return Object.keys(MANAGED_SECRETS).filter((k) => !hasValue(existing.get(k)));
}

// ─── env-file parse + merge (comment/order preserving) ─────────────────────

/** A value counts as "set" only if it's a non-empty, non-whitespace string. */
export function hasValue(v: string | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Parse `KEY=value` lines into a Map (last wins). Ignores comments/blanks. */
export function parseEnv(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    out.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  return out;
}

export interface EnvUpdate {
  value: string;
  /**
   * Optional test for placeholder values that should be treated as unset even
   * when the line is non-blank (e.g. `.env.example`'s `user:password@` DB URL).
   */
  placeholderTest?: (current: string) => boolean;
}

/**
 * Fill-if-unset merge over the raw env text — never clobbers a real value,
 * preserves comments, blank lines, and key order. A key already present with a
 * meaningful value is left untouched; a key present but blank (or matching its
 * `placeholderTest`) is filled in place; a missing key is appended.
 *
 * Returns the new text plus the list of keys that were actually written.
 */
export function mergeEnv(
  text: string,
  updates: Record<string, EnvUpdate>,
): { text: string; applied: string[] } {
  const lines = text.split('\n');
  const applied: string[] = [];
  const remaining = new Map(Object.entries(updates));

  const next = lines.map((raw) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return raw;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return raw;
    const key = trimmed.slice(0, eq).trim();
    const update = remaining.get(key);
    if (!update) return raw;

    const current = trimmed.slice(eq + 1).trim();
    const unset = !hasValue(current) || (update.placeholderTest?.(current) ?? false);
    remaining.delete(key);
    if (!unset) return raw;
    applied.push(key);
    return `${key}=${update.value}`;
  });

  // Append any keys that had no line at all.
  const appended: string[] = [];
  for (const [key, update] of remaining) {
    appended.push(`${key}=${update.value}`);
    applied.push(key);
  }
  if (appended.length > 0) {
    if (next.length > 0 && next[next.length - 1].trim() !== '') next.push('');
    next.push('# ── Added by `simpler setup` ──');
    next.push(...appended);
  }

  return { text: next.join('\n'), applied };
}

// ─── path selection ────────────────────────────────────────────────────────

export type SetupPath = 'docker' | 'local';

/** Resolve the Docker-vs-local path from flags + environment, deterministically. */
export function detectPath(
  flags: { docker?: boolean; local?: boolean },
  env: { dockerRunning: boolean },
): SetupPath {
  if (flags.docker && flags.local) {
    throw new CliError('Pass only one of --docker / --local.', 2, 'usage_error');
  }
  if (flags.docker) return 'docker';
  if (flags.local) return 'local';
  return env.dockerRunning ? 'docker' : 'local';
}

/**
 * Docker Postgres URL the app + host tooling share (db port is published to
 * localhost). Port 55432, not the Postgres default 5432 — docker-compose.yml
 * moved off 5432 in JUL9-013 so it never collides with a locally-installed
 * Postgres (Homebrew, Postgres.app, ...) that conventionally claims it.
 */
export const DOCKER_DATABASE_URL = 'postgresql://postgres:postgres@localhost:55432/simplerdev';

/** True when the current value is the `.env.example` DB placeholder. */
export function isDbPlaceholder(current: string): boolean {
  return current.includes('user:password@');
}

// ─── report shape ──────────────────────────────────────────────────────────

export interface SetupStep {
  name: string;
  ok: boolean;
  detail: string;
}

export interface SetupReport {
  success: boolean;
  path: SetupPath | null;
  dryRun: boolean;
  steps: SetupStep[];
  nextSteps: string[];
}

// ─── impure orchestration ──────────────────────────────────────────────────

interface SetupFlags {
  docker?: boolean;
  local?: boolean;
  check?: boolean;
  noSeed?: boolean;
  dbUrl?: string;
}

interface SetupOpts {
  cwd: string;
  isTTY: boolean;
  yes: boolean;
  dryRun: boolean;
  verbose: boolean;
  flags: SetupFlags;
}

function log(msg: string): void {
  // All human progress goes to stderr; the final envelope owns stdout.
  process.stderr.write(msg + '\n');
}

function which(cmd: string): boolean {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'command', ['-v', cmd], {
    stdio: 'ignore',
    shell: process.platform !== 'win32',
  });
  // On win32 `where` is a real exe; elsewhere `command -v` needs a shell.
  if (process.platform === 'win32') {
    return spawnSync('where', [cmd], { stdio: 'ignore' }).status === 0;
  }
  return r.status === 0;
}

function dockerDaemonRunning(): boolean {
  if (!which('docker')) return false;
  return spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
}

function versionOf(cmd: string, arg = '--version'): string {
  const r = spawnSync(cmd, [arg], { encoding: 'utf-8' });
  if (r.status !== 0) return '';
  return (r.stdout || r.stderr || '').trim().split('\n')[0];
}

function run(cmd: string, args: string[], cwd: string, env?: Record<string, string>): boolean {
  log(`\n→ ${cmd} ${args.join(' ')}`);
  return spawnSync(cmd, args, { cwd, stdio: 'inherit', env: env ? { ...process.env, ...env } : undefined }).status === 0;
}

/** Poll /api/health until the app answers OK (first cold boot: bun install + migrations, 10–20 min). */
async function waitForAppHealthy(timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  let lastNoteAt = 0;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const r = await fetch('http://localhost:3000/api/health');
      if (r.ok) return true;
    } catch {
      // app not up yet
    }
    const elapsed = Date.now() - startedAt;
    if (elapsed - lastNoteAt >= 30_000) {
      lastNoteAt = elapsed;
      log(`  … waiting for app health (${Math.round(elapsed / 60_000)}m elapsed; watch: docker compose logs -f app)`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  return false;
}

async function confirm(question: string, opts: SetupOpts): Promise<boolean> {
  if (opts.yes || !opts.isTTY) return true; // non-interactive → take the default
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`? ${question} [Y/n] `);
    return !/^n(o)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/** Like confirm(), but defaults to NO — for optional extras. Non-interactive → no. */
async function confirmOptIn(question: string, opts: SetupOpts): Promise<boolean> {
  if (opts.yes || !opts.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`? ${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function ask(question: string, opts: SetupOpts): Promise<string> {
  if (!opts.isTTY) return '';
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question(`? ${question} `)).trim();
  } finally {
    rl.close();
  }
}

const DEFAULT_PASSWORD = 'SimplerDev!2026';
interface SeedCreds {
  adminEmail: string;
  adminPassword: string;
  demoEmail: string;
  demoPassword: string;
}
const DEFAULT_CREDS: SeedCreds = {
  adminEmail: 'info@simplerdevelopment.com',
  adminPassword: DEFAULT_PASSWORD,
  demoEmail: 'demo@simplerdevelopment.com',
  demoPassword: DEFAULT_PASSWORD,
};

async function askRequiredEmail(label: string, opts: SetupOpts): Promise<string> {
  for (;;) {
    const v = await ask(`${label} email (required):`, opts);
    if (/^\S+@\S+\.\S+$/.test(v)) return v.toLowerCase();
    log('  a valid email address is required');
  }
}

/**
 * Interactive seeds require the admin + demo emails (no defaults); passwords
 * default on Enter. --yes / non-TTY can't prompt, so they keep the dev defaults.
 */
async function askSeedCreds(opts: SetupOpts): Promise<SeedCreds> {
  if (opts.yes || !opts.isTTY) return DEFAULT_CREDS;
  const adminEmail = await askRequiredEmail('Admin', opts);
  const adminPassword = (await ask(`Admin password [${DEFAULT_PASSWORD}]:`, opts)) || DEFAULT_PASSWORD;
  const demoEmail = await askRequiredEmail('Demo tenant', opts);
  const demoPassword = (await ask(`Demo tenant password [${DEFAULT_PASSWORD}]:`, opts)) || DEFAULT_PASSWORD;
  return { adminEmail, adminPassword, demoEmail, demoPassword };
}

/** Step detail for a successful seed — never echo a user-chosen password back. */
function seedDetail(creds: SeedCreds): string {
  const pw = (p: string) => (p === DEFAULT_PASSWORD ? p : '(password as entered)');
  return `admin: ${creds.adminEmail} / ${pw(creds.adminPassword)} · demo: ${creds.demoEmail} / ${pw(creds.demoPassword)}`;
}

function seedEnv(creds: SeedCreds): Record<string, string> {
  return {
    ADMIN_EMAIL: creds.adminEmail,
    ADMIN_PASSWORD: creds.adminPassword,
    DEMO_EMAIL: creds.demoEmail,
    DEMO_PASSWORD: creds.demoPassword,
  };
}

const STRIPE_WEBHOOK_KEYS = [
  ['STRIPE_WEBHOOK_SECRET', '/api/stripe/webhook (platform billing)'],
  ['STRIPE_ECOMMERCE_WEBHOOK_SECRET', '/api/stripe/webhook/ecommerce (storefront orders)'],
  ['STRIPE_BOOKING_WEBHOOK_SECRET', '/api/stripe/webhook/booking (booking payments)'],
] as const;

/**
 * Numbered-choice prompt: prints the options, Enter picks the default.
 * Re-asks on anything that isn't a valid option number.
 * Non-interactive (--yes / no TTY) → the default, like the other prompts.
 */
async function choose(
  question: string,
  options: string[],
  defaultIndex: number,
  opts: SetupOpts,
): Promise<number> {
  if (opts.yes || !opts.isTTY) return defaultIndex;
  log(`? ${question}`);
  options.forEach((o, i) => log(`    ${i + 1}) ${o}${i === defaultIndex ? '  (default)' : ''}`));
  for (;;) {
    const answer = (await ask(`choice [${defaultIndex + 1}]:`, opts)).trim();
    if (answer === '') return defaultIndex;
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return n - 1;
    log(`  enter a number 1-${options.length}, or press Enter for the default`);
  }
}

/**
 * Email transport — a choice tree: each branch asks only its own follow-ups.
 * Non-interactive keeps the old behavior: docker → mailpit, local → unset.
 */
async function askEmailConfig(
  effectivePath: SetupPath,
  opts: SetupOpts,
): Promise<Record<string, string>> {
  if (opts.yes || !opts.isTTY) {
    return effectivePath === 'docker' ? { EMAIL_TRANSPORT: 'mailpit' } : {};
  }

  const picked = await choose(
    'Email transport:',
    [
      'Mailpit — capture all outbound mail locally (UI: http://localhost:8025)',
      'Resend — send real email (needs an API key + a domain verified at resend.com)',
      'Skip — decide later (sending fails until a transport is configured)',
    ],
    0,
    opts,
  );

  if (picked === 2) return {};
  if (picked === 0) return { EMAIL_TRANSPORT: 'mailpit' };

  // Resend branch — follow-ups only make sense here.
  const out: Record<string, string> = { EMAIL_TRANSPORT: 'resend' };
  const key = await ask('Resend API key (re_..., from resend.com → API Keys — Enter to skip):', opts);
  if (key) {
    out.RESEND_API_KEY = key;
    const from = await ask('From email address (on a domain verified in Resend → Domains):', opts);
    if (from) out.RESEND_FROM_EMAIL = from;
  }
  // no key → skip the from-address question; the next-steps warning covers it
  return out;
}

/**
 * AI keys — the Company Brain / AI chat / embeddings are dead without them.
 * Anthropic powers chat + agents; OpenAI powers embeddings (RAG search).
 */
async function askAiConfig(opts: SetupOpts): Promise<Record<string, string>> {
  if (opts.yes || !opts.isTTY) return {};
  const wants = await confirmOptIn(
    'Set up AI keys now? (Company Brain / AI chat / RAG search stay dormant without them)',
    opts,
  );
  if (!wants) return {};
  const out: Record<string, string> = {};
  const anthropic = await ask('Anthropic API key (sk-ant-..., console.anthropic.com — Enter to skip):', opts);
  if (anthropic) out.ANTHROPIC_API_KEY = anthropic;
  const openai = await ask('OpenAI API key (sk-..., used for embeddings/RAG — Enter to skip):', opts);
  if (openai) out.OPENAI_API_KEY = openai;
  return out;
}

/**
 * Contact email — the .env.example defaults route to simplerdevelopment.com
 * inboxes; a self-hosted instance should receive its own contact/support mail.
 * One answer fills all four vars.
 */
async function askContactEmail(opts: SetupOpts): Promise<Record<string, string>> {
  if (opts.yes || !opts.isTTY) return {};
  const email = await ask('Your contact email (contact forms, billing + support notices — Enter to keep defaults):', opts);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return {};
  return {
    CONTACT_INBOX: email,
    BILLING_EMAIL: email,
    SUPPORT_EMAIL: email,
    NEXT_PUBLIC_CONTACT_EMAIL: email,
  };
}

/**
 * File storage — choice tree like email: local MinIO (docker, default),
 * remote S3-compatible (R2/S3/MinIO elsewhere), or skip (uploads disabled).
 * The docker-internal endpoint (minio:9000) pairs with S3_PUBLIC_ENDPOINT
 * (localhost:9000) because presigned URLs are consumed by the browser.
 */
async function askStorageConfig(
  effectivePath: SetupPath,
  opts: SetupOpts,
): Promise<Record<string, string>> {
  if (opts.yes || !opts.isTTY) return {};
  const picked = await choose(
    'File storage (media library / uploads):',
    [
      'Local MinIO — runs in the docker stack, console at http://localhost:9001',
      'S3-compatible remote — AWS S3, Cloudflare R2, or your own MinIO',
      'Skip — uploads stay disabled until configured',
    ],
    effectivePath === 'docker' ? 0 : 2,
    opts,
  );

  if (picked === 2) return {};
  if (picked === 0) {
    const inDocker = effectivePath === 'docker';
    return {
      // in-container ops talk to the service name; the browser gets localhost
      S3_ENDPOINT: inDocker ? 'http://minio:9000' : 'http://localhost:9000',
      ...(inDocker ? { S3_PUBLIC_ENDPOINT: 'http://localhost:9000' } : {}),
      S3_REGION: 'us-east-1',
      S3_BUCKET_NAME: 'simplerdev-media',
      S3_ACCESS_KEY_ID: 'minioadmin',
      S3_SECRET_ACCESS_KEY: 'minioadmin',
    };
  }

  const out: Record<string, string> = {};
  const endpoint = await ask('S3 endpoint URL (e.g. https://<account>.r2.cloudflarestorage.com):', opts);
  if (endpoint) out.S3_ENDPOINT = endpoint;
  const region = await ask('Region [us-east-1]:', opts);
  out.S3_REGION = region || 'us-east-1';
  const bucket = await ask('Bucket name:', opts);
  if (bucket) out.S3_BUCKET_NAME = bucket;
  const keyId = await ask('Access key ID:', opts);
  if (keyId) out.S3_ACCESS_KEY_ID = keyId;
  const secret = await ask('Secret access key:', opts);
  if (secret) out.S3_SECRET_ACCESS_KEY = secret;
  return out;
}

/**
 * Optional Stripe setup — collects API keys + webhook signing secrets into the
 * .env.local write. Skipping leaves billing dormant: the app runs fine, and
 * onboarding activates modules without charging until Stripe is configured.
 */
async function askStripeConfig(opts: SetupOpts): Promise<{ env: Record<string, string>; configured: boolean }> {
  const env: Record<string, string> = {};
  const wants = await confirmOptIn(
    'Set up Stripe payments now? (optional — billing stays dormant without it)',
    opts,
  );
  if (!wants) return { env, configured: false };

  log('  Keys: dashboard.stripe.com → Developers → API keys (use sk_test_/pk_test_ locally)');
  const sk = await ask('Stripe secret key (sk_...):', opts);
  if (sk) env.STRIPE_SECRET_KEY = sk;
  const pk = await ask('Stripe publishable key (pk_...):', opts);
  if (pk) env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk;

  log('  Webhooks: 3 endpoints, each with its own signing secret (Enter to skip any).');
  log('  Local dev: `stripe listen --forward-to localhost:3000/api/stripe/webhook` prints a whsec_...');
  for (const [key, endpoint] of STRIPE_WEBHOOK_KEYS) {
    const v = await ask(`${key} — ${endpoint}:`, opts);
    if (v) env[key] = v;
  }
  return { env, configured: Boolean(sk) };
}

/**
 * Runs the whole wizard and returns a report envelope. Exit code is derived
 * from `report.success` by the caller.
 */
export async function runSetup(opts: SetupOpts): Promise<SetupReport> {
  const steps: SetupStep[] = [];
  const nextSteps: string[] = [];
  const add = (name: string, ok: boolean, detail: string) => {
    steps.push({ name, ok, detail });
    log(`${ok ? '✓' : '✗'} ${name}: ${detail}`);
  };

  // 1. Must be inside the monorepo.
  const root = findRepoRoot(opts.cwd);
  if (!root) {
    throw new CliError(
      'simpler setup must run inside a SimplerDevelopment monorepo clone ' +
        '(none of docker-compose.yml / .env.example / drizzle.config.ts found up the tree). ' +
        'Clone the repo, then run `bun run cli setup` from its root.',
      2,
      'usage_error',
    );
  }
  log(`\nSimplerDevelopment local setup\nrepo: ${root}\n`);

  // 2. Prerequisites.
  const bunV = versionOf('bun');
  add('bun', hasValue(bunV), bunV || 'not found — install from https://bun.sh (>=1.3.11)');
  const dockerUp = dockerDaemonRunning();

  // 3. Path selection.
  const path = detectPath(opts.flags, { dockerRunning: dockerUp });
  if (path === 'docker') {
    add('docker', dockerUp, dockerUp ? versionOf('docker') : 'daemon not reachable');
  } else {
    add('postgres', true, 'bring-your-own Postgres (must have the pgvector extension)');
  }
  const usingDocker =
    path === 'docker' && (await confirm('Use the Docker stack (Postgres + app + Mailpit)?', opts));
  const effectivePath: SetupPath = usingDocker ? 'docker' : 'local';

  // 4. Scaffold .env.local (never clobber real values; back up first).
  const envLocalPath = join(root, '.env.local');
  const envExamplePath = join(root, '.env.example');
  const hadEnvLocal = existsSync(envLocalPath);
  const baseText = hadEnvLocal
    ? readFileSync(envLocalPath, 'utf-8')
    : readFileSync(envExamplePath, 'utf-8');
  const existing = parseEnv(baseText);

  // Resolve DATABASE_URL for the chosen path.
  let dbUrl = opts.flags.dbUrl ?? '';
  if (effectivePath === 'docker') {
    dbUrl = DOCKER_DATABASE_URL;
  } else if (!hasValue(dbUrl)) {
    const current = existing.get('DATABASE_URL') ?? '';
    if (hasValue(current) && !isDbPlaceholder(current)) {
      dbUrl = current; // keep the dev's existing local URL
    } else {
      dbUrl = (await ask('Local DATABASE_URL (postgres w/ pgvector):', opts)) || '';
    }
  }

  const updates: Record<string, EnvUpdate> = {};
  // Secrets: fill only the unset ones.
  const toGenerate = planSecrets(existing);
  for (const key of toGenerate) {
    updates[key] = { value: generateSecret(MANAGED_SECRETS[key]) };
  }
  // DATABASE_URL: fill when blank or still the example placeholder.
  if (hasValue(dbUrl)) {
    updates.DATABASE_URL = { value: dbUrl, placeholderTest: isDbPlaceholder };
  }
  // Localhost URLs + Docker email transport: fill only if unset.
  updates.NEXTAUTH_URL = { value: 'http://localhost:3000' };
  updates.NEXT_PUBLIC_SITE_URL = { value: 'http://localhost:3000' };
  updates.NEXT_PUBLIC_APP_URL = { value: 'http://localhost:3000' };
  // Email transport (mailpit capture vs real sending via Resend).
  const emailCfg =
    opts.flags.check || opts.dryRun
      ? effectivePath === 'docker'
        ? { EMAIL_TRANSPORT: 'mailpit' }
        : {}
      : await askEmailConfig(effectivePath, opts);
  for (const [key, value] of Object.entries(emailCfg)) {
    updates[key] = { value };
  }

  // Optional sections (each skippable; non-interactive resolves to defaults).
  const skipOptional = opts.flags.check || opts.dryRun;
  const aiCfg = skipOptional ? {} : await askAiConfig(opts);
  const contactCfg = skipOptional ? {} : await askContactEmail(opts);
  const storageCfg = skipOptional ? {} : await askStorageConfig(effectivePath, opts);
  for (const [key, value] of Object.entries({ ...aiCfg, ...contactCfg, ...storageCfg })) {
    updates[key] = { value };
  }

  // Optional Stripe payments (skippable — billing stays dormant without it).
  const stripeSetup =
    opts.flags.check || opts.dryRun ? { env: {}, configured: false } : await askStripeConfig(opts);
  for (const [key, value] of Object.entries(stripeSetup.env)) {
    updates[key] = { value };
  }

  const merged = mergeEnv(baseText, updates);
  const genCount = merged.applied.filter((k) => k in MANAGED_SECRETS).length;

  if (opts.flags.check) {
    // Validate-only: report what's missing, write nothing.
    for (const key of REQUIRED_CORE) {
      add(`env:${key}`, hasValue(existing.get(key)), hasValue(existing.get(key)) ? 'set' : 'MISSING');
    }
    add('env.local', hadEnvLocal, hadEnvLocal ? envLocalPath : 'missing — run without --check to create');
    const missingSecrets = planSecrets(existing);
    add(
      'secrets',
      missingSecrets.length === 0,
      missingSecrets.length === 0 ? 'all set' : `${missingSecrets.length} unset: ${missingSecrets.join(', ')}`,
    );
    return finalize(steps, nextSteps, effectivePath, opts.dryRun);
  }

  if (opts.dryRun) {
    add('env.local (dry-run)', true, `would write ${merged.applied.length} keys (${genCount} secrets) to ${envLocalPath}`);
    add('database (dry-run)', true, effectivePath === 'docker' ? DOCKER_DATABASE_URL : dbUrl || '(prompt)');
    add('migrate+seed (dry-run)', true, effectivePath === 'docker' ? 'docker compose boot + db:seed:dev' : 'drizzle-kit migrate + db:seed:dev');
    return finalize(steps, nextSteps, effectivePath, true);
  }

  if (merged.applied.length === 0) {
    add('env.local', true, 'already complete — nothing to fill');
  } else if (await confirm(`Write .env.local (${merged.applied.length} keys, ${genCount} generated secrets)?`, opts)) {
    if (hadEnvLocal) copyFileSync(envLocalPath, envLocalPath + '.bak');
    writeFileSync(envLocalPath, merged.text.endsWith('\n') ? merged.text : merged.text + '\n');
    add('env.local', true, `wrote ${merged.applied.length} keys (${genCount} secrets)${hadEnvLocal ? ', backup → .env.local.bak' : ''}`);
  } else {
    add('env.local', false, 'skipped by user');
  }

  // 5. Database bring-up.
  if (effectivePath === 'docker') {
    if (await confirm('Start the stack now with `docker compose up -d`? (migrations run at boot)', opts)) {
      const ok = run('docker', ['compose', 'up', '-d'], root);
      add('docker compose up', ok, ok ? 'containers starting; migrations run on app boot' : 'failed — see output above');
      nextSteps.push('First cold boot runs `bun install` + migrations (10–20 min). Watch: docker compose logs -f app');
      nextSteps.push('App: http://localhost:3000 · Mailpit: http://localhost:8025');
    } else {
      add('docker compose up', false, 'skipped — run `docker compose up -d` when ready');
    }
    if (!opts.flags.noSeed && (await confirm('Seed dev data (admin login + demo tenant) once the app is up?', opts))) {
      const creds = await askSeedCreds(opts);
      log('\n→ waiting for http://localhost:3000/api/health (up to 20 min on first cold boot)');
      const healthy = await waitForAppHealthy(20 * 60 * 1000);
      // valueless -e flags: docker pulls the values from the CLI's env, so the
      // passwords never appear in the echoed command line
      const ok =
        healthy &&
        run(
          'docker',
          [
            'compose',
            'exec',
            ...Object.keys(seedEnv(creds)).flatMap((k) => ['-e', k]),
            'app',
            'bun',
            'run',
            'db:seed:dev',
          ],
          root,
          seedEnv(creds),
        );
      add(
        'seed',
        ok,
        ok
          ? seedDetail(creds)
          : healthy
            ? 'seed script failed — see output above'
            : 'app never became healthy — once it is, run: docker compose exec app bun run db:seed:dev',
      );
    }
  } else {
    // Local Postgres path: verify target isn't prod, migrate, seed — all on host.
    if (!hasValue(dbUrl)) {
      add('database', false, 'no DATABASE_URL provided — set one and re-run (or use --docker)');
      nextSteps.push('Enable pgvector once on your DB: CREATE EXTENSION IF NOT EXISTS vector;');
      return finalize(steps, nextSteps, effectivePath, false);
    }
    if (await confirm('Run migrations against this DB now?', opts)) {
      const guard = run('bun', ['scripts/verify-db-target.ts'], root);
      if (!guard) {
        add('migrate', false, 'verify-db-target refused the URL (looks like prod?) — aborted');
        return finalize(steps, nextSteps, effectivePath, false);
      }
      const m1 = run('bunx', ['drizzle-kit', 'migrate'], root);
      const m2 = m1 && run('bun', ['scripts/apply-local-manual-migrations.ts'], root);
      add('migrate', m1 && m2, m1 && m2 ? 'schema applied' : 'failed — ensure pgvector is installed (CREATE EXTENSION vector)');
      if (!(m1 && m2)) nextSteps.push('Enable pgvector: CREATE EXTENSION IF NOT EXISTS vector; then re-run.');
    }
    if (!opts.flags.noSeed && (await confirm('Seed dev data (admin login + demo tenant)?', opts))) {
      const creds = await askSeedCreds(opts);
      const ok = run('bun', ['run', 'db:seed:dev'], root, seedEnv(creds));
      add('seed', ok, ok ? seedDetail(creds) : 'failed — see output above');
    }
    nextSteps.push('Start the app: bun dev  →  http://localhost:3000');
  }

  if (storageCfg.S3_ACCESS_KEY_ID === 'minioadmin' && effectivePath !== 'docker') {
    nextSteps.push('Local MinIO storage chosen — start it once with: docker compose up -d minio (console: http://localhost:9001).');
  }
  if (emailCfg.EMAIL_TRANSPORT === 'resend' && !emailCfg.RESEND_API_KEY) {
    nextSteps.push('Resend transport chosen but no API key given — sending will fail until RESEND_API_KEY is set in .env.local (resend.com → API Keys).');
  }
  if (emailCfg.EMAIL_TRANSPORT === 'mailpit' && effectivePath !== 'docker') {
    nextSteps.push('Mailpit transport on the local path — start it once with: docker compose up -d mailpit (UI: http://localhost:8025).');
  }
  if (stripeSetup.configured) {
    add('stripe', true, `${Object.keys(stripeSetup.env).length} keys written to .env.local`);
    const missingHooks = STRIPE_WEBHOOK_KEYS.filter(([k]) => !stripeSetup.env[k]).map(([k]) => k);
    if (missingHooks.length > 0) {
      nextSteps.push(
        `Stripe webhooks not yet wired (${missingHooks.join(', ')}) — register the endpoints in the Stripe dashboard, or locally: stripe listen --forward-to localhost:3000/api/stripe/webhook`,
      );
    }
    nextSteps.push('Mint tier products in your Stripe account: bun scripts/create-tier-stripe-products.ts (test key only), then re-run bun scripts/seed-domain-modules.ts to backfill price IDs.');
  } else {
    nextSteps.push('Optional integrations (Stripe/Google/S3/Resend/…) stay dormant until filled — see .env.example.');
  }
  return finalize(steps, nextSteps, effectivePath, false);
}

function finalize(steps: SetupStep[], nextSteps: string[], path: SetupPath, dryRun: boolean): SetupReport {
  const report: SetupReport = { success: steps.every((s) => s.ok), path, dryRun, steps, nextSteps };
  if (nextSteps.length > 0) {
    log('\nNext:');
    for (const n of nextSteps) log(`  • ${n}`);
  }
  return report;
}
