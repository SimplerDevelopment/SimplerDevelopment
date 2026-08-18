---
type: adr
domain: portal
status: accepted
date: 2026-06-24
sources:
  - components/portal/portal-ui.ts
  - components/portal/PortalPageHeader.tsx
  - components/portal/AuthShell.tsx
  - components/portal/onboarding/ob-styles.ts
  - components/portal/dashboard/WidgetBoard.tsx
  - app/portal/dashboard/page.tsx
  - lib/dashboard/widgets.ts
  - app/portal/PortalLayoutClient.tsx
---

# ADR: Portal UI design system — portal-ui helpers + PortalPageHeader across all portal pages

## Status

Accepted — shipped on branch `feat/portal-redesign-sweep`, 2026-06-24.

## Context

`app/portal/**` had accumulated inconsistent visual patterns across ~80+ pages: ad-hoc Tailwind strings for headings, cards, buttons, and inputs varied page-by-page, making it expensive to re-theme or audit the portal and producing a visually fragmented user experience.

The decision was to adopt a small shared token layer — class-string helpers exported from a single file — as the single source of truth for portal visual identity. Every restyle pass would consume these helpers rather than hard-coding Tailwind strings.

## Decision

**All portal pages adopt the shared design-system helpers below. Restyling a portal page means replacing ad-hoc Tailwind strings with these named helpers; adding net-new visual primitives means extending the helpers file, not hard-coding at the call site.**

### Helper inventory

`components/portal/portal-ui.ts` (42 lines) exports class-string constants:

| Export | Role |
|---|---|
| `pEyebrow` | Small uppercase label above a page or section title |
| `pTitle` | Primary page heading |
| `pSectionTitle` | Section-level heading within a page |
| `pSubtext` | Muted supporting copy |
| `pBtnPrimary` | Black CTA button (high-contrast primary action) |
| `pBtnGhost` | Outline/ghost button |
| `pBtnSoft` | Muted soft-fill button |
| `pCard` | Rounded-2xl bg-card surface |
| `pCardPad` | Padding applied inside a `pCard` |
| `pInput` | Text input styling |
| `pSelect` | Select element styling |
| `pChip` | Small pill/chip label |

`components/portal/PortalPageHeader.tsx` (53 lines) is the standard page-level header component accepting `eyebrow`, `title`, `subtitle`, and `actions` props. Every portal page that has a title/header area uses this component.

### Auth and onboarding variants

`components/portal/AuthShell.tsx` (106 lines) provides a full-bleed split-screen shell for pre-auth pages (login, reset-password, invite). It exports parallel auth-scoped helpers: `authInput`, `authPrimaryBtn`, `AuthField`, etc. These mirror the portal token naming convention but target the split-screen layout. Do not use `AuthShell` inside the main portal chrome — it is for pre-auth pages only.

`components/portal/onboarding/ob-styles.ts` (55 lines) provides a parallel token set for the onboarding wizard. The wizard was already modern before this sweep; `ob-styles.ts` was not changed, but follows the same pattern.

### Styling convention for semantic state colors

Semantic status colors (error, warning, success, info — typically `text-destructive`, `text-amber-*`, `text-green-*`, Tailwind semantic classes) are **not** routed through the portal-ui helpers. They are applied directly. The helpers govern layout and brand identity, not data-driven state feedback.

### Coverage

Every page across the following portal areas was restyled in this sweep:

- Settings (all sub-pages: profile, team, billing, plans, AI, API keys, webhooks, integrations, notifications, support)
- Email and campaigns
- CRM (list views + contact/company detail)
- Company Brain (list + detail + new/edit forms + god-files)
- Websites + Store (including the god-files: store/settings, store/products/[id], websites/branding)
- Bookings and services
- Automations and projects
- Agency, media, hosting, invoices, tickets, surveys
- Inbox, pitch-decks, approvals
- Legacy auth pages (reset-password, invite) via `AuthShell`

### Deliberate exclusions (do not re-flag these)

| Page / area | Reason |
|---|---|
| `app/portal/mobile-auth/page.tsx` | Intentional Expo native-webview deep-link bridge. Inline styles are correct for this context. `AuthShell` split-screen would break the native-side integration. |
| `components/portal/visual-editor/**` + `PortalPostForm` | Owned by the `simplerdev-visual-editor` skill. `app/portal/websites/[siteId]/posts/[id]/edit/page.tsx` is a thin server delegator only. Visual editor chrome is out of scope for a portal-wide restyle. |
| Onboarding wizard | Already modernized via `ob-styles.ts` before this sweep. |
| Pure passthrough / iframe / redirect pages | No visible UI to restyle. |

## Notable findings (bug fixes shipped alongside)

### Dashboard widget visibility model

**Problem:** Toggling a default-off or unentitled widget on in the Customize panel only removed the widget ID from the `hidden` set. `lib/dashboard/widgets.ts` (`resolveVisibleWidgets`) only includes a non-ordered widget if `defaultEnabled` is true or its `serviceCategory` is active — so a newly un-hidden widget still did not appear on the board.

**Fix:** `components/portal/dashboard/WidgetBoard.tsx` (397 lines) now appends the widget to `order` on toggle-on. The toggle reads an `onBoard` set seeded from true server-resolved visibility: `app/portal/dashboard/page.tsx` (372 lines) passes `visibleIds` to the client component, derived from `resolveVisibleWidgets` in `lib/dashboard/widgets.ts` (373 lines).

**Invariant going forward:** Client-side widget toggle logic must stay consistent with `resolveVisibleWidgets` — the server is the source of truth for what is "visible"; the client maintains `order` as the list of visible widgets.

### Bare-chrome route allowlist in PortalLayoutClient

**Problem:** `app/portal/PortalLayoutClient.tsx` (194 lines) matched bare-chrome auth routes (no sidebar/shell) by exact pathname. The dynamic route `/portal/invite/[token]` never matched the exact `/portal/invite` check, so invite pages rendered inside the full sidebar shell. `/portal/mobile-auth` was also missing from the allowlist.

**Fix:** Added `pathname.startsWith('/portal/invite/')` and an exact match for `/portal/mobile-auth` to the `isLoginPage` allowlist. Surfaced during visual QA of the redesign sweep.

**Invariant going forward:** When adding new pre-auth or bare-chrome routes under `app/portal/`, also add the appropriate `pathname.startsWith(...)` or exact-match entry to `PortalLayoutClient.tsx`'s allowlist. Exact-match is insufficient for dynamic segments.

## Minor: Stripe Checkout email pre-fill

`app/api/portal/billing/modules/checkout/route.ts` was updated to set the Stripe `customer_email` from the signed-in session user, pre-filling the checkout form and reducing friction. No billing model change.

## Consequences

- Any future portal page or restyle must use `portal-ui.ts` helpers for layout/brand tokens rather than hard-coding Tailwind strings. Extending the design system means adding to `portal-ui.ts`.
- `AuthShell` is now the single pattern for pre-auth split-screen pages. Ad-hoc login-page layouts should be migrated to it.
- `PortalPageHeader` is the standard page header. New portal pages should use it rather than hand-rolling heading markup.
- The `PortalLayoutClient` allowlist is now documented as an explicit invariant — it requires manual maintenance when new bare-chrome routes are added.

## Alternatives considered

- **Tailwind component plugin / CVA variants** — evaluated but rejected for this sweep. The class-string helper approach has zero build tooling dependency, is trivially readable, and the surface area (portal only) was well-bounded. A CVA migration remains an open option if the token set grows significantly.
- **CSS-in-JS or design tokens file** — rejected: the project uses Tailwind 4 throughout; a parallel token system would create two sources of truth.
- **Per-domain component libraries** — rejected: the portal is one audience/tree; a shared flat helper file is sufficient and avoids over-abstraction.

## Related

- [[Auth & Security]] (AuthShell, PortalLayoutClient fix)
- [[Billing & Stripe]] (Checkout email pre-fill)
- [[Company Brain & AI]] (god-file passes)
- [[CMS & Blocks]] (websites/store pages)
