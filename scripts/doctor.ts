// Session-start environment doctor — surfaces drift BEFORE it burns a gate run.
// Warn-only by design: it never blocks anything, it makes state visible.
// Wired as a SessionStart hook in .claude/settings.json; run by hand: bun run doctor.
//
// Checks (all local, hard 5s budget):
//   1. DATABASE_URL host — remote (non-localhost) is the #1 recurring footgun
//   2. NEXTAUTH_URL port coherence (expected 3000)
//   3. docker compose db/app container state (skipped fast if docker absent),
//      plus port-55432 occupancy and DATABASE_URL staleness (JUL9-013)
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
//
// db's HOST-published port is 55432, not the Postgres default 5432 (JUL9-013)
// — moved there so it can never collide with a locally-installed Postgres
// (Homebrew, Postgres.app, ...), which conventionally claims 5432 and used to
// silently steal dev traffic from the docker db (a specific loopback bind beats
// docker-proxy's wildcard listener on macOS, so localhost:5432 resolved to
// whichever one bound most recently, with no error — just the wrong database).
// Inside the compose network the container is still reachable at db:5432; only
// the host-side mapping moved.
const COMPOSE_DB_HOST_PORT = 55432;
try {
  const ps = execSync('docker ps --format "{{.Names}} {{.Status}}" 2>/dev/null', {
    timeout: 3000,
    encoding: 'utf-8',
  });
  const up = (name: string) => ps.split('\n').some((l) => l.startsWith(name) && l.includes('Up'));
  if (!up('simplerdev-db')) {
    warnings.push('docker: simplerdev-db is not running (docker compose up -d db).');
    // If something else already holds the port compose wants to publish on,
    // `docker compose up -d db` fails to bind — surface what's squatting it
    // instead of leaving the developer to guess why the container won't start.
    try {
      const listeners = execSync(`lsof -nP -iTCP:${COMPOSE_DB_HOST_PORT} -sTCP:LISTEN 2>/dev/null`, {
        timeout: 2000,
        encoding: 'utf-8',
      }).trim();
      if (listeners) {
        warnings.push(
          `port ${COMPOSE_DB_HOST_PORT} is already in use by another process — that's the port docker-compose.yml publishes the dev db on, so it won't be able to bind:\n${listeners}`,
        );
      }
    } catch {
      /* lsof missing, or nothing listening on it — nothing more to report */
    }
  }
  const appUp = up('simplerdev-app');
  if (appUp) {
    // informational: hybrid host-dev (scripts/dev-hybrid.sh) is the faster dev loop on macOS
    console.log('ℹ docker app container is running — scripts/dev-hybrid.sh is the faster dev loop on macOS.');
  }
} catch {
  /* docker not installed or daemon down — nothing to report */
}

// 3b. Stale DATABASE_URL — still pointing at the pre-JUL9-013 docker port.
// This doesn't error: port 5432 usually answers with SOMETHING (a Homebrew/
// Postgres.app install, or the tenancy suite's throwaway DB from
// start-local-db.sh) — it just silently connects to the wrong database, which
// is exactly the bug this ticket exists to stop from recurring in a new shape.
if (dbUrl) {
  try {
    const u = new URL(dbUrl);
    const port = u.port || '5432';
    if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && port === '5432') {
      warnings.push(
        `DATABASE_URL uses port 5432 — docker-compose.yml publishes the dev db on ${COMPOSE_DB_HOST_PORT} now (JUL9-013). ` +
          `If you're pointing at the docker db, this is stale — update .env.local to localhost:${COMPOSE_DB_HOST_PORT} ` +
          `(ignore this if you're intentionally running a standalone, non-docker Postgres on 5432 instead).`,
      );
    }
  } catch {
    /* already warned about an unparseable DATABASE_URL above */
  }
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
