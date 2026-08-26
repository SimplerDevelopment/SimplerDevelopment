# Getting started

This is the long-form setup guide. If you just want the one-liner, it's in the
[README](../README.md#getting-started); come here when you want to know what that
command actually does, run the steps by hand, or you hit a snag.

By the end you'll have the full stack running locally: the Next.js app, a
Postgres database with `pgvector`, the realtime server, the Mastra agents
service, and a local mail catcher.

---

## What you need

- **Docker** — the fastest path; it brings its own Postgres, so you don't have to
  install one. Everything below assumes Docker unless a step says otherwise.
- **Bun 1.3.11+** — the package manager. The lock file is `bun.lock`; use `bun`,
  never `npm`.
- If you'd rather **not** use Docker: Node.js 20+ (for the scripts that run under
  `tsx`) and **PostgreSQL 14+ with the [`pgvector`](https://github.com/pgvector/pgvector)
  extension**. The Company Brain won't boot without pgvector.

> **Zero-install option:** open the repo in
> [GitHub Codespaces](https://codespaces.new/SimplerDevelopment/SimplerDevelopment)
> or any [Dev Container](https://containers.dev)-aware editor and Postgres + Bun
> come up automatically. See [`.devcontainer/README.md`](../.devcontainer/README.md).

---

## The one command

From nothing — no clone, no install — the front door does it all:

```bash
npm i -g @simplerdevelopment/cli
simpler create my-awesome-agency-platform
```

The `simpler` binary ships in the **`@simplerdevelopment/cli`** package. Install
the scoped name: the npm package called plain `simpler` is an unrelated project.

It clones the monorepo into `my-awesome-agency-platform/`, installs dependencies,
and hands off to the setup wizard. When it's done, `cd` in and start the dev
server:

```bash
cd my-awesome-agency-platform
bun dev
```

The portal is at [http://localhost:3000](http://localhost:3000).

---

## Already cloned? Run the wizard

If you cloned the repo yourself, run the setup wizard directly. It does
everything the manual steps below do — scaffolds `.env.local`, generates every
secret, picks Docker vs. your own Postgres, migrates, and seeds:

```bash
bun install
bun run setup
```

Useful flags:

| Flag | What it does |
|---|---|
| `--docker` / `--local` | Force a path (default: Docker if the daemon is running) |
| `--check` | Validate an existing setup without changing anything |
| `--yes` | Non-interactive (for CI) — take the defaults |
| `--dry-run` | Print the plan and write nothing |

The wizard is safe to re-run: it never clobbers real values in an existing
`.env.local` (it backs the file up to `.env.local.bak` and only fills in blanks),
and it leaves optional integrations dormant until you configure them.

---

## Or do it by hand

Prefer to see every step? Here's what the wizard automates.

### 1. Configure the environment

```bash
cp .env.example .env.local
```

Generate the required secrets and paste them into `.env.local`:

```bash
openssl rand -hex 32      # AUTH_SECRET / NEXTAUTH_SECRET / OAUTH_STATE_SECRET
openssl rand -hex 32      # WORKSPACE_TENANT_SECRETS_KEY
openssl rand -hex 32      # ENCRYPTION_KEY
openssl rand -base64 32   # PORTAL_KMS_KEY
```

### 2. Start the stack

```bash
docker compose up -d
```

This brings up the app, Postgres/pgvector, the realtime server, the agents
service, and [Mailpit](https://mailpit.axllent.org/) (a local mail catcher). The
Docker app service wires `DATABASE_URL`, the realtime and agents URLs,
`EMAIL_TRANSPORT=mailpit`, and `MAILPIT_SMTP_HOST=mailpit` inside the Compose
network for you.

> **First boot is slow — that's expected.** The app container runs a full
> `bun install` plus database migrations before it starts (10–20 minutes on a
> cold cache; macOS bind mounts are the slow case). Watch it with
> `docker compose logs -f app`. Later boots reuse the `node_modules` volume and
> start in seconds.

### 3. Seed some dev data (optional)

Once the app has finished its boot-time migrations:

```bash
docker compose exec app bun run db:seed:dev
```

The app runs at [http://localhost:3000](http://localhost:3000); Mailpit's inbox
is at [http://localhost:8025](http://localhost:8025).

### Running without Docker

Point `DATABASE_URL` at any Postgres that has `pgvector` available, then enable
the extensions once before migrating:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

Then `bun install`, set `EMAIL_TRANSPORT=mailpit` if you're using a local SMTP
catcher, and migrate. You can reset the Docker DB anytime with
`docker compose down -v`.

---

## The minimum to boot

Most variables in `.env.example` gate **optional** integrations (Stripe, Google
Workspace, S3, Resend, Zoom, …). The app boots without them — those features just
stay dormant until you configure them. The minimum to start:

| Variable | Purpose | Generate |
|---|---|---|
| `DATABASE_URL` | Postgres (with pgvector) connection string | — |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | NextAuth session secret | `openssl rand -hex 32` |
| `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` | Base URL, e.g. `http://localhost:3000` | — |
| `WORKSPACE_TENANT_SECRETS_KEY` | 32-byte hex — encrypts per-tenant BYOK secrets | `openssl rand -hex 32` |
| `PORTAL_KMS_KEY` | Base64 key for plugin JWT signing | `openssl rand -base64 32` |
| `OAUTH_STATE_SECRET` | OAuth state signing | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | 64 hex chars — encrypts stored integration API keys (the integrations route 500s without it) | `openssl rand -hex 32` |

Add integration keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`,
…) as you turn each feature on. **`.env.example` is the canonical annotated
reference** — every optional block documents where to create the credential,
which callback/webhook URLs to register, and the expected format.

---

## Faster local dev on macOS

`bun dev` inside the app container pays bind-mount (VirtioFS) latency on every
source read. `scripts/dev-hybrid.sh` is the faster loop: it keeps
db/mailpit/realtime in Docker, stops the app + agents containers, and runs the
app natively on the host — instant HMR, same stack. Return to full-Docker with
`docker compose up -d app agents`.

---

## Everyday commands

```bash
bun dev            # Next.js dev server at http://localhost:3000
bun run lint       # ESLint
bun run typecheck  # tsc --noEmit — run after any non-trivial edit batch
bun test           # unit tests
```

Database work:

```bash
bun run db:generate   # after editing lib/db/schema/ — generates migration SQL
bun run db:migrate    # apply pending migrations (refuses prod DATABASE_URLs)
bun run db:studio     # interactive schema browser
```

Never hand-edit `drizzle/*.sql` — it's generated. See
[`lib/db/CLAUDE.md`](../lib/db/CLAUDE.md) for tenancy invariants and footguns, and
the [Dev & Testing guide](../tests/TESTING_PLAN.md) for the full test story.

---

## Troubleshooting

- **Port 3000 or 55432 already taken?** (The db service publishes on 55432, not
  the Postgres default 5432, specifically so it doesn't collide with a
  locally-installed Postgres — see JUL9-013.) Add a `docker-compose.override.yml`
  that remaps the host side.
- **App won't come up on first boot?** It's probably still installing/migrating —
  `docker compose logs -f app`. Give a cold cache 10–20 minutes.
- **Integrations route returns 500?** `ENCRYPTION_KEY` is missing or not 64 hex
  chars.
- **Brain features error on startup?** Your Postgres is missing `pgvector` — see
  the extension SQL above.
- **Uploads 500 with `getaddrinfo ENOTFOUND minio`?** `S3_ENDPOINT` in
  `.env.local` is `http://minio:9000` — a Docker-internal hostname that only
  resolves *inside* the compose network. Running the app on the host with bare
  `bun dev` cannot see it. Either run the app in Docker, or point the endpoint at
  the published port:

  ```bash
  docker compose up -d minio          # it is not started by default
  # then, for a host-side run:
  S3_ENDPOINT=http://localhost:9000 bun dev
  ```

  Note that the `scripts/catalog/*` tools call `dotenv.config({ override: true })`,
  so `.env.local` **wins over your shell environment** — exporting `S3_ENDPOINT`
  in front of those scripts does nothing. Edit the file for the duration of the
  run, or run them inside the container.
- **Code changes don't show up in the browser, and a rebuild makes it *worse*?**
  Check for a stale **service worker** on `localhost:3000` — DevTools →
  Application → Service workers. This app registers none, so anything there came
  from a different project that previously used port 3000, and it will keep
  serving its own cached JS chunks for this origin.

  It is a nasty one to diagnose because everything else looks correct: the source
  on disk is right, the container sees the right bytes, `tsc` passes, and `curl`
  against the dev server returns the *correct* chunk — only the browser is wrong.
  Hot reload keeps working (HMR uses a websocket, which bypasses the worker), so
  edits appear live and then vanish on the next reload. `fetch(url, { cache:
  'no-store' })` does **not** bypass a service worker, so cache-busting a request
  proves nothing.

  Fix it from the console on that origin:

  ```js
  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  for (const k of await caches.keys()) await caches.delete(k);
  // then reload
  ```

  **There is a second, simpler flavour of the same trap without any service
  worker.** Turbopack reuses *stable* chunk filenames in dev, so after an edit
  the browser can keep serving its cached copy of `_<hash>._.js` even though the
  server is returning new bytes for that exact URL. Symptoms are identical —
  disk is right, `curl` is right, browser is wrong — and it survives `rm -rf
  .next` and dev-server restarts, because the staleness is client-side. A normal
  reload does not fix it; `fetch(url, { cache: 'reload' })` did not either.
  **Hard-reload the tab (⌘⇧R / Ctrl-Shift-R).** Confirm which side is stale
  before you go debugging your own logic:

  ```bash
  curl -s http://localhost:3000/_next/static/chunks/<chunk>.js | grep -c mySymbol
  ```

Still stuck? Open a [discussion or issue](https://github.com/SimplerDevelopment/SimplerDevelopment/issues).
