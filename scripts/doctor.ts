// Session-start environment doctor — surfaces drift BEFORE it burns a gate run.
// Warn-only by design: it never blocks anything, it makes state visible.
// Wired as a SessionStart hook in .claude/settings.json; run by hand: bun run doctor.
//
// Checks (all local, hard 5s budget):
//   1. DATABASE_URL host — remote (non-localhost) is the #1 recurring footgun
//   2. NEXTAUTH_URL port coherence (expected 3000)
//   3. docker compose db/app container state (skipped fast if docker absent)
//   4. agent-worktree count vs the fan-out cap (3)

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const warnings: string[] = [];

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

// .env.local overrides .env (matches the app's local-dev invariant).
const env = { ...parseEnvFile(join(ROOT, '.env')), ...parseEnvFile(join(ROOT, '.env.local')) };

// 1. DATABASE_URL host
const dbUrl = env.DATABASE_URL ?? '';
if (dbUrl) {
  try {
    const host = new URL(dbUrl).hostname;
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== 'db') {
      warnings.push(
        `DATABASE_URL points at a REMOTE host (${host}) — psql/migrations/tests here touch that DB, not local. ` +
          `Tests are shielded (run-tenancy.sh / test:*:local self-provision), but hand-run commands are not.`,
      );
    }
  } catch {
    warnings.push('DATABASE_URL is set but not a parseable URL.');
  }
} else {
  warnings.push('DATABASE_URL is unset (no .env/.env.local value) — db-backed commands will fail.');
}

// 2. Port coherence
const nextauthUrl = env.NEXTAUTH_URL ?? '';
if (nextauthUrl && !/localhost:3000|127\.0\.0\.1:3000/.test(nextauthUrl) && nextauthUrl.includes('localhost')) {
  warnings.push(`NEXTAUTH_URL is ${nextauthUrl} — app + tests expect port 3000; auth callbacks will land on the wrong port.`);
}

// 2b. Stripe webhook wiring — with a secret key but no webhook secret, module
// activation relies solely on the verify-on-return path (OBQA-014); renewals,
// cancellations, and dunning events silently never arrive.
if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) {
  warnings.push(
    'STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is not — webhook events will 500. ' +
      'Run `stripe listen --forward-to localhost:3000/api/stripe/webhook` and copy its whsec_ into .env.local.',
  );
}

// 3. Docker containers (fast; skip quietly when docker is absent/slow)
try {
  const ps = execSync('docker ps --format "{{.Names}} {{.Status}}" 2>/dev/null', {
    timeout: 3000,
    encoding: 'utf-8',
  });
  const up = (name: string) => ps.split('\n').some((l) => l.startsWith(name) && l.includes('Up'));
  if (!up('simplerdev-db')) warnings.push('docker: simplerdev-db is not running (docker compose up -d db).');
  // Homebrew PG (tenancy test DB) and docker db both claim 5432 — the host's
  // localhost then resolves to the WRONG postgres (::1 → homebrew, 0.0.0.0 →
  // docker), so hand-run psql/scripts silently hit the other database.
  if (up('simplerdev-db')) {
    try {
      execSync('/usr/local/opt/postgresql@17/bin/pg_isready -q -h localhost -p 5432 -U ' + process.env.USER, {
        timeout: 2000,
      });
      const dbs = execSync(
        `/usr/local/opt/postgresql@17/bin/psql "postgresql://${process.env.USER}@localhost:5432/postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='simplerdev'" 2>/dev/null`,
        { timeout: 2000, encoding: 'utf-8' },
      ).trim();
      if (dbs !== '1') {
        warnings.push(
          'PORT COLLISION: Homebrew Postgres and docker simplerdev-db both listen on 5432 — host-side psql/scripts may hit the wrong DB. Stop one, or use `docker exec simplerdev-db psql -U postgres -d simplerdev` for the docker DB.',
        );
      }
    } catch {
      /* homebrew PG not running → no collision */
    }
  }
  const appUp = up('simplerdev-app');
  if (appUp) {
    // informational: hybrid host-dev (scripts/dev-hybrid.sh) is the faster loop on macOS
    console.log('ℹ docker app container is running — scripts/dev-hybrid.sh is the faster dev loop on macOS.');
  }
} catch {
  /* docker not installed or daemon down — nothing to report */
}

// 4. Fan-out cap (agent worktrees)
try {
  const wt = execSync('git worktree list --porcelain 2>/dev/null', { timeout: 2000, encoding: 'utf-8' });
  const agentCount = (wt.match(/worktrees\/agent-/g) ?? []).length;
  if (agentCount > 3) {
    warnings.push(`${agentCount} agent worktrees active — fan-out cap is 3; merge or prune before dispatching more (see CLAUDE.md).`);
  }
} catch {
  /* not a git repo — ignore */
}

if (warnings.length === 0) {
  console.log('doctor: environment coherent — local DB, port 3000, fan-out within cap.');
} else {
  for (const w of warnings) console.log(`⚠ doctor: ${w}`);
}
