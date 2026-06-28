/**
 * Refreshes the /solutions/[slug] gallery screenshots from the CURRENT running
 * app, so they all share one consistent chrome (light theme + the real portal
 * shell) instead of a mix of old-UI captures.
 *
 * Prereqs: dev server on :3000 with the seeded local DB; the seeded client user
 * onboarded (client@example.com / client123). Run:
 *   npx tsx scripts/capture-solution-screenshots.ts
 *
 * Detail screens discover the first record link from their list page. Public
 * "live-*" screens load a public URL. Anything that fails is logged and its
 * existing screenshot is left untouched.
 */
import { chromium, type Page } from 'playwright';
import * as path from 'node:path';
import * as fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.resolve('public/screenshots/solutions');
const EMAIL = process.env.CAP_EMAIL || 'client@example.com';
const PASSWORD = process.env.CAP_PASSWORD || 'client123';

type Shot =
  | { slug: string; file: string; url: string }
  | { slug: string; file: string; from: string; linkPrefix: string }; // detail: discover first link

const shots: Shot[] = [
  // agency
  { slug: 'agency', file: '01-agency', url: '/portal/agency' },
  { slug: 'agency', file: '02-branding', url: '/portal/agency/branding' },
  { slug: 'agency', file: '03-custom-domain', url: '/portal/agency/custom-domain' },
  // ai-connect (MCP)
  { slug: 'ai-connect', file: '01-api-keys', url: '/portal/settings/api-keys' },
  { slug: 'ai-connect', file: '02-approvals', url: '/portal/approvals' },
  // ai-chatbot
  { slug: 'ai-chatbot', file: '01-inbox', url: '/portal/inbox' },
  // automations
  { slug: 'automations', file: '01-workflows', url: '/portal/automations' },
  { slug: 'automations', file: '02-workflow-builder', url: '/portal/automations/workflows' },
  // booking
  { slug: 'booking', file: '01-booking-list', url: '/portal/tools/booking' },
  { slug: 'booking', file: '02-booking-calendar', url: '/portal/tools/booking/calendar' },
  { slug: 'booking', file: '03-booking-analytics', url: '/portal/tools/booking/analytics' },
  // company-brain
  { slug: 'company-brain', file: '01-brain-dashboard', url: '/portal/brain' },
  { slug: 'company-brain', file: '02-knowledge', url: '/portal/brain/knowledge/26' },
  { slug: 'company-brain', file: '03-people', url: '/portal/brain/people' },
  { slug: 'company-brain', file: '04-decisions', url: '/portal/brain/decisions' },
  { slug: 'company-brain', file: '05-org-chart', url: '/portal/brain/org-chart' },
  { slug: 'company-brain', file: '06-initiatives', url: '/portal/brain/initiatives' },
  { slug: 'company-brain', file: '07-playbooks', url: '/portal/brain/playbooks' },
  { slug: 'company-brain', file: '08-glossary', url: '/portal/brain/glossary' },
  // contracts
  { slug: 'contracts', file: '01-proposals', url: '/portal/crm/proposals' },
  { slug: 'contracts', file: '02-contracts', url: '/portal/crm/contracts' },
  { slug: 'contracts', file: '03-proposal-detail', url: '/portal/crm/proposals/1' },
  { slug: 'contracts', file: '04-contract-detail', url: '/portal/crm/contracts/30' },
  // crm
  { slug: 'crm', file: '01-crm-overview', url: '/portal/crm' },
  { slug: 'crm', file: '02-contacts', url: '/portal/crm/contacts' },
  { slug: 'crm', file: '03-deals-board', url: '/portal/crm/deals' },
  { slug: 'crm', file: '04-contact-detail', url: '/portal/crm/contacts/1' },
  // (contract/proposal details point at clean records below)
  { slug: 'crm', file: '05-companies', url: '/portal/crm/companies' },
  // email-marketing
  { slug: 'email-marketing', file: '01-email-overview', url: '/portal/email' },
  { slug: 'email-marketing', file: '02-campaigns', url: '/portal/email/campaigns' },
  { slug: 'email-marketing', file: '03-lists', url: '/portal/email/lists' },
  { slug: 'email-marketing', file: '04-analytics', url: '/portal/email/analytics' },
  { slug: 'email-marketing', file: '05-visual-editor', url: '/portal/email/campaigns/18' },
  // experiments
  { slug: 'experiments', file: '01-experiments-list', url: '/portal/experiments' },
  { slug: 'experiments', file: '02-experiment-detail', from: '/portal/experiments', linkPrefix: '/portal/experiments/' },
  // help-desk
  { slug: 'help-desk', file: '01-inbox', url: '/portal/inbox' },
  { slug: 'help-desk', file: '02-tickets', url: '/portal/tickets' },
  // hosting
  { slug: 'hosting', file: '01-hosting', url: '/portal/hosting' },
  // project-management
  { slug: 'project-management', file: '01-projects-list', url: '/portal/projects' },
  { slug: 'project-management', file: '02-project-board', url: '/portal/projects/80' },
  { slug: 'project-management', file: '03-my-tasks', url: '/portal/my-tasks' },
  // publishing
  { slug: 'publishing', file: '01-board', url: '/portal/publishing/board' },
  { slug: 'publishing', file: '02-calendar', url: '/portal/publishing/calendar' },
  { slug: 'publishing', file: '03-campaigns', url: '/portal/publishing/campaigns' },
  // surveys
  { slug: 'surveys', file: '01-surveys-list', url: '/portal/surveys' },
];

const REVEAL = `(() => { const s=document.createElement('style'); s.textContent='*{opacity:1 !important; transform:none !important; transition:none !important; animation:none !important;}'; document.head.appendChild(s); try{localStorage.setItem('theme','light')}catch(e){} document.documentElement.classList.remove('dark'); document.documentElement.style.colorScheme='light'; })()`;

// Wait for the page to be DONE loading — not a skeleton/spinner frame.
async function settle(page: Page): Promise<boolean> {
  await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
  await page.evaluate(REVEAL);
  // Block until loaders are gone AND real content (a heading) has rendered.
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
  await page.waitForTimeout(500);
  return ready;
}

async function run() {
  const browser = await chromium.launch();
  // Reuse an existing authed session (storageState exported from a logged-in
  // browser) — avoids form login against a test DB whose password was mutated.
  const AUTH_STATE = process.env.AUTH_STATE || '/tmp/sd-auth-state.json';
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // high-DPI
    storageState: fs.existsSync(AUTH_STATE) ? AUTH_STATE : undefined,
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'light'); } catch (e) {} });
  const page = await ctx.newPage();

  if (fs.existsSync(AUTH_STATE)) {
    await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'domcontentloaded' });
    if (/\/login/.test(page.url())) throw new Error('session expired — re-export AUTH_STATE');
  } else {
    await page.goto(`${BASE}/portal/login`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('you@company.com').fill(EMAIL);
    await page.getByPlaceholder('••••••••').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(4000);
    if (/\/login/.test(page.url())) throw new Error('login failed and no AUTH_STATE present');
  }
  console.log('authed:', page.url());

  const FILTER = process.env.FILTER; // comma list of "slug/file" substrings to limit the run
  const todo = FILTER ? shots.filter((s) => FILTER.split(',').some((f) => `${s.slug}/${s.file}`.includes(f.trim()))) : shots;
  let ok = 0; const fails: string[] = []; const notReady: string[] = [];
  for (const shot of todo) {
    const dest = path.join(OUT, shot.slug, `${shot.file}.png`);
    try {
      let url = '';
      if ('url' in shot) {
        url = shot.url;
      } else {
        await page.goto(`${BASE}${shot.from}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        const before = page.url();
        // 1) an id-like record anchor inside <main> (skips sidebar/tab nav links)
        const href = await page.evaluate((p) => {
          const a = Array.from(document.querySelectorAll('main a[href]'))
            .map((el) => el.getAttribute('href') || '')
            .find((h) => h.startsWith(p) && /\/(\d+|[0-9a-f]{8}[0-9a-f-]+)$/.test(h));
          return a || null;
        }, shot.linkPrefix);
        if (href) {
          await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
        } else {
          // 2) click the first data row / list item (router.push navigation)
          const row = page.locator('main tbody tr, main [role="row"], main li a, main button[class*="row"]').first();
          if (!(await row.count())) throw new Error(`no record row under ${shot.from}`);
          await row.click().catch(() => {});
          await page.waitForURL((u) => u.toString() !== before, { timeout: 8000 }).catch(() => {});
          if (page.url() === before) throw new Error(`row click did not navigate from ${shot.from}`);
        }
        url = page.url().replace(BASE, '');
      }
      if (url.startsWith('http') || !('from' in shot)) {
        await page.goto(`${BASE}${url.startsWith('http') ? url.replace(BASE, '') : url}`, { waitUntil: 'domcontentloaded', timeout: 55000 });
      }
      // bounced to onboarding/login => bad
      if (/\/onboarding|\/login/.test(page.url())) throw new Error(`redirected to ${page.url()}`);
      const ready = await settle(page);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await page.screenshot({ path: dest });
      ok++;
      if (!ready) notReady.push(`${shot.slug}/${shot.file}`);
      console.log(`  ${ready ? '✓' : '⚠'} ${shot.slug}/${shot.file}  (${url})`);
    } catch (e) {
      fails.push(`${shot.slug}/${shot.file}: ${(e as Error).message}`);
      console.log(`  ✗ ${shot.slug}/${shot.file}: ${(e as Error).message}`);
    }
  }
  await browser.close();
  console.log(`\n>> captured ${ok}/${todo.length}`);
  if (notReady.length) console.log('⚠ NOT-READY (verify these aren’t loading frames):\n' + notReady.map((f) => '  - ' + f).join('\n'));
  if (fails.length) console.log('FAILED:\n' + fails.map((f) => '  - ' + f).join('\n'));
}

run().catch((e) => { console.error(e); process.exit(1); });
