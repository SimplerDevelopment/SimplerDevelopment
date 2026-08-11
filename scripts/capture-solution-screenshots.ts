/**
 * Refreshes the /solutions/[slug] gallery screenshots from the CURRENT running
 * app, so they all share one consistent chrome (light theme + the real portal
 * shell) at one consistent resolution (1440x900 @2x).
 *
 * These images are PUBLIC MARKETING on simplerdevelopment.com. A screenshot that
 * shows an empty state, a loading frame, seeded e2e fixture junk, or a localhost
 * URL is worse than no screenshot at all — so every capture is audited before it
 * is written to disk, and a failing audit REJECTS the shot and leaves the
 * existing file untouched. Run with AUDIT=off only to debug the capture itself.
 *
 * Prereqs: dev server on :3000 against a populated demo tenant (see
 * scripts/seed-demo-showcase.ts), and an authed session:
 *   AUTH_STATE=/tmp/sd-auth-state.json npx tsx scripts/capture-solution-screenshots.ts
 *
 * Useful env:
 *   FILTER=crm,booking     only capture matching "slug/file" entries
 *   AUDIT=off              write shots even if they fail the quality audit
 *   BASE_URL=...           default http://localhost:3000
 */
import { chromium, type Page } from 'playwright';
import sharp from 'sharp';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { auditText, type Violation } from '../lib/screenshots/audit';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.resolve('public/screenshots/solutions');
const EMAIL = process.env.CAP_EMAIL || 'client@example.com';
const PASSWORD = process.env.CAP_PASSWORD || 'client123';
const AUDIT_ON = process.env.AUDIT !== 'off';
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT || 240000); // dev compiles routes on demand

type Shot = {
  slug: string;
  file: string;
  /** Path under BASE. `{siteId}` is substituted with the first live site. */
  url?: string;
  /** Detail screens: open `from`, then follow the first record link. */
  from?: string;
  linkPrefix?: string;
  /** Public (unauthenticated) page — capture without portal chrome. */
  public?: boolean;
  /** Skip the empty-state audit for a screen that is legitimately a form. */
  allowEmpty?: boolean;
  /** Click this selector once the page has settled, then re-settle and shoot. */
  clickBefore?: string;
};

const shots: Shot[] = [
  // agency — must be captured on a tenant with white-label CONFIGURED
  { slug: 'agency', file: '01-agency', url: '/portal/agency' },
  { slug: 'agency', file: '02-branding', url: '/portal/agency/branding', allowEmpty: true },
  { slug: 'agency', file: '03-custom-domain', url: '/portal/agency/custom-domain', allowEmpty: true },
  // ai-connect (MCP)
  { slug: 'ai-connect', file: '01-api-keys', url: '/portal/settings/api-keys' },
  { slug: 'ai-connect', file: '02-approvals', url: '/portal/approvals' },
  // ai-chatbot — distinct from help-desk: widget settings + a real conversation
  { slug: 'ai-chatbot', file: '01-inbox', url: '/portal/inbox' },
  { slug: 'ai-chatbot', file: '02-widgets', from: '/portal/inbox', linkPrefix: '/portal/inbox/widgets/' },
  // automations
  { slug: 'automations', file: '01-workflows', url: '/portal/automations' },
  // 02-workflow-builder is deliberately absent: the ReactFlow canvas does not
  // fitView on load, so nodes photograph stacked off-screen, and the page carries
  // a "Beta — workflows do not execute yet" banner that no marketing shot wants.
  // booking
  { slug: 'booking', file: '01-booking-list', url: '/portal/tools/booking' },
  { slug: 'booking', file: '02-booking-calendar', url: '/portal/tools/booking/calendar' },
  { slug: 'booking', file: '03-booking-analytics', url: '/portal/tools/booking/analytics' },
  { slug: 'booking', file: '04-live-booking', url: '/book/strategy-call', public: true },
  // company-brain — 4 populated screens beat 9 with 6 empties
  { slug: 'company-brain', file: '01-brain-dashboard', url: '/portal/brain' },
  { slug: 'company-brain', file: '02-knowledge', from: '/portal/brain/knowledge', linkPrefix: '/portal/brain/knowledge/' },
  { slug: 'company-brain', file: '03-people', url: '/portal/brain/people' },
  { slug: 'company-brain', file: '04-decisions', url: '/portal/brain/decisions' },
  { slug: 'company-brain', file: '05-org-chart', url: '/portal/brain/org-chart' },
  { slug: 'company-brain', file: '06-initiatives', url: '/portal/brain/initiatives' },
  { slug: 'company-brain', file: '07-playbooks', url: '/portal/brain/playbooks' },
  { slug: 'company-brain', file: '08-glossary', url: '/portal/brain/glossary' },
  // contracts
  { slug: 'contracts', file: '01-proposals', url: '/portal/crm/proposals' },
  { slug: 'contracts', file: '02-contracts', url: '/portal/crm/contracts' },
  { slug: 'contracts', file: '03-proposal-detail', from: '/portal/crm/proposals', linkPrefix: '/portal/crm/proposals/' },
  { slug: 'contracts', file: '04-contract-detail', from: '/portal/crm/contracts', linkPrefix: '/portal/crm/contracts/' },
  // crm
  { slug: 'crm', file: '01-crm-overview', url: '/portal/crm' },
  { slug: 'crm', file: '02-contacts', url: '/portal/crm/contacts' },
  { slug: 'crm', file: '03-deals-board', url: '/portal/crm/deals' },
  { slug: 'crm', file: '04-contact-detail', from: '/portal/crm/contacts', linkPrefix: '/portal/crm/contacts/' },
  // Table view, not the default Map: the map panel pulls OpenStreetMap tiles,
  // which do not reliably load in headless capture and photograph as a large
  // grey rectangle. The table shows the same data with no third-party dependency.
  { slug: 'crm', file: '05-companies', url: '/portal/crm/companies', clickBefore: 'button[title="Table view"]' },
  // ecommerce — previously captured outside this pipeline at 1x, hence the
  // mismatched legacy chrome in the old gallery.
  { slug: 'ecommerce', file: '01-products', url: '/portal/websites/{siteId}/store/products' },
  { slug: 'ecommerce', file: '02-orders', url: '/portal/websites/{siteId}/store/orders' },
  { slug: 'ecommerce', file: '03-product-detail', from: '/portal/websites/{siteId}/store/products', linkPrefix: '/portal/websites/' },
  // email-marketing
  { slug: 'email-marketing', file: '01-email-overview', url: '/portal/email' },
  { slug: 'email-marketing', file: '02-campaigns', url: '/portal/email/campaigns' },
  { slug: 'email-marketing', file: '03-lists', url: '/portal/email/lists' },
  { slug: 'email-marketing', file: '04-analytics', url: '/portal/email/analytics' },
  // experiments
  { slug: 'experiments', file: '01-experiments-list', url: '/portal/experiments' },
  { slug: 'experiments', file: '02-experiment-detail', from: '/portal/experiments', linkPrefix: '/portal/experiments/' },
  // help-desk
  { slug: 'help-desk', file: '01-tickets', url: '/portal/tickets' },
  { slug: 'help-desk', file: '02-ticket-detail', from: '/portal/tickets', linkPrefix: '/portal/tickets/' },
  // hosting
  { slug: 'hosting', file: '01-hosting', url: '/portal/hosting' },
  // pitch-decks
  { slug: 'pitch-decks', file: '01-decks-list', url: '/portal/tools/pitch-decks' },
  { slug: 'pitch-decks', file: '02-deck-detail', from: '/portal/tools/pitch-decks', linkPrefix: '/portal/tools/pitch-decks/' },
  // project-management
  { slug: 'project-management', file: '01-projects-list', url: '/portal/projects' },
  { slug: 'project-management', file: '02-project-board', from: '/portal/projects', linkPrefix: '/portal/projects/' },
  { slug: 'project-management', file: '03-my-tasks', url: '/portal/my-tasks' },
  // publishing
  { slug: 'publishing', file: '01-board', url: '/portal/publishing/board' },
  { slug: 'publishing', file: '02-calendar', url: '/portal/publishing/calendar' },
  { slug: 'publishing', file: '03-campaigns', url: '/portal/publishing/campaigns' },
  // surveys
  { slug: 'surveys', file: '01-surveys-list', url: '/portal/surveys' },
  { slug: 'surveys', file: '02-survey-detail', from: '/portal/surveys', linkPrefix: '/portal/surveys/' },
  // websites
  { slug: 'websites', file: '01-websites', url: '/portal/websites' },
  { slug: 'websites', file: '02-site-entries', url: '/portal/websites/{siteId}/entries' },
];

const REVEAL = `(() => {
  const s=document.createElement('style');
  // Freeze animations so nothing is caught mid-transition, and hide the Next.js
  // dev overlay — a "Compiling..." badge photographed into a marketing shot is
  // exactly the kind of artifact this gallery must never ship.
  s.textContent='*{opacity:1 !important; transform:none !important; transition:none !important; animation:none !important;}'
    + 'nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-tools-button],#__next-build-watcher,[data-nextjs-build-indicator]{display:none !important;}'
    + '[data-testid="get-started-checklist"]{display:none !important;}';
  document.head.appendChild(s);
  try{localStorage.setItem('theme','light')}catch(e){}
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme='light';
})()`;

/* ------------------------------------------------------------------ */
/*  Quality audit — rules live in lib/screenshots/audit.ts so they are          */
/*  unit-tested against the real strings that shipped (see                      */
/*  tests/unit/screenshot-audit.test.ts). A gate that silently stops matching   */
/*  looks exactly like a clean run.                                             */
/* ------------------------------------------------------------------ */

async function audit(page: Page, shot: Shot): Promise<Violation[]> {
  const { text, iconFontLoaded } = await page.evaluate(() => {
    const root = (document.querySelector('main') || document.body) as HTMLElement;
    // Icon <span>s carry their ligature name as text whether or not the font
    // rendered, so strip them from the audited copy and check the font itself.
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.material-icons, .material-symbols-outlined').forEach((n) => n.remove());
    // The get-started checklist says "Create your first survey" even when the
    // page below it is full of real surveys — auditing it produces a false
    // empty-state. It's also onboarding chrome no marketing shot wants.
    clone.querySelectorAll('[data-testid="get-started-checklist"]').forEach((n) => n.remove());
    return {
      text: clone.innerText || '',
      iconFontLoaded: document.fonts.check('24px "Material Icons"'),
    };
  });

  const violations = auditText(text, { allowEmpty: shot.allowEmpty });
  if (!iconFontLoaded) {
    violations.push({ kind: 'icon font failed to load', match: 'Material Icons' });
  }
  return violations;
}

/** Wait for the page to be DONE loading — not a skeleton/spinner frame. */
async function settle(page: Page): Promise<boolean> {
  await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
  await page.evaluate(REVEAL);
  const ready = await page
    .waitForFunction(
      () => {
        const loader = document.querySelector(
          '[class*="skeleton" i], [class*="animate-pulse"], [class*="animate-spin"], [role="progressbar"], [aria-busy="true"], .spinner, .loading'
        );
        const heading = document.querySelector('main h1, main h2, h1, h2');
        return !loader && !!heading;
      },
      { timeout: 9000 }
    )
    .then(() => true)
    .catch(() => false);
  // Let webfonts settle so icon ligatures never photograph as raw text.
  await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready).catch(() => {});
  await page.waitForTimeout(500);
  return ready;
}

/** Manifest expects .webp; Playwright only writes png/jpeg. */
async function writeWebp(png: Buffer, dest: string): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await sharp(png).webp({ quality: 82 }).toFile(dest);
}

async function run() {
  const browser = await chromium.launch();
  const AUTH_STATE = process.env.AUTH_STATE || '/tmp/sd-auth-state.json';
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // uniform 2x — the old gallery mixed 1x and 2x
    storageState: fs.existsSync(AUTH_STATE) ? AUTH_STATE : undefined,
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'light'); } catch (e) {} });
  const page = await ctx.newPage();

  if (fs.existsSync(AUTH_STATE)) {
    await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'domcontentloaded' });
    if (/\/login/.test(page.url())) throw new Error('session expired — re-export AUTH_STATE');
  } else {
    await page.goto(`${BASE}/portal/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    // Drive Auth.js directly rather than filling the form and clicking.
    // The login page is a client component using signIn() inside an onSubmit
    // handler on a <form method="post">. Against a cold dev server the JS
    // bundle compiles on demand, so a scripted click lands BEFORE React
    // hydrates: preventDefault never runs, the browser does a native POST to
    // /portal/login, and you get a 200 with no session and no error message.
    const res = await page.evaluate(
      async ([email, password]) => {
        const { csrfToken } = await (await fetch('/api/auth/csrf')).json();
        const r = await fetch('/api/auth/callback/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ csrfToken, email, password, totpCode: '', redirect: 'false', json: 'true' }),
        });
        const session = await (await fetch('/api/auth/session')).json();
        return { status: r.status, user: session?.user?.email ?? null };
      },
      [EMAIL, PASSWORD],
    );
    if (!res.user) throw new Error(`login failed (callback ${res.status}) and no AUTH_STATE present`);
    await ctx.storageState({ path: AUTH_STATE });
    await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  }
  console.log('authed:', page.url());

  // Resolve the first live site once, for {siteId} templates.
  let siteId = process.env.SITE_ID || '';
  if (!siteId) {
    await page.goto(`${BASE}/portal/websites`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    siteId = (await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a[href*="/portal/websites/"]'))
        .map((el) => el.getAttribute('href') || '')
        .find((h) => /\/portal\/websites\/\d+/.test(h));
      return a ? (a.match(/\/portal\/websites\/(\d+)/) || [])[1] || '' : '';
    })) || '';
  }
  console.log('siteId:', siteId || '(none — {siteId} shots will be skipped)');

  const FILTER = process.env.FILTER;
  const todo = FILTER
    ? shots.filter((s) => FILTER.split(',').some((f) => `${s.slug}/${s.file}`.includes(f.trim())))
    : shots;

  let ok = 0;
  const fails: string[] = [];
  const rejected: string[] = [];
  const notReady: string[] = [];

  for (const shot of todo) {
    const dest = path.join(OUT, shot.slug, `${shot.file}.webp`);
    const label = `${shot.slug}/${shot.file}`;
    try {
      let url: string;
      if (shot.url) {
        if (shot.url.includes('{siteId}')) {
          if (!siteId) throw new Error('no site available for {siteId}');
          url = shot.url.replace('{siteId}', siteId);
        } else {
          url = shot.url;
        }
        await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      } else {
        const from = (shot.from || '').replace('{siteId}', siteId);
        if (from.includes('{siteId}')) throw new Error('no site available for {siteId}');
        await page.goto(`${BASE}${from}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        const before = page.url();
        const href = await page.evaluate((p) => {
          const a = Array.from(document.querySelectorAll('main a[href]'))
            .map((el) => el.getAttribute('href') || '')
            .find((h) => h.startsWith(p) && /\/(\d+|[0-9a-f]{8}[0-9a-f-]+)$/.test(h));
          return a || null;
        }, shot.linkPrefix);
        if (href) {
          await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
        } else {
          const row = page.locator('main tbody tr, main [role="row"], main li a, main button[class*="row"]').first();
          if (!(await row.count())) throw new Error(`no record row under ${from}`);
          await row.click().catch(() => {});
          await page.waitForURL((u) => u.toString() !== before, { timeout: 8000 }).catch(() => {});
          if (page.url() === before) throw new Error(`row click did not navigate from ${from}`);
        }
        url = page.url().replace(BASE, '');
      }

      if (/\/onboarding|\/login/.test(page.url())) throw new Error(`redirected to ${page.url()}`);
      let ready = await settle(page);
      if (shot.clickBefore) {
        await page.locator(shot.clickBefore).first().click({ timeout: 15000 }).catch(() => {});
        ready = await settle(page);
      }

      const violations = AUDIT_ON ? await audit(page, shot) : [];
      if (violations.length) {
        rejected.push(`${label}: ${violations.map((v) => `${v.kind} ("${v.match}")`).join(', ')}`);
        console.log(`  ✗ REJECTED ${label} — ${violations.map((v) => v.kind).join(', ')}`);
        continue; // leave the existing file untouched
      }

      await writeWebp(await page.screenshot(), dest);
      ok++;
      if (!ready) notReady.push(label);
      console.log(`  ${ready ? '✓' : '⚠'} ${label}  (${url})`);
    } catch (e) {
      fails.push(`${label}: ${(e as Error).message}`);
      console.log(`  ✗ ${label}: ${(e as Error).message}`);
    }
  }
  await browser.close();

  console.log(`\n>> captured ${ok}/${todo.length}`);
  if (notReady.length) console.log('⚠ NOT-READY (verify these aren’t loading frames):\n' + notReady.map((f) => '  - ' + f).join('\n'));
  if (rejected.length) {
    console.log(`\n✗ REJECTED BY AUDIT (${rejected.length}) — fix the DATA, then re-run:\n` + rejected.map((f) => '  - ' + f).join('\n'));
  }
  if (fails.length) console.log(`\nFAILED (${fails.length}):\n` + fails.map((f) => '  - ' + f).join('\n'));

  // A rejected shot means the gallery would have shipped junk. Fail the run so
  // CI / the operator can't mistake a partial capture for a good one.
  if (rejected.length || fails.length) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
