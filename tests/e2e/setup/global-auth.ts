import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, chmodSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { request, type FullConfig } from '@playwright/test';
import { loginRequestContext, seededAccounts, type SeededRole } from './auth-session';

function createPrivateDirectory(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  if (process.platform === 'win32') {
    // chmod cannot enforce owner-only access on Windows; restrict the inherited ACL.
    const user = execFileSync('whoami', [], { encoding: 'utf8', windowsHide: true }).trim();
    execFileSync('icacls', [directory, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)F`], {
      stdio: 'pipe', windowsHide: true,
    });
  }
}

export default async function globalAuthSetup(config: FullConfig) {
  const parent = resolve('.qa-reports', 'e2e-auth');
  process.env.TEST_RUN_ID ||= randomUUID();
  const runId = `${process.env.TEST_RUN_ID}-${randomUUID()}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const directory = resolve(parent, runId);
  const cleanup = () => {
    // Limit recursive removal to the verified, randomly named run directory.
    if (dirname(directory) !== parent) throw new Error('Invalid E2E auth cleanup directory');
    rmSync(directory, { recursive: true, force: true });
    delete process.env.E2E_AUTH_RUN_DIR;
  };
  createPrivateDirectory(directory);
  process.env.E2E_AUTH_RUN_DIR = directory;
  try {
    const baseURL = config.projects[0]?.use.baseURL || 'http://localhost:3000';
    for (const role of Object.keys(seededAccounts) as SeededRole[]) {
      const ctx = await request.newContext({ baseURL });
      try {
        const account = seededAccounts[role];
        await loginRequestContext(ctx, account.email, account.password);
        const filename = resolve(directory, `${role}.json`);
        await ctx.storageState({ path: filename });
        chmodSync(filename, 0o600);
      } finally {
        await ctx.dispose();
      }
    }
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
