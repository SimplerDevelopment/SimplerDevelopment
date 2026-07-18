/**
 * Mobile/responsive audit driver.
 *
 * Usage:
 *   bun scripts/audits/mobile-audit.ts            # all routes, iPhone viewport
 *   bun scripts/audits/mobile-audit.ts --routes=/portal/dashboard,/portal/crm
 *   bun scripts/audits/mobile-audit.ts --viewport=tablet
 *   bun scripts/audits/mobile-audit.ts --shard=0/4 # for parallel runs
 *
 * Writes per-route findings to .mobile-audit/findings/<slug>.json and
 * a screenshot to .mobile-audit/screenshots/<slug>.png.
 *
 * Findings include:
 *   • status code
 *   • console errors (filtered against the same ignorelist as the smoke spec)
 *   • horizontal overflow (body width > viewport)
 *   • elements overflowing the viewport on the right edge
 *   • tap targets smaller than 32x32 (44x44 is Apple ideal, 32x32 is a
 *     pragmatic minimum used here so we surface real problems first)
 *   • main nav state: is mobile menu trigger visible? is sidebar hidden?
 *   • presence of horizontal scrollbars inside main scrolling containers
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.AUDIT_BASE_URL || 'http://localhost:3100';
const EMAIL = process.env.AUDIT_EMAIL || 'client@example.com';
const PASSWORD = process.env.AUDIT_PASSWORD || 'client123';

const ROOT = process.cwd();
const FINDINGS_DIR = path.join(ROOT, '.mobile-audit', 'findings');
const SHOTS_DIR = path.join(ROOT, '.mobile-audit', 'screenshots');

interface Args {
  routes?: string[];
  viewport: 'phone' | 'tablet';
  shard?: { index: number; total: number };
  headed: boolean;
  retake: boolean;
}

function parseArgs(): Args {
  const a: Args = { viewport: 'phone', headed: false, retake: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--routes=')) {
      a.routes = arg.slice('--routes='.length).split(',').filter(Boolean);
    } else if (arg.startsWith('--viewport=')) {
      const v = arg.slice('--viewport='.length);
      if (v === 'tablet') a.viewport = 'tablet';
    } else if (arg.startsWith('--shard=')) {
      const [idx, total] = arg.slice('--shard='.length).split('/').map(Number);
      a.shard = { index: idx, total };
    } else if (arg === '--headed') {
      a.headed = true;
    } else if (arg === '--retake') {
      a.retake = true;
    }
  }
  return a;
}

const VIEWPORTS = {
  phone: { width: 390, height: 844 }, // iPhone 14 Pro
  tablet: { width: 768, height: 1024 }, // iPad portrait
};

function slugify(route: string): string {
  return route.replace(/^\//, '').replace(/[\/?&=]/g, '_').replace(/[^A-Za-z0-9._-]/g, '-') || 'root';
}

function isIgnorableConsoleMsg(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes('deprecat')) return true;
  if (lower.includes('react-devtools')) return true;
  if (lower.includes('download the react devtools')) return true;
  if (lower.includes('[fast refresh]')) return true;
  if (lower.includes('[hmr]')) return true;
  if (lower.includes('failed to load resource')) return true;
  if (lower.includes('clientfetcherror') && lower.includes('failed to fetch')) return true;
  // Next dev-only noise
  if (lower.includes('hydration') && lower.includes('did not match')) return false; // real
  if (lower.includes('source map')) return true;
  return false;
}

async function login(context: BrowserContext, page: Page): Promise<void> {
  // Establish origin so set-cookie URLs resolve.
  await page.goto(`${BASE_URL}/portal/login`, { waitUntil: 'domcontentloaded' });
  // Pull a CSRF token from authjs (covers both legacy next-auth and authjs naming).
  const csrfRes = await context.request.get(`${BASE_URL}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const signInRes = await context.request.post(`${BASE_URL}/api/auth/callback/credentials`, {
    form: { email: EMAIL, password: PASSWORD, csrfToken, json: 'true' },
  });
  if (signInRes.status() >= 400) {
    const body = await signInRes.text();
    throw new Error(`Login failed: ${signInRes.status()} — ${body.slice(0, 200)}`);
  }
  // Verify the session is live by hitting a protected endpoint.
  const me = await context.request.get(`${BASE_URL}/api/auth/session`);
  const meJson = (await me.json()) as { user?: { id?: string } } | null;
  if (!meJson || !meJson.user) {
    throw new Error(`Login did not establish a session (response: ${JSON.stringify(meJson)})`);
  }
}

interface RouteFinding {
  route: string;
  viewport: string;
  status: number | null;
  finalUrl: string;
  consoleErrors: string[];
  pageErrors: string[];
  horizontalOverflow: { bodyScrollWidth: number; viewportWidth: number; diff: number } | null;
  overflowingElements: Array<{ selector: string; right: number; width: number; text?: string }>;
  tinyTapTargets: Array<{ selector: string; w: number; h: number; text?: string }>;
  navState: {
    hamburgerVisible: boolean;
    sidebarVisible: boolean;
    headerHeight: number | null;
  };
  fixedOverlapsContent: boolean;
  durationMs: number;
  screenshotPath: string;
  ok: boolean;
  notes: string[];
}

async function auditRoute(page: Page, route: string, viewportLabel: string): Promise<RouteFinding> {
  const t0 = Date.now();
  const finding: RouteFinding = {
    route,
    viewport: viewportLabel,
    status: null,
    finalUrl: '',
    consoleErrors: [],
    pageErrors: [],
    horizontalOverflow: null,
    overflowingElements: [],
    tinyTapTargets: [],
    navState: { hamburgerVisible: false, sidebarVisible: false, headerHeight: null },
    fixedOverlapsContent: false,
    durationMs: 0,
    screenshotPath: '',
    ok: false,
    notes: [],
  };

  const onConsole = (msg: import('playwright').ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isIgnorableConsoleMsg(text)) return;
    finding.consoleErrors.push(text);
  };
  const onPageError = (err: Error) => {
    finding.pageErrors.push(err.message);
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    const resp = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'load', timeout: 60_000 });
    finding.status = resp?.status() ?? null;
    finding.finalUrl = page.url();
    // Allow client-side hydration; small delay catches any post-mount layout shifts.
    await page.waitForTimeout(1500);

    const result = await page.evaluate(({ viewportWidth, viewportHeight }: { viewportWidth: number; viewportHeight: number }) => {
      const body = document.body;
      const html = document.documentElement;
      const bodyScrollWidth = Math.max(body.scrollWidth, html.scrollWidth);
      const horizontalOverflow = bodyScrollWidth > viewportWidth + 1
        ? { bodyScrollWidth, viewportWidth, diff: bodyScrollWidth - viewportWidth }
        : null;

      function cssPath(el: Element): string {
        const parts: string[] = [];
        let cur: Element | null = el;
        let depth = 0;
        while (cur && depth < 5) {
          let part = cur.tagName.toLowerCase();
          if (cur.id) {
            part += `#${cur.id}`;
            parts.unshift(part);
            break;
          }
          // Prioritize layout-relevant classes (overflow-x-auto, sticky, etc.)
          // when truncating, since the consumer of the selector path uses these
          // to detect scroll containers up the tree.
          const allClasses = (cur.getAttribute('class') || '').split(/\s+/).filter(Boolean);
          const priority = allClasses.filter((c) => /^overflow-/.test(c) || c === 'sticky' || /^min-w-\[/.test(c));
          const rest = allClasses.filter((c) => !priority.includes(c));
          const cls = [...priority, ...rest].slice(0, 4).join('.');
          if (cls) part += `.${cls}`;
          parts.unshift(part);
          cur = cur.parentElement;
          depth++;
        }
        return parts.join(' > ');
      }

      const overflowingElements: Array<{ selector: string; right: number; width: number; text?: string; position: string }> = [];
      const all = document.querySelectorAll<HTMLElement>('body *');
      let count = 0;
      for (const el of all) {
        if (count > 25) break;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        // Skip elements that are children of overflowing parents we already flagged.
        // The element exceeds the right edge of the viewport
        if (rect.right > viewportWidth + 1 && rect.left < viewportWidth) {
          // For fixed/sticky, only flag if intrinsic width also exceeds viewport
          // (a fixed nav whose right rect just goes past is usually intentional).
          if ((cs.position === 'fixed' || cs.position === 'sticky') && rect.width <= viewportWidth + 1) continue;
          overflowingElements.push({
            selector: cssPath(el),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            text: (el.textContent || '').trim().slice(0, 60) || undefined,
            position: cs.position,
          });
          count++;
        }
      }

      // Tap targets — clickable elements smaller than 32x32
      const tinyTapTargets: Array<{ selector: string; w: number; h: number; text?: string }> = [];
      const clickables = document.querySelectorAll<HTMLElement>(
        'button, a[href], [role="button"], input[type="button"], input[type="submit"]',
      );
      let tinyCount = 0;
      for (const el of clickables) {
        if (tinyCount > 25) break;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        // Skip off-screen elements (in collapsed menus, etc.)
        if (rect.top + rect.height < 0 || rect.left + rect.width < 0) continue;
        if (rect.top > viewportHeight) continue;
        if (rect.width < 32 || rect.height < 32) {
          tinyTapTargets.push({
            selector: cssPath(el),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40) || undefined,
          });
          tinyCount++;
        }
      }

      // Nav state — look for typical hamburger trigger + sidebar
      let hamburgerVisible = false;
      let sidebarVisible = false;
      let headerHeight: number | null = null;
      const hamburgerCandidates = document.querySelectorAll<HTMLElement>(
        '[aria-label*="menu" i], [aria-label*="navigation" i], [data-mobile-nav], button[aria-expanded][aria-controls], button:has(svg.lucide-menu), header button:has(svg)',
      );
      for (const el of hamburgerCandidates) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.top < 200) {
          hamburgerVisible = true;
          break;
        }
      }
      const sidebar = document.querySelector<HTMLElement>('aside, [role="navigation"][aria-label*="sidebar" i], nav[data-portal-sidebar]');
      if (sidebar) {
        const cs = getComputedStyle(sidebar);
        const rect = sidebar.getBoundingClientRect();
        sidebarVisible = cs.display !== 'none' && cs.visibility !== 'hidden' && rect.width > 60;
      }
      const header = document.querySelector<HTMLElement>('header');
      if (header) {
        headerHeight = Math.round(header.getBoundingClientRect().height);
      }

      return {
        horizontalOverflow,
        overflowingElements,
        tinyTapTargets,
        navState: { hamburgerVisible, sidebarVisible, headerHeight },
      };
    }, { viewportWidth: page.viewportSize()?.width || 390, viewportHeight: page.viewportSize()?.height || 844 });

    finding.horizontalOverflow = result.horizontalOverflow;
    finding.overflowingElements = result.overflowingElements;
    finding.tinyTapTargets = result.tinyTapTargets;
    finding.navState = result.navState;

    const slug = `${viewportLabel}-${slugify(route)}`;
    const shotPath = path.join(SHOTS_DIR, `${slug}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
    finding.screenshotPath = path.relative(ROOT, shotPath);

    finding.ok =
      (finding.status === 200 || (finding.status && finding.status >= 300 && finding.status < 400)) &&
      finding.consoleErrors.length === 0 &&
      finding.pageErrors.length === 0 &&
      !finding.horizontalOverflow &&
      finding.overflowingElements.length === 0;
  } catch (err) {
    finding.notes.push(`navigation error: ${(err as Error).message}`);
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    finding.durationMs = Date.now() - t0;
  }
  return finding;
}

interface RouteSpec {
  /** raw route as written in app/portal */
  rawRoute: string;
  /** concrete URL to navigate */
  url: string;
  /** whether the URL contains an unresolved [param] */
  unresolved: boolean;
}

async function discoverRoutes(): Promise<RouteSpec[]> {
  const root = path.join(ROOT, 'app/portal');
  const out: RouteSpec[] = [];

  async function walk(dir: string, segments: string[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    let hasPage = false;
    for (const e of entries) {
      if (e.name === 'page.tsx' || e.name === 'page.ts') hasPage = true;
    }
    if (hasPage) {
      const route = '/portal' + (segments.length ? '/' + segments.join('/') : '');
      const unresolved = route.includes('[');
      out.push({ rawRoute: route, url: route, unresolved });
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      // Skip route groups like (auth) — not exposed as URL segments.
      if (e.name.startsWith('(') && e.name.endsWith(')')) {
        await walk(path.join(dir, e.name), segments);
        continue;
      }
      // Skip private folders (e.g. _components) and api
      if (e.name.startsWith('_') || e.name === 'api') continue;
      await walk(path.join(dir, e.name), [...segments, e.name]);
    }
  }
  await walk(root, []);
  out.sort((a, b) => a.rawRoute.localeCompare(b.rawRoute));
  return out;
}

async function resolveDynamicParams(ctx: BrowserContext, routes: RouteSpec[]): Promise<RouteSpec[]> {
  const req = ctx.request;
  const cache: Record<string, string | null> = {};

  async function pickId(endpoint: string, fields: string[] = ['id']): Promise<string | null> {
    if (cache[endpoint] !== undefined) return cache[endpoint];
    try {
      const r = await req.get(`${BASE_URL}${endpoint}`);
      if (!r.ok()) {
        cache[endpoint] = null;
        return null;
      }
      const j = (await r.json()) as unknown;
      const arr = Array.isArray(j) ? j : (j as { data?: unknown[] }).data;
      if (!Array.isArray(arr) || arr.length === 0) {
        cache[endpoint] = null;
        return null;
      }
      const first = arr[0] as Record<string, unknown>;
      for (const f of fields) {
        const v = first[f];
        if (typeof v === 'string' && v.length > 0) {
          cache[endpoint] = v;
          return v;
        }
      }
      cache[endpoint] = null;
      return null;
    } catch {
      cache[endpoint] = null;
      return null;
    }
  }

  const resolved: RouteSpec[] = [];

  for (const r of routes) {
    if (!r.unresolved) {
      resolved.push(r);
      continue;
    }
    let url = r.rawRoute;
    let stillUnresolved = false;

    // Identify each [param] segment with context-aware lookup.
    const placeholders = [...r.rawRoute.matchAll(/\[(\.{3})?([^\]]+)\]/g)];
    for (const [match, , name] of placeholders) {
      let id: string | null = null;
      // Route-context resolution
      if (r.rawRoute.startsWith('/portal/websites/[siteId]')) {
        if (!cache._siteId) {
          const sid = await pickId('/api/sites');
          cache._siteId = sid ?? null;
        }
        if (name === 'siteId') {
          id = cache._siteId;
        } else if (name === 'postId' || (name === 'id' && r.rawRoute.includes('posts/'))) {
          id = cache._siteId ? await pickId(`/api/sites/${cache._siteId}/posts`) : null;
        } else if (name === 'orderId') {
          id = cache._siteId ? await pickId(`/api/sites/${cache._siteId}/store/orders`) : null;
        } else if (name === 'productId') {
          id = cache._siteId ? await pickId(`/api/sites/${cache._siteId}/store/products`) : null;
        } else if (name === 'templateId') {
          id = cache._siteId ? await pickId(`/api/sites/${cache._siteId}/email/templates`) : null;
        } else if (name === 'typeId') {
          id = cache._siteId ? await pickId(`/api/sites/${cache._siteId}/content-types`) : null;
        }
      } else if (r.rawRoute.startsWith('/portal/branding/profiles/')) {
        id = await pickId('/api/brand-profiles', ['id']);
      } else if (r.rawRoute.startsWith('/portal/brain/knowledge')) {
        id = await pickId('/api/brain/knowledge', ['id']);
      } else if (r.rawRoute.startsWith('/portal/brain/communications')) {
        id = await pickId('/api/brain/communications', ['id']);
      } else if (r.rawRoute.startsWith('/portal/brain/relationships')) {
        id = await pickId('/api/brain/relationships', ['id']);
      } else if (r.rawRoute.startsWith('/portal/crm/companies')) {
        id = await pickId('/api/crm/companies', ['id']);
      } else if (r.rawRoute.startsWith('/portal/crm/contacts')) {
        id = await pickId('/api/crm/contacts', ['id']);
      } else if (r.rawRoute.startsWith('/portal/crm/proposals')) {
        id = await pickId('/api/crm/proposals', ['id']);
      } else if (r.rawRoute.startsWith('/portal/crm/contracts')) {
        id = await pickId('/api/crm/contracts', ['id']);
      } else if (r.rawRoute.startsWith('/portal/email/campaigns')) {
        id = await pickId('/api/email/campaigns', ['id']);
      } else if (r.rawRoute.startsWith('/portal/automations/workflows')) {
        id = await pickId('/api/automations/workflows', ['id']);
      } else if (r.rawRoute.startsWith('/portal/tools/pitch-decks')) {
        id = await pickId('/api/pitch-decks', ['id']);
      } else if (r.rawRoute.startsWith('/portal/tools/booking')) {
        id = await pickId('/api/booking/pages', ['id']);
      } else if (r.rawRoute.startsWith('/portal/hosting')) {
        id = await pickId('/api/hosting', ['id']);
      } else if (r.rawRoute.startsWith('/portal/surveys')) {
        id = await pickId('/api/surveys', ['id']);
      } else if (r.rawRoute.startsWith('/portal/projects')) {
        id = await pickId('/api/projects', ['id']);
      } else if (r.rawRoute.startsWith('/portal/experiments')) {
        id = await pickId('/api/experiments', ['id']);
      } else if (r.rawRoute.startsWith('/portal/tickets')) {
        id = await pickId('/api/tickets', ['id']);
      } else if (r.rawRoute.startsWith('/portal/invoices')) {
        id = await pickId('/api/invoices', ['id']);
      } else if (r.rawRoute.startsWith('/portal/inbox/widgets')) {
        id = await pickId('/api/inbox/widgets', ['id']);
      } else if (r.rawRoute.startsWith('/portal/inbox')) {
        id = await pickId('/api/inbox', ['id']);
      } else if (r.rawRoute.startsWith('/portal/suggested-projects')) {
        id = await pickId('/api/suggested-projects', ['id']);
      } else if (r.rawRoute.startsWith('/portal/apps')) {
        id = await pickId('/api/apps', ['slug', 'id']);
      }
      if (id) {
        url = url.replace(match, id);
      } else {
        stillUnresolved = true;
        break;
      }
    }

    if (stillUnresolved) {
      // Skip — no seed data to drive this route.
      continue;
    }
    resolved.push({ ...r, url, unresolved: false });
  }
  return resolved;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!existsSync(FINDINGS_DIR)) await mkdir(FINDINGS_DIR, { recursive: true });
  if (!existsSync(SHOTS_DIR)) await mkdir(SHOTS_DIR, { recursive: true });

  let routes = await discoverRoutes();

  const browser = await chromium.launch({ headless: !args.headed });
  const viewport = VIEWPORTS[args.viewport];
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport,
    deviceScaleFactor: 2,
    isMobile: args.viewport === 'phone',
    hasTouch: args.viewport === 'phone',
    userAgent: args.viewport === 'phone'
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
  });
  const page = await context.newPage();
  await login(context, page);

  const resolved = await resolveDynamicParams(context, routes);
  const filtered = args.routes
    ? resolved.filter((r) => args.routes!.some((needle) => r.rawRoute === needle || r.url === needle))
    : resolved;
  const sharded = args.shard
    ? filtered.filter((_, i) => i % args.shard!.total === args.shard!.index)
    : filtered;

  console.log(`[audit] viewport=${args.viewport} routes=${sharded.length}/${routes.length} (resolved ${resolved.length})`);

  const summary: Array<{ route: string; ok: boolean; issues: number }> = [];

  for (const r of sharded) {
    const slug = `${args.viewport}-${slugify(r.url)}`;
    const findingsPath = path.join(FINDINGS_DIR, `${slug}.json`);
    if (!args.retake && existsSync(findingsPath)) {
      const cached = JSON.parse(await import('node:fs/promises').then((m) => m.readFile(findingsPath, 'utf-8'))) as RouteFinding;
      summary.push({ route: r.url, ok: cached.ok, issues: cached.overflowingElements.length + cached.consoleErrors.length + cached.pageErrors.length });
      console.log(`[audit] ${cached.ok ? 'ok' : 'X '} ${r.url} (cached)`);
      continue;
    }
    const finding = await auditRoute(page, r.url, args.viewport);
    await writeFile(findingsPath, JSON.stringify(finding, null, 2));
    const issues = finding.overflowingElements.length + finding.consoleErrors.length + finding.pageErrors.length + (finding.horizontalOverflow ? 1 : 0);
    summary.push({ route: r.url, ok: finding.ok, issues });
    console.log(`[audit] ${finding.ok ? 'ok' : 'X '} ${r.url} (${finding.status}) overflow=${finding.horizontalOverflow ? 'YES' : 'no'} off=${finding.overflowingElements.length} tiny=${finding.tinyTapTargets.length} err=${finding.consoleErrors.length + finding.pageErrors.length} ${finding.durationMs}ms`);
  }

  // Top-level summary
  const summaryPath = path.join(FINDINGS_DIR, `__summary-${args.viewport}.json`);
  await writeFile(summaryPath, JSON.stringify(summary, null, 2));

  await browser.close();
  const failed = summary.filter((s) => !s.ok).length;
  console.log(`\n[audit] done. ${failed}/${summary.length} routes have findings.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
