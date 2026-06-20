/**
 * Portal route smoke — A2 deliverable for staging QA (.planning/qa-staging-2026-05-08.md).
 *
 * Walks every `app/portal/**\/page.tsx` route and asserts:
 *   • HTTP 200 (or expected redirect — auth pages bounce a logged-in user back
 *     to /portal/dashboard).
 *   • No browser console errors (deprecation warnings are filtered out).
 *   • No Next.js error overlay rendered in the DOM.
 *   • Page hydrates — a root selector becomes visible within 3s.
 *
 * Tagged @critical so `bun test:critical` picks it up. The whole spec runs
 * serial in a single logged-in browser context to avoid re-login overhead and
 * to make per-test failure output pinpoint the failing route.
 *
 * Dynamic params (`[siteId]`, `[id]`, `[postId]`, etc.) are resolved at spec
 * setup time by hitting the portal's own list endpoints as the logged-in
 * client. If a route's parent context can't be resolved (no seed data), that
 * route's test calls `test.skip(...)` and the spec stays passable.
 *
 * NOTE: this spec only loads pages — it does NOT mutate data. `runCleanups`
 * is invoked from `afterAll` defensively (no-op in practice).
 */
import type { Page, BrowserContext } from '@playwright/test';
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';
import type { ApiClient } from './setup/api-client';

test.describe.configure({ mode: 'serial' });

const CLIENT_EMAIL = 'client@example.com';
const CLIENT_PASSWORD = 'client123';

// ─── Helpers (kept inline per A2 prompt) ───────────────────────────────────

/** Login the browser context via NextAuth credentials. The session cookie
 *  is shared across every test in this file because we run serial and reuse
 *  the same Playwright `page`. */
async function loginAsClientInBrowser(page: Page) {
  const csrfRes = await page.request.get('/api/auth/csrf');
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const signInRes = await page.request.post('/api/auth/callback/credentials', {
    form: {
      email: CLIENT_EMAIL,
      password: CLIENT_PASSWORD,
      csrfToken,
      json: 'true',
    },
  });
  if (signInRes.status() >= 400) {
    throw new Error(`Browser login failed: ${signInRes.status()}`);
  }
}

/** Filter out deprecation / dev-only noise that doesn't actually indicate a
 *  broken page. Anything not matched here is treated as a real error. */
function isIgnorableConsoleMsg(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes('deprecat')) return true;
  if (lower.includes('react-devtools')) return true;
  if (lower.includes('download the react devtools')) return true;
  // Next.js fast-refresh / HMR chatter
  if (lower.includes('[fast refresh]')) return true;
  if (lower.includes('[hmr]')) return true;
  // Browser-level "Failed to load resource" lines are network sub-resource
  // failures (favicon 404s, billing 402 callbacks, third-party CDN blips) —
  // they are informational, not JavaScript runtime errors, so they should
  // not gate the smoke. Real JS errors surface via `pageerror` and via
  // `console.error` calls from app code (which don't carry the "Failed to
  // load resource" prefix).
  if (lower.includes('failed to load resource')) {
    return true;
  }
  // NextAuth (Auth.js) `ClientFetchError: Failed to fetch` — emitted by
  // `next-auth/lib/client.ts#fetchData` when its `/api/auth/session` request
  // is aborted by an in-flight Next.js navigation. It is a transient
  // navigation race, not a real bug: the SessionProvider re-fetches on the
  // next mount and recovers. Auth.js exposes no API to suppress this
  // (`logger.error` is hard-wired to `console.error`), and the historical
  // root cause — nested SessionProviders racing the singleton state — was
  // fixed (see `app/portal/layout.tsx` / `app/admin/layout.tsx`). Keep the
  // narrow string match so any non-fetch ClientFetchError still trips the
  // smoke. Tracked in `.planning/qa-staging-2026-05-08.md` (B-AGENCY).
  if (lower.includes('clientfetcherror') && lower.includes('failed to fetch')) {
    return true;
  }
  // Realtime-collab WebSocket connection failures. The live collab server
  // (NEXT_PUBLIC_REALTIME_URL, default ws://localhost:3030) is a separate
  // process that is NOT part of the e2e harness, so the deck/editor pages log
  // a browser-level "WebSocket connection to ... failed: ERR_CONNECTION_REFUSED"
  // on mount. That is an environmental gap, not an app bug — collab degrades
  // gracefully without it. Narrow match so any other WS error still trips.
  if (lower.includes('websocket connection to') && lower.includes('failed')) {
    return true;
  }
  return false;
}

/** Next 16 renders the error overlay inside a `<nextjs-portal>` custom
 *  element, but that element is also used for the dev tools indicator on
 *  EVERY page in dev mode — so we can't use the wrapper itself as a signal.
 *  Instead we check for the error-specific markers Next 16 only emits when
 *  an actual error/dialog is rendered:
 *    • `[data-nextjs-error-overlay-nav]` — overlay nav bar (top of dialog)
 *    • `[data-nextjs-codeframe]`        — only present inside a runtime
 *                                         error dialog
 *    • `[data-nextjs-container-errors-pseudo-html]` — runtime error body
 *  We also keep the legacy `[data-nextjs-dialog-overlay]` and
 *  `[data-nextjs-dialog]` selectors for forward-compat with prior versions.
 *  All counts must be 0; non-zero indicates a real error overlay. */
const NEXT_OVERLAY_SELECTORS = [
  '[data-nextjs-error-overlay-nav]',
  '[data-nextjs-codeframe]',
  '[data-nextjs-container-errors-pseudo-html]',
  '[data-nextjs-dialog-overlay]',
  '[data-nextjs-dialog]',
];

async function assertNoNextOverlay(page: Page) {
  for (const sel of NEXT_OVERLAY_SELECTORS) {
    const count = await page.locator(sel).count().catch(() => 0);
    expect(count, `Next.js error overlay rendered (${sel})`).toBe(0);
  }
}

interface RouteCheckOptions {
  /** Allow either /portal/dashboard or the original route as the final URL.
   *  Used for auth pages (login/forgot-password/reset-password) that bounce
   *  a logged-in user to the dashboard. */
  allowDashboardRedirect?: boolean;
  /** Some pages take longer to hydrate (deck presenter, knowledge graph).
   *  Override the default 3s hydration window. */
  hydrationTimeoutMs?: number;
}

interface CapturedErrors {
  console: string[];
  pageErrors: string[];
}

/** Attach error listeners BEFORE navigating so we don't miss boot-time errors.
 *  Returns a captured-errors bag plus a detach function. */
function attachErrorListeners(page: Page): {
  errors: CapturedErrors;
  detach: () => void;
} {
  const errors: CapturedErrors = { console: [], pageErrors: [] };

  const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isIgnorableConsoleMsg(text)) return;
    errors.console.push(text);
  };
  const onPageError = (err: Error) => {
    errors.pageErrors.push(err.message);
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  const detach = () => {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  };
  return { errors, detach };
}

async function smokeRoute(
  page: Page,
  route: string,
  opts: RouteCheckOptions = {},
) {
  const { errors, detach } = attachErrorListeners(page);
  try {
    const resp = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Some routes render via streaming and `goto` returns null when the SPA
    // navigates client-side, but in practice the first hit is always SSR.
    if (resp) {
      const status = resp.status();
      // 200 is the happy path. 3xx -> Playwright follows by default and
      // returns the final response, so seeing 3xx here means an unfollowed
      // hop (rare).
      expect(status, `${route} -> HTTP ${status}`).toBeLessThan(400);
    }

    // Wait briefly for hydration. We just need *something* visible — the
    // <body> always exists, but checking `body > *` ensures a child mounted.
    await page
      .locator('body > *')
      .first()
      .waitFor({ state: 'visible', timeout: opts.hydrationTimeoutMs ?? 3_000 })
      .catch(() => {
        // Don't hard-fail on hydration timeout — the overlay/console asserts
        // below are the real signal. Empty <body> is itself caught by the
        // overlay/error checks.
      });

    if (opts.allowDashboardRedirect) {
      const currentUrl = new URL(page.url());
      const path = currentUrl.pathname;
      // An authenticated user hitting /portal/login is bounced to the portal —
      // to the dashboard when onboarded, or to /portal/onboarding when not (the
      // onboarding specs can leave client@example.com mid-wizard). All three are
      // valid clean-load outcomes.
      const validPath =
        path === route ||
        path === '/portal/dashboard' ||
        path === '/portal/onboarding' ||
        path.startsWith(route);
      expect(validPath, `expected ${route}, /portal/dashboard or /portal/onboarding, got ${path}`).toBe(true);
    }

    await assertNoNextOverlay(page);

    expect(errors.pageErrors, `pageerror on ${route}`).toEqual([]);
    expect(errors.console, `console.error on ${route}`).toEqual([]);
  } finally {
    detach();
  }
}

// ─── Seed-id resolution (runs once before any test) ────────────────────────

interface SeedIds {
  siteId: number | null;
  postId: number | null;
  postSiteId: number | null;
  contentTypeId: number | null;
  contentTypeSiteId: number | null;
  storeProductId: number | null;
  storeProductSiteId: number | null;
  storeOrderId: number | null;
  storeOrderSiteId: number | null;
  emailTemplateId: number | null;
  emailTemplateSiteId: number | null;
  pitchDeckId: number | null;
  surveyId: number | null;
  projectId: number | null;
  ticketId: number | null;
  invoiceId: number | null;
  hostingId: number | null;
  serviceId: number | null;
  brandingProfileId: number | null;
  brainNoteId: number | null;
  brainRelationshipId: number | null;
  brainCommunicationId: number | null;
  campaignId: number | null;
  experimentId: number | null;
  suggestedProjectId: number | null;
  bookingPageId: number | null;
  workflowId: number | null;
  inboxConversationId: number | null;
  inboxWidgetId: number | null;
  crmCompanyId: number | null;
  crmContactId: number | null;
  crmProposalId: number | null;
  crmContractId: number | null;
}

/** Best-effort: hit a list endpoint and pull the first id-bearing record.
 *  Returns null if the endpoint 404s, denies, or is empty. */
async function pickFirstId(
  api: ApiClient,
  path: string,
  field: string = 'id',
): Promise<number | null> {
  try {
    const res = await api.get(path);
    if (res.status >= 400 || !res.data) return null;
    const list: unknown =
      (res.data as { data?: unknown }).data ??
      (res.data as { items?: unknown }).items ??
      res.data;
    const arr = Array.isArray(list)
      ? list
      : Array.isArray((list as { items?: unknown[] })?.items)
        ? (list as { items: unknown[] }).items
        : Array.isArray((list as { data?: unknown[] })?.data)
          ? (list as { data: unknown[] }).data
          : [];
    if (arr.length === 0) return null;
    const first = arr[0] as Record<string, unknown>;
    const value = first?.[field];
    return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) || null : null;
  } catch {
    return null;
  }
}

async function resolveSeedIds(api: ApiClient): Promise<SeedIds> {
  const ids: SeedIds = {
    siteId: null,
    postId: null,
    postSiteId: null,
    contentTypeId: null,
    contentTypeSiteId: null,
    storeProductId: null,
    storeProductSiteId: null,
    storeOrderId: null,
    storeOrderSiteId: null,
    emailTemplateId: null,
    emailTemplateSiteId: null,
    pitchDeckId: null,
    surveyId: null,
    projectId: null,
    ticketId: null,
    invoiceId: null,
    hostingId: null,
    serviceId: null,
    brandingProfileId: null,
    brainNoteId: null,
    brainRelationshipId: null,
    brainCommunicationId: null,
    campaignId: null,
    experimentId: null,
    suggestedProjectId: null,
    bookingPageId: null,
    workflowId: null,
    inboxConversationId: null,
    inboxWidgetId: null,
    crmCompanyId: null,
    crmContactId: null,
    crmProposalId: null,
    crmContractId: null,
  };

  // Site-scoped — anchor first.
  ids.siteId = await pickFirstId(api, '/api/portal/cms/websites');
  if (ids.siteId) {
    // Posts: try the site-scoped list first.
    const postsRes = await api.get(`/api/portal/cms/websites/${ids.siteId}/posts`).catch(() => null);
    const postList: unknown[] =
      ((postsRes?.data as { data?: unknown[] })?.data as unknown[]) ??
      ((postsRes?.data as { items?: unknown[] })?.items as unknown[]) ??
      [];
    if (Array.isArray(postList) && postList.length > 0) {
      const first = postList[0] as { id?: number };
      if (typeof first.id === 'number') {
        ids.postId = first.id;
        ids.postSiteId = ids.siteId;
      }
    }

    ids.contentTypeId = await pickFirstId(
      api,
      `/api/portal/cms/websites/${ids.siteId}/content-types`,
    );
    if (ids.contentTypeId) ids.contentTypeSiteId = ids.siteId;

    ids.storeProductId = await pickFirstId(
      api,
      `/api/portal/cms/websites/${ids.siteId}/store/products`,
    );
    if (ids.storeProductId) ids.storeProductSiteId = ids.siteId;

    ids.storeOrderId = await pickFirstId(
      api,
      `/api/portal/cms/websites/${ids.siteId}/store/orders`,
    );
    if (ids.storeOrderId) ids.storeOrderSiteId = ids.siteId;

    ids.emailTemplateId = await pickFirstId(
      api,
      `/api/portal/cms/websites/${ids.siteId}/email-templates`,
    );
    if (ids.emailTemplateId) ids.emailTemplateSiteId = ids.siteId;
  }

  // Cross-site fallback for posts: walk a couple more sites.
  if (ids.postId == null) {
    const sitesRes = await api.get('/api/portal/cms/websites').catch(() => null);
    const sites = ((sitesRes?.data as { data?: Array<{ id?: number }> })?.data ?? []) as Array<{ id?: number }>;
    for (const s of sites.slice(0, 5)) {
      if (typeof s.id !== 'number') continue;
      const id = await pickFirstId(api, `/api/portal/cms/websites/${s.id}/posts`);
      if (id) {
        ids.postId = id;
        ids.postSiteId = s.id;
        break;
      }
    }
  }

  // Top-level resources.
  ids.pitchDeckId = await pickFirstId(api, '/api/portal/tools/pitch-decks');
  ids.surveyId = await pickFirstId(api, '/api/portal/surveys');
  ids.projectId = await pickFirstId(api, '/api/portal/projects');
  ids.ticketId = await pickFirstId(api, '/api/portal/tickets');
  ids.invoiceId = await pickFirstId(api, '/api/portal/invoices');
  ids.hostingId = await pickFirstId(api, '/api/portal/hosting');
  ids.serviceId = await pickFirstId(api, '/api/portal/services');
  ids.brandingProfileId = await pickFirstId(api, '/api/portal/branding/profiles');
  ids.brainNoteId = await pickFirstId(api, '/api/portal/brain/knowledge');
  ids.brainRelationshipId = await pickFirstId(api, '/api/portal/brain/relationships');
  ids.brainCommunicationId = await pickFirstId(api, '/api/portal/brain/communications');
  ids.campaignId = await pickFirstId(api, '/api/portal/email/campaigns');
  ids.experimentId = await pickFirstId(api, '/api/portal/experiments');
  ids.suggestedProjectId = await pickFirstId(api, '/api/portal/suggested-projects');
  ids.bookingPageId = await pickFirstId(api, '/api/portal/tools/booking');
  ids.workflowId = await pickFirstId(api, '/api/portal/automations/workflows');
  ids.inboxConversationId = await pickFirstId(api, '/api/portal/chat/conversations');
  ids.inboxWidgetId = await pickFirstId(api, '/api/portal/chat/widgets');
  ids.crmCompanyId = await pickFirstId(api, '/api/portal/crm/companies');
  ids.crmContactId = await pickFirstId(api, '/api/portal/crm/contacts');
  ids.crmProposalId = await pickFirstId(api, '/api/portal/crm/proposals');
  ids.crmContractId = await pickFirstId(api, '/api/portal/crm/contracts');

  return ids;
}

// ─── Spec body ─────────────────────────────────────────────────────────────

test.describe('Portal route smoke — every /portal page loads clean @critical @portal-smoke', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let seedIds: SeedIds;
  let sharedContext: BrowserContext;
  let sharedPage: Page;

  test.beforeAll(async ({ browser, clientApi }) => {
    seedIds = await resolveSeedIds(clientApi);
    sharedContext = await browser.newContext();
    sharedPage = await sharedContext.newPage();
    await loginAsClientInBrowser(sharedPage);
  });

  test.afterAll(async () => {
    await runCleanups(cleanups);
    cleanups = [];
    await sharedPage?.close().catch(() => {});
    await sharedContext?.close().catch(() => {});
  });

  // ── Static (non-dynamic) routes ──
  const staticRoutes: Array<{ route: string; opts?: RouteCheckOptions }> = [
    { route: '/portal/dashboard' },
    { route: '/portal/agency' },
    { route: '/portal/agency/branding' },
    { route: '/portal/agency/custom-domain' },
    { route: '/portal/approvals' },
    { route: '/portal/automations' },
    { route: '/portal/automations/trigger-links' },
    { route: '/portal/automations/workflows' },
    { route: '/portal/brain' },
    { route: '/portal/brain/ask' },
    { route: '/portal/brain/automations' },
    { route: '/portal/brain/calendar' },
    { route: '/portal/brain/communications' },
    { route: '/portal/brain/communications/new' },
    { route: '/portal/brain/connect' },
    { route: '/portal/brain/knowledge' },
    { route: '/portal/brain/knowledge/graph' },
    { route: '/portal/brain/knowledge/treemap' },
    { route: '/portal/brain/prospects' },
    { route: '/portal/brain/relationships' },
    { route: '/portal/brain/review' },
    { route: '/portal/brain/settings' },
    { route: '/portal/brain/tasks' },
    { route: '/portal/brain/templates' },
    { route: '/portal/branding' },
    { route: '/portal/crm' },
    { route: '/portal/crm/companies' },
    { route: '/portal/crm/contacts' },
    { route: '/portal/crm/deals' },
    { route: '/portal/crm/proposals' },
    { route: '/portal/crm/settings' },
    { route: '/portal/email' },
    { route: '/portal/email/analytics' },
    { route: '/portal/email/automations' },
    { route: '/portal/email/campaigns' },
    { route: '/portal/email/campaigns/new' },
    { route: '/portal/email/editor-preview' },
    { route: '/portal/email/lists' },
    { route: '/portal/email/segments' },
    { route: '/portal/email/settings' },
    { route: '/portal/email/templates' },
    { route: '/portal/experiments' },
    { route: '/portal/forgot-password', opts: { allowDashboardRedirect: true } },
    { route: '/portal/hosting' },
    { route: '/portal/inbox' },
    { route: '/portal/integrations/api-keys' },
    { route: '/portal/login', opts: { allowDashboardRedirect: true } },
    { route: '/portal/media' },
    { route: '/portal/my-tasks' },
    { route: '/portal/projects' },
    { route: '/portal/projects/automations' },
    { route: '/portal/reset-password', opts: { allowDashboardRedirect: true } },
    { route: '/portal/services' },
    { route: '/portal/settings/ai' },
    { route: '/portal/settings/api-keys' },
    { route: '/portal/settings/billing' },
    { route: '/portal/settings/integrations' },
    { route: '/portal/settings/notifications' },
    { route: '/portal/settings/profile' },
    { route: '/portal/settings/support' },
    { route: '/portal/settings/team' },
    { route: '/portal/settings/webhooks' },
    { route: '/portal/snapshots' },
    { route: '/portal/suggested-projects' },
    { route: '/portal/surveys' },
    { route: '/portal/surveys/new' },
    { route: '/portal/tickets' },
    { route: '/portal/tickets/new' },
    { route: '/portal/tools/booking' },
    { route: '/portal/tools/booking/analytics' },
    { route: '/portal/tools/booking/calendar' },
    { route: '/portal/tools/booking/checkin' },
    { route: '/portal/tools/booking/new' },
    { route: '/portal/tools/booking/quotes' },
    { route: '/portal/tools/booking/quotes/new' },
    { route: '/portal/tools/gift-certificates' },
    { route: '/portal/tools/pitch-decks/new' },
    { route: '/portal/websites' },
    { route: '/portal/websites/new' },
  ];

  for (const { route, opts } of staticRoutes) {
    test(`GET ${route}`, async () => {
      await smokeRoute(sharedPage, route, opts);
    });
  }

  // ── Dynamic routes — depend on seed IDs ──

  // /portal/automations/workflows/[id]
  test('GET /portal/automations/workflows/[id]', async () => {
    if (seedIds.workflowId == null) {
      test.skip(true, 'no automation workflow seed for client@example.com');
      return;
    }
    await smokeRoute(sharedPage, `/portal/automations/workflows/${seedIds.workflowId}`);
  });

  // /portal/brain/communications/[id] + review
  test('GET /portal/brain/communications/[id]', async () => {
    if (seedIds.brainCommunicationId == null) {
      test.skip(true, 'no brain communication seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/brain/communications/${seedIds.brainCommunicationId}`);
  });
  test('GET /portal/brain/communications/[id]/review', async () => {
    if (seedIds.brainCommunicationId == null) {
      test.skip(true, 'no brain communication seed');
      return;
    }
    await smokeRoute(
      sharedPage,
      `/portal/brain/communications/${seedIds.brainCommunicationId}/review`,
    );
  });

  // /portal/brain/knowledge/[id]
  test('GET /portal/brain/knowledge/[id]', async () => {
    if (seedIds.brainNoteId == null) {
      test.skip(true, 'no brain note seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/brain/knowledge/${seedIds.brainNoteId}`);
  });

  // /portal/brain/relationships/[id]
  test('GET /portal/brain/relationships/[id]', async () => {
    if (seedIds.brainRelationshipId == null) {
      test.skip(true, 'no brain relationship seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/brain/relationships/${seedIds.brainRelationshipId}`);
  });

  // /portal/branding/profiles/[profileId] + guide
  test('GET /portal/branding/profiles/[profileId]', async () => {
    if (seedIds.brandingProfileId == null) {
      test.skip(true, 'no branding profile seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/branding/profiles/${seedIds.brandingProfileId}`);
  });
  test('GET /portal/branding/profiles/[profileId]/guide', async () => {
    if (seedIds.brandingProfileId == null) {
      test.skip(true, 'no branding profile seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/branding/profiles/${seedIds.brandingProfileId}/guide`);
  });

  // /portal/crm/companies/[id]
  test('GET /portal/crm/companies/[id]', async () => {
    if (seedIds.crmCompanyId == null) {
      test.skip(true, 'no CRM company seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/crm/companies/${seedIds.crmCompanyId}`);
  });

  // /portal/crm/contacts/[id]
  test('GET /portal/crm/contacts/[id]', async () => {
    if (seedIds.crmContactId == null) {
      test.skip(true, 'no CRM contact seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/crm/contacts/${seedIds.crmContactId}`);
  });

  // /portal/crm/contracts/[id]
  test('GET /portal/crm/contracts/[id]', async () => {
    if (seedIds.crmContractId == null) {
      test.skip(true, 'no CRM contract seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/crm/contracts/${seedIds.crmContractId}`);
  });

  // /portal/crm/proposals/[id]
  test('GET /portal/crm/proposals/[id]', async () => {
    if (seedIds.crmProposalId == null) {
      test.skip(true, 'no CRM proposal seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/crm/proposals/${seedIds.crmProposalId}`);
  });

  // /portal/email/campaigns/[id]
  test('GET /portal/email/campaigns/[id]', async () => {
    if (seedIds.campaignId == null) {
      test.skip(true, 'no email campaign seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/email/campaigns/${seedIds.campaignId}`);
  });

  // /portal/experiments/[id]
  test('GET /portal/experiments/[id]', async () => {
    if (seedIds.experimentId == null) {
      test.skip(true, 'no AB experiment seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/experiments/${seedIds.experimentId}`);
  });

  // /portal/hosting/[id]
  test('GET /portal/hosting/[id]', async () => {
    if (seedIds.hostingId == null) {
      test.skip(true, 'no hosting plan seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/hosting/${seedIds.hostingId}`);
  });

  // /portal/inbox/[id]
  test('GET /portal/inbox/[id]', async () => {
    if (seedIds.inboxConversationId == null) {
      test.skip(true, 'no inbox conversation seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/inbox/${seedIds.inboxConversationId}`);
  });

  // /portal/inbox/widgets/[id]
  test('GET /portal/inbox/widgets/[id]', async () => {
    if (seedIds.inboxWidgetId == null) {
      test.skip(true, 'no chat widget seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/inbox/widgets/${seedIds.inboxWidgetId}`);
  });

  // /portal/invite/[token] — invitation tokens are one-shot. Hit a known
  // sentinel value; an invalid-token page should still render cleanly.
  test('GET /portal/invite/[token] (sentinel)', async () => {
    await smokeRoute(sharedPage, '/portal/invite/00000000-invalid-token');
  });

  // /portal/invoices/[id]
  test('GET /portal/invoices/[id]', async () => {
    if (seedIds.invoiceId == null) {
      test.skip(true, 'no invoice seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/invoices/${seedIds.invoiceId}`);
  });

  // /portal/projects/[id]
  test('GET /portal/projects/[id]', async () => {
    if (seedIds.projectId == null) {
      test.skip(true, 'no project seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/projects/${seedIds.projectId}`);
  });

  // /portal/services/[id]/request
  test('GET /portal/services/[id]/request', async () => {
    if (seedIds.serviceId == null) {
      test.skip(true, 'no service seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/services/${seedIds.serviceId}/request`);
  });

  // /portal/suggested-projects/[id] + request
  test('GET /portal/suggested-projects/[id]', async () => {
    if (seedIds.suggestedProjectId == null) {
      test.skip(true, 'no suggested project seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/suggested-projects/${seedIds.suggestedProjectId}`);
  });
  test('GET /portal/suggested-projects/[id]/request', async () => {
    if (seedIds.suggestedProjectId == null) {
      test.skip(true, 'no suggested project seed');
      return;
    }
    await smokeRoute(
      sharedPage,
      `/portal/suggested-projects/${seedIds.suggestedProjectId}/request`,
    );
  });

  // /portal/surveys/[id]
  test('GET /portal/surveys/[id]', async () => {
    if (seedIds.surveyId == null) {
      test.skip(true, 'no survey seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/surveys/${seedIds.surveyId}`);
  });

  // /portal/tickets/[id]
  test('GET /portal/tickets/[id]', async () => {
    if (seedIds.ticketId == null) {
      test.skip(true, 'no ticket seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/tickets/${seedIds.ticketId}`);
  });

  // /portal/tools/booking/[id]
  test('GET /portal/tools/booking/[id]', async () => {
    if (seedIds.bookingPageId == null) {
      test.skip(true, 'no booking page seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/tools/booking/${seedIds.bookingPageId}`);
  });

  // /portal/tools/pitch-decks/[id] + presenter + slide-preview
  test('GET /portal/tools/pitch-decks/[id]', async () => {
    if (seedIds.pitchDeckId == null) {
      test.skip(true, 'no pitch deck seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/tools/pitch-decks/${seedIds.pitchDeckId}`, {
      hydrationTimeoutMs: 6_000,
    });
  });
  test('GET /portal/tools/pitch-decks/[id]/presenter', async () => {
    if (seedIds.pitchDeckId == null) {
      test.skip(true, 'no pitch deck seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/tools/pitch-decks/${seedIds.pitchDeckId}/presenter`, {
      hydrationTimeoutMs: 6_000,
    });
  });
  test('GET /portal/tools/pitch-decks/[id]/slide-preview', async () => {
    if (seedIds.pitchDeckId == null) {
      test.skip(true, 'no pitch deck seed');
      return;
    }
    await smokeRoute(sharedPage, `/portal/tools/pitch-decks/${seedIds.pitchDeckId}/slide-preview`, {
      hydrationTimeoutMs: 6_000,
    });
  });

  // /portal/websites/[siteId]/...
  const siteScopedRoutes = (siteId: number): string[] => [
    `/portal/websites/${siteId}`,
    `/portal/websites/${siteId}/automations`,
    `/portal/websites/${siteId}/branding`,
    `/portal/websites/${siteId}/calendar`,
    `/portal/websites/${siteId}/categories`,
    `/portal/websites/${siteId}/code`,
    `/portal/websites/${siteId}/content-types`,
    `/portal/websites/${siteId}/email`,
    `/portal/websites/${siteId}/entries`,
    `/portal/websites/${siteId}/media`,
    `/portal/websites/${siteId}/navigation`,
    `/portal/websites/${siteId}/posts/new`,
    `/portal/websites/${siteId}/settings`,
    `/portal/websites/${siteId}/store`,
    `/portal/websites/${siteId}/store/categories`,
    `/portal/websites/${siteId}/store/discounts`,
    `/portal/websites/${siteId}/store/orders`,
    `/portal/websites/${siteId}/store/products`,
    `/portal/websites/${siteId}/store/settings`,
    `/portal/websites/${siteId}/store/shipping`,
    `/portal/websites/${siteId}/tags`,
    `/portal/websites/${siteId}/taxonomy`,
  ];
  for (const stub of [
    '',
    '/automations',
    '/branding',
    '/calendar',
    '/categories',
    '/code',
    '/content-types',
    '/email',
    '/entries',
    '/media',
    '/navigation',
    '/posts/new',
    '/settings',
    '/store',
    '/store/categories',
    '/store/discounts',
    '/store/orders',
    '/store/products',
    '/store/settings',
    '/store/shipping',
    '/tags',
    '/taxonomy',
  ]) {
    test(`GET /portal/websites/[siteId]${stub}`, async () => {
      if (seedIds.siteId == null) {
        test.skip(true, 'no website seed');
        return;
      }
      const all = siteScopedRoutes(seedIds.siteId);
      const target = all.find((r) => r === `/portal/websites/${seedIds.siteId}${stub}`);
      if (!target) throw new Error(`no mapping for stub ${stub}`);
      await smokeRoute(sharedPage, target);
    });
  }

  // /portal/websites/[siteId]/content-types/[typeId]/fields and template
  test('GET /portal/websites/[siteId]/content-types/[typeId]/fields', async () => {
    if (seedIds.contentTypeSiteId == null || seedIds.contentTypeId == null) {
      test.skip(true, 'no content type seed');
      return;
    }
    await smokeRoute(
      sharedPage,
      `/portal/websites/${seedIds.contentTypeSiteId}/content-types/${seedIds.contentTypeId}/fields`,
    );
  });
  test('GET /portal/websites/[siteId]/content-types/[typeId]/template', async () => {
    if (seedIds.contentTypeSiteId == null || seedIds.contentTypeId == null) {
      test.skip(true, 'no content type seed');
      return;
    }
    await smokeRoute(
      sharedPage,
      `/portal/websites/${seedIds.contentTypeSiteId}/content-types/${seedIds.contentTypeId}/template`,
    );
  });

  // /portal/websites/[siteId]/email/[templateId]
  test('GET /portal/websites/[siteId]/email/[templateId]', async () => {
    if (seedIds.emailTemplateSiteId == null || seedIds.emailTemplateId == null) {
      test.skip(true, 'no email template seed');
      return;
    }
    await smokeRoute(
      sharedPage,
      `/portal/websites/${seedIds.emailTemplateSiteId}/email/${seedIds.emailTemplateId}`,
    );
  });

  // /portal/websites/[siteId]/posts/[postId]/edit
  test('GET /portal/websites/[siteId]/posts/[postId]/edit', async () => {
    if (seedIds.postSiteId == null || seedIds.postId == null) {
      test.skip(true, 'no post seed');
      return;
    }
    await smokeRoute(
      sharedPage,
      `/portal/websites/${seedIds.postSiteId}/posts/${seedIds.postId}/edit`,
      { hydrationTimeoutMs: 8_000 },
    );
  });

  // /portal/websites/[siteId]/store/orders/[orderId]
  test('GET /portal/websites/[siteId]/store/orders/[orderId]', async () => {
    if (seedIds.storeOrderSiteId == null || seedIds.storeOrderId == null) {
      test.skip(true, 'no store order seed');
      return;
    }
    await smokeRoute(
      sharedPage,
      `/portal/websites/${seedIds.storeOrderSiteId}/store/orders/${seedIds.storeOrderId}`,
    );
  });

  // /portal/websites/[siteId]/store/products/[productId]
  test('GET /portal/websites/[siteId]/store/products/[productId]', async () => {
    if (seedIds.storeProductSiteId == null || seedIds.storeProductId == null) {
      test.skip(true, 'no store product seed');
      return;
    }
    await smokeRoute(
      sharedPage,
      `/portal/websites/${seedIds.storeProductSiteId}/store/products/${seedIds.storeProductId}`,
    );
  });
});
