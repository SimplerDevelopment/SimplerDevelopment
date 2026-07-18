/**
 * `simpler create <dir>` — the npx-style front door. Runs OUTSIDE any clone
 * (the mirror image of `simpler setup`, which runs inside one): it clones the
 * monorepo into a fresh directory, installs deps, and hands off to
 * `simpler setup` so a developer goes from nothing to a running stack in one
 * command:
 *
 *   bunx create-simplerdevelopment my-app
 *   npm create simplerdevelopment@latest my-app   (via the thin shim package)
 *   simpler create my-app
 *
 * As with setup, the pure logic (target resolution, clone-arg building) is
 * exported for unit tests; `runCreate` is the only impure entrypoint.
 */

import { existsSync, readdirSync } from 'node:fs';
import { resolve as resolvePath, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

import { CliError } from '../client.js';

/** Canonical repository the front door clones from. */
export const DEFAULT_REPO = 'https://github.com/SimplerDevelopment/SimplerDevelopment.git';

export type TargetState = 'missing' | 'empty' | 'nonempty';

/** Classify the clone target: safe to use unless it exists and is non-empty. */
export function targetDirState(path: string): TargetState {
  if (!existsSync(path)) return 'missing';
  try {
    // A directory with only dotfiles like .DS_Store still counts as usable.
    const entries = readdirSync(path).filter((e) => e !== '.DS_Store');
    return entries.length === 0 ? 'empty' : 'nonempty';
  } catch {
    return 'nonempty'; // exists but not a readable dir → refuse
  }
}

/** Resolve the required target directory from the command path (`create <dir>`). */
export function resolveTargetDir(command: string[], cwd: string): string {
  const arg = command[1];
  if (!arg || arg.startsWith('-')) {
    throw new CliError('Usage: simpler create <target-dir> [--repo <url>] [--branch <ref>]', 2, 'usage_error');
  }
  return resolvePath(cwd, arg);
}

/** Shallow-clone args — no history (`--depth 1`), optional branch. */
export function buildCloneArgs(repo: string, branch: string | undefined, dir: string): string[] {
  const args = ['clone', '--depth', '1'];
  if (branch) args.push('--branch', branch);
  args.push(repo, dir);
  return args;
}

// ─── report shape ──────────────────────────────────────────────────────────

export interface CreateStep {
  name: string;
  ok: boolean;
  detail: string;
}

export interface CreateReport {
  success: boolean;
  dir: string;
  dryRun: boolean;
  steps: CreateStep[];
  nextSteps: string[];
}

// ─── impure orchestration ──────────────────────────────────────────────────

interface CreateFlags {
  repo?: string;
  branch?: string;
  noInstall?: boolean;
  noSetup?: boolean;
}

interface CreateOpts {
  command: string[];
  cwd: string;
  yes: boolean;
  dryRun: boolean;
  flags: CreateFlags;
}

function log(msg: string): void {
  process.stderr.write(msg + '\n');
}

function has(cmd: string): boolean {
  if (process.platform === 'win32') return spawnSync('where', [cmd], { stdio: 'ignore' }).status === 0;
  return spawnSync('command', ['-v', cmd], { stdio: 'ignore', shell: true }).status === 0;
}

function run(cmd: string, args: string[], cwd?: string): boolean {
  log(`\n→ ${cmd} ${args.join(' ')}`);
  return spawnSync(cmd, args, { cwd, stdio: 'inherit' }).status === 0;
}

export async function runCreate(opts: CreateOpts): Promise<CreateReport> {
  const steps: CreateStep[] = [];
  const nextSteps: string[] = [];
  const add = (name: string, ok: boolean, detail: string) => {
    steps.push({ name, ok, detail });
    log(`${ok ? '✓' : '✗'} ${name}: ${detail}`);
  };

  const dir = resolveTargetDir(opts.command, opts.cwd);
  const repo = opts.flags.repo || DEFAULT_REPO;
  const state = targetDirState(dir);
  if (state === 'nonempty') {
    throw new CliError(`Target directory is not empty: ${dir}. Pick a new path.`, 2, 'usage_error');
  }
  if (!has('git')) {
    throw new CliError('git is required to clone the repo — install it first.', 2, 'usage_error');
  }

  log(`\nCreate a SimplerDevelopment dev environment\n  repo: ${repo}\n  into: ${dir}\n`);

  if (opts.dryRun) {
    add('clone (dry-run)', true, `git ${buildCloneArgs(repo, opts.flags.branch, dir).join(' ')}`);
    add('install (dry-run)', true, opts.flags.noInstall ? 'skipped (--no-install)' : 'bun install');
    add('setup (dry-run)', true, opts.flags.noSetup ? 'skipped (--no-setup)' : 'bun run setup');
    return finalize(steps, nextSteps, dir, true);
  }

  // 1. Clone.
  const cloned = run('git', buildCloneArgs(repo, opts.flags.branch, dir));
  add('clone', cloned, cloned ? dir : 'git clone failed — see output above');
  if (!cloned) return finalize(steps, nextSteps, dir, false);

  // 2. Install.
  if (!opts.flags.noInstall) {
    if (!has('bun')) {
      add('install', false, 'bun not found — install from https://bun.sh, then run `bun install` in the new dir');
    } else {
      const ok = run('bun', ['install'], dir);
      add('install', ok, ok ? 'dependencies installed' : 'bun install failed — see output above');
    }
  }

  // 3. Hand off to the in-repo setup wizard.
  if (!opts.flags.noSetup && has('bun')) {
    const setupArgs = ['run', 'setup', ...(opts.yes ? ['--yes'] : [])];
    const ok = run('bun', setupArgs, dir);
    add('setup', ok, ok ? 'configured via `simpler setup`' : 'setup did not complete — run `bun run setup` in the new dir');
  } else if (opts.flags.noSetup) {
    nextSteps.push(`cd ${basename(dir)} && bun run setup`);
  }

  nextSteps.push(`cd ${basename(dir)}  →  app at http://localhost:3000`);
  return finalize(steps, nextSteps, dir, false);
}

function finalize(steps: CreateStep[], nextSteps: string[], dir: string, dryRun: boolean): CreateReport {
  const report: CreateReport = { success: steps.every((s) => s.ok), dir, dryRun, steps, nextSteps };
  if (nextSteps.length > 0) {
    log('\nNext:');
    for (const n of nextSteps) log(`  • ${n}`);
  }
  return report;
}
