# AUTH79-020 — Role/action enforcement on membership-only routes (DESIGN)

**Status:** proposal for review — no code changed yet. **Owner decision needed** on the role model (§4).
**Finding:** ~330+ `app/api/portal/**` routes authenticate with raw `auth()` + `getPortalClient`/`resolveClientSite` — a **membership check only**. They confirm the user belongs to the client but apply **no role/action gate**, so a `viewer`- or `member`-role team member can hit `write`/`admin` routes (CRM, projects, cards, site content, branding, chat, …). Distinct from AUTH79-011: these are **session-only** (OAuth tokens 401), so it's an in-session privilege-escalation issue, not an OAuth-scope one.

> **Not** the brain routes — `brain/**` (107) go through `requireBrainEntitlement` → `authorizePortal({action})`, so they're already role-gated.

## 1. The building blocks already exist

- `authorizePortal({ action })` — resolves client (session or bearer) + gates role via `ROLE_LEVELS`/`ACTION_REQUIRED_LEVEL` (read=viewer+, write=member+, admin=admin+, owner=owner). Client-scoped.
- `getPortalRole(userId, clientId)` → `owner|admin|member|viewer|null` (owner for legacy direct-owned rows). The lightweight role lookup.
- `resolveClientSite(userId, siteId)` / `resolvePortalSite(userId, siteId)` — resolve a `[siteId]`-scoped site with ownership, but **no role check**.

So the fix reuses existing primitives — it's a *wiring* problem, not new authz machinery.

## 2. Two route shapes → two moves

- **Client-scoped routes** (crm, projects, cards, chat, branding at top level; `getPortalClient(userId)`): swap `auth()+getPortalClient` → **`authorizePortal({ action })`**. Same client resolution, now role-gated (and OAuth-scope-gated for free). Mechanical.
- **Site-scoped routes** (`websites/[siteId]/**`, `cms/websites/[siteId]/**`; `resolveClientSite`): keep the site-ownership resolution and **add a role check**. Propose a new sibling helper:

```ts
// authorizePortalSite: site-ownership (existing) + role gate (new)
export async function authorizePortalSite(opts: { siteId: number; action?: PortalAction }) {
  const session = await auth();                       // these routes are session-only
  if (!session?.user?.id) return { response: 401 };
  const userId = parseInt(session.user.id, 10);
  const site = await resolveClientSite(userId, opts.siteId);   // ownership
  if (!site) return { response: 404 };
  const role = await getPortalRole(userId, site.clientId);
  if (ROLE_LEVELS[role] < ACTION_REQUIRED_LEVEL[opts.action ?? 'read']) return { response: 403 };
  return { site, userId, role };
}
```

## 3. Role → action default model
Reuse `authorizePortal`'s existing levels. Default mapping when annotating each route:
- **GET / read** → `read` (viewer+)
- **POST/PUT/PATCH/DELETE mutations** → `write` (member+)
- **Team / billing / integrations / destructive-settings / publish** → `admin` (admin+)
- **Delete-client / transfer-ownership** → `owner`

## 4. Decision needed — the role model
This is the crux and only you can set it, because it changes what real team members can do:
- Should a **`member`** be able to write CRM records, edit site content, manage cards/projects? (Default above says yes — member+ for all mutations.)
- Which areas are **admin-only** writes (team, billing, integrations, brand identity, publishing to live)?
- Is **`viewer`** strictly read-only everywhere? (Default: yes.)
A short matrix — {viewer, member, admin, owner} × {area} → allowed actions — drives the per-route `action` annotations. **Resolved:** the owner-approved model ("members write content, admins own settings") is written out as the per-route annotation reference in **`docs/design/auth79-020-role-matrix.md`** — use that when converting each route.

## 5. Rollout — LOG-ONLY first (mandatory here)
Unlike AUTH79-011 (only OAuth tokens), this affects **real session users**. A wrong role model locks out legitimate members. So enforce behind a flag with a log-only phase:
- `AUTH_ROLE_ENFORCE` unset → compute the role decision, `console.warn('portal.role.insufficient', …)` on would-be denials, **allow**. Observe real multi-member traffic.
- `AUTH_ROLE_ENFORCE=1` → actually 403.
Roll out per area, watch the log for false-denials, adjust the matrix, then enforce.

## 6. Sweep plan (phased, not big-bang)

330 ungated route files; **249 (75%) define a mutating method** (the `check-portal-authz.ts` lint currently reports **231** after exclusions). Priority surface by file count + mutation density:

| Phase | Area | Files | Mutating | Shape |
|---|---|---|---|---|
| 1 | `crm/**` | 48 | 39 | client-scoped (`getPortalClient`) → `authorizePortal` |
| 2 | `websites/[siteId]/**` | 56 | 48 | site-scoped → `authorizePortalSite` |
| 3 | `cms/websites/[siteId]/**` | 32 | 30 | site-scoped → `authorizePortalSite` |
| 4 | `cards/**`, `projects/**`, `sprints/**` | 44 | 34 | client-scoped |
| 5 | `branding/**`, `chat/**`, `tools/**`, `agency/**`, `settings/**`, webhooks, misc | ~90 | ~58 | mixed |

Per area: annotate `action` (GET→read, mutations→write, team/billing/integrations/branding/publish→admin), land in **log-only** (`observeRole: true`), typecheck, verify in CI/preview, move on. **241/330 are plain client-scoped** (wholesale `authorizePortal` swap); **89 are site-scoped** (`[siteId]`) — use `authorizePortalSite`, which resolves role against the *owning* client (handles cross-client deep-links via `resolvePortalSite`).

**Quick wins (behavior-preserving consolidations, no new gate):** `agency/branding`, `agency/white-label`, `agency/custom-domain(/verify)` already hand-roll `if (role !== 'owner' && role !== 'admin') 403` — swap to `authorizePortal({ action: 'admin' })`. Same for the inline owner-checks in `settings/team/**`.

## 7. Exclude list (public / identity-level / gated elsewhere — do NOT gate)

Encoded in `scripts/check-portal-authz.ts`:
- **Public / pre-session:** `sign-out`, `forgot-password`, `reset-password`, `change-password`, `invite/accept`, `cards/[id]/unsubscribe` (HMAC), `auth/mobile-sign-in`.
- **Identity-level (own user, no client dimension):** `resolve-subdomain`, `my-subdomain`, `switch-client`, `default-website`, `default-portal`, `settings/mfa/**`, `impersonate/**`.
- **OAuth callbacks (signed-state, authorized at `/connect` time):** all `*/callback/*`. **But DO gate the sibling `*/connect` initiation routes** — that's where "can a viewer connect this integration?" is actually decided (candidate for `admin`).
- **Already gated by another mechanism:** `publishing/**` (uses `checkPublishingPermission`).
- **Outbound webhook config CRUD** (`settings/webhooks/**`, `*/webhooks/**`) is NOT excluded — rotating a signing secret is a tenant mutation (`admin`-level).

## 8. CI lint (regression guard)
A `scripts/check-portal-authz.ts` grep asserting every `app/api/portal/**` route file with a POST/PUT/PATCH/DELETE handler calls a role guard (`authorizePortal` / `authorizePortalSite` / `requireBrainEntitlement`) or is on an explicit allowlist (the §7 public routes). Converts "remember to gate" from review discipline into an enforced invariant — same spirit as `.claude/rules/auth-surface.md`.

## 9. Surface to touch (once the matrix is approved)
- `lib/portal-auth.ts` — add `authorizePortalSite` + the `AUTH_ROLE_ENFORCE` log-only wrapper (shared by both helpers).
- ~330 route files — one-line guard swap/addition each, phased by area.
- `scripts/check-portal-authz.ts` + wire into pre-commit/CI.
Net: one helper + a phased mechanical sweep, all behind a log-only flag until the role matrix is validated against real traffic.

## 10. Implementation status (infra shipped)

**Role model chosen (owner-approved):** members write content; admins own team/billing/integrations/branding/publish; viewer read-only; owner for delete-client/transfer. Maps directly onto the existing `ACTION_REQUIRED_LEVEL` (read=viewer+, write=member+, admin=admin+, owner=owner) — **no new matrix code needed**, just correct per-route `action` annotations.

Shipped this pass (enforcement machinery + guard, no route conversions yet):
- ✅ `lib/portal-auth.ts` — shared `roleGate` with **log-only `observeRole`** mode (warn on insufficient role, allow until `AUTH_ROLE_ENFORCE=1`); `authorizePortal` gains `observeRole?`; new **`authorizePortalSite({ siteId, action, observeRole })`** helper (site-ownership via `resolvePortalSite` + role gate against the owning client). Existing `authorizePortal` callers unchanged (hard-enforce, `observeRole` defaults false).
- ✅ `scripts/check-portal-authz.ts` — CI lint, **report-only** (baseline: 231 ungated mutating routes); `--enforce`/`PORTAL_AUTHZ_ENFORCE=1` fails once the sweep is done.
- ✅ `AUTH_ROLE_ENFORCE` documented in `.env.example`.

**Deliberately NOT done this pass:** the 231-route conversion sweep. It's mechanical but each file must preserve its downstream `client`/`site`/`userId` usage, and there's no local DB to runtime-verify — so it belongs in focused per-area passes (Phase 1–5 above), each typecheck- and CI/preview-verified. The lint tracks progress (231 → 0). Start with the §6 quick-win consolidations (behavior-preserving, zero risk).
