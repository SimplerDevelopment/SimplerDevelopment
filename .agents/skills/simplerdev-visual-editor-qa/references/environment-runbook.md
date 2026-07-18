# Environment runbook — local QA against a disposable metro copy

Goal: a working local app that renders the client's real site + editor, seeded with every block type, **never touching staging/prod**. Proven 2026-07-02. Current live values (post id, creds, site id) are in `.sd/qa-rubric-learnings.md` → "Working local QA environment" — read that for the session's actuals; this file is the durable how.

## The DB target trap (read first)

Two `DATABASE_URL`s exist. The **app** (`bun dev`, Next) loads `.env.local` with priority; your **shell `psql`/`tsx`** loads `.env` unless you pass the URL explicitly. They point at *different* databases:

- `.env` → `switchyard.proxy.rlwy.net` = **staging/dev** — often schema-drifted. Do NOT QA against it.
- `.env.local` → `postgresql://postgres@localhost:5544/railway` = **local metro/prod copy** (PG18, trust auth, no password). This is what the app reads and what you must target.

So **always pass the local URL explicitly** to psql/tsx: `DATABASE_URL=postgresql://postgres@localhost:5544/railway ...`. A seed that "vanishes" (app 404s) almost always means you wrote to switchyard by mistake.

If `.env.local` is absent, the local copy hasn't been made — a metro/prod dump into a local PG18 cluster on 5544 must be created first (the user maintains this; ask for "the local metro copy"). The dump is a copy of already-migrated prod, so schema is current; `bun run db:migrate` may error on the manual `9xxx` migrations (drizzle-kit journal quirk) but that's cosmetic if render works.

## Steps

1. **Boot the app:** `bun dev` (background) → http://localhost:3000 (default port).
2. **Pick the target site** on the local copy:
   `psql "$LOCAL" -c "SELECT id, client_id, subdomain, domain, public_access FROM client_websites WHERE public_access AND active ORDER BY id;"`
   Use the client's real site (e.g. **241 = simplerdevelopment.com, client 104**).
3. **Seed the scratch post** — this skill's `scripts/seed-scratch-post.ts` (raw SQL, idempotent, one of each block type). It reads `WEBSITE_ID` and `SLUG` from env:
   `WEBSITE_ID=<siteId> DATABASE_URL=$LOCAL npx tsx .agents/skills/simplerdev-visual-editor-qa/scripts/seed-scratch-post.ts` → prints the post id.
   Raw SQL (not Drizzle) on purpose: a drifted copy can miss a column and Drizzle's all-column insert would fail; list only real columns.
4. **Confirm public render:** `curl -sL -o /dev/null -w "%{http_code}\n" http://localhost:3000/sites/<domain>/<slug>` → expect 200. A clean 404 = wrong DB target or wrong domain form (the resolver matches `client_websites.domain` exactly, or `<subdomain>.simplerdevelopment.com`, or `vercel_domain`).
5. **Editor auth** (editor route needs a portal user for that site's client):
   - Find the client's user: `SELECT u.id,u.email FROM users u JOIN clients c ON c.user_id=u.id WHERE c.id=<clientId>;`
   - Set a known bcrypt password on the disposable copy:
     `HASH=$(bun -e "import b from 'bcryptjs'; console.log(b.hashSync('veqa-local-123',10))")` then `UPDATE users SET password='$HASH' WHERE id=<userId>;`
   - Log in: GET `/api/auth/csrf` → POST `/api/auth/callback/credentials` (form: email, password, csrfToken, json=true), keep the cookie jar. Verify `/api/auth/session` shows the client user.
   - Confirm editor: `curl -b jar http://localhost:3000/portal/websites/<siteId>/posts/<postId>/edit` → 200 + the post title present.
6. **Draft/preview render** (for unpublished states): self-mint a token — `generatePreviewToken(siteId[, scope])` from `lib/preview-token.ts` (HMAC of siteId+day, signed with local `AUTH_SECRET`). URL: `/sites/<domain>/<slug>?_preview=true&_token=<hex>`. `scope` = page path minus leading slash for a page-scoped token; omit for site-wide. A published page on a public site needs no token at all.

## Playwright capture harness

Use `scripts/qa-capture.mjs` (this skill). Hard-won facts:

- **Run it with `node`, NOT `bun`.** `node <script>` from the repo root resolves the repo's `@playwright/test`. Bun crashes inside playwright-core's set-cookie parser (`"/api/auth/csrf" cannot be parsed as a URL`) when using `context.request` — a bun+playwright incompatibility. Node is fine.
- **Auth without UI selectors:** `ctx.request.get('/api/auth/csrf')` → `ctx.request.post('/api/auth/callback/credentials', {form})`; cookies land in the context and are shared with pages. Verify `/api/auth/session` shows the client user before navigating.
- **Editor is heavy** — after `goto(editor)` with `waitUntil:'domcontentloaded'`, wait ~9s before screenshotting. Some `503`s / a hydration warning in the console are benign.
- **Selecting a block:** click its label in the left **Layers** tree (`page.getByText('<type>', {exact:true}).first().click()`); the right properties panel then renders that block's editor.
- **Viewport toggles** (G3) are aria-labelled exactly **`Desktop` / `Tablet` / `Mobile`** in the top toolbar — `page.getByRole('button',{name:/tablet/i}).click()`.
- **Enumerate controls** with an in-page `evaluate` collecting `aria-label`/`title`/text of buttons — cheap way to find the right selector for a new card's control.
- **Theme (G4):** the editor *chrome* has no light/dark toggle. G4 governs **rendered content**, so verify it on the published page (`/sites/<domain>/<slug>`, self-mint token for drafts), not the editor UI. For pure editor-control cards (e.g. a panel button), G4 is N/A.
- **Video:** `newContext({recordVideo:{dir}})`; the webm flushes on `ctx.close()`. That IS the G5 evidence — make sure the recorded session performs the card's actual interaction (e.g. click delete, not just hover).

Local `bun dev` renders the published page through the same `app/sites/[domain]/[[...slug]]` production code path, so verifying locally genuinely satisfies G2 (same renderer that catches editor-vs-prod divergence).

### Testing "default value" cards — DON'T use the raw seed

Cards of the form "default X is now Y" (e.g. VEQA-036 default max-width 250px, VEQA-037 default alignment center, VEQA-050 default gallery images, VEQA-071 default flip-card fields) apply their default at **block-creation time in the editor**, not as a render-time fallback. The raw-SQL seeder inserts a block *without* those props, so it renders the legacy fallback (e.g. no cap, left-aligned) — testing it against the rendered scratch block gives a **false FAIL**. To verify a default-value card, **add the block through the editor** (`Add Block` → pick type) with Playwright and inspect the newly-created block's props/render — that's the path that exercises the creation default. `qa-render-check.mjs` is only valid for cards that change how an *existing* block renders (e.g. VEQA-022 overflow, VEQA-031 columns bg, VEQA-044 decoration color when the prop is set).

## Cleanup

Disposable copy, but keep it tidy: delete the scratch post row (`DELETE FROM posts WHERE slug='veqa-scratch';` against `$LOCAL`). The seeder lives with the skill (`scripts/seed-scratch-post.ts`) — keep it, it's the reusable asset. Reverting the local test password is optional. (A stray copy at repo-root `scripts/seed-scratch-post.ts` from the first session can be deleted.)
