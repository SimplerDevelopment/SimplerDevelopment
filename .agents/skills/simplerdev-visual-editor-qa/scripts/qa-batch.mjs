// Batch evidence capture (v2). Selects each card's block from the canvas iframe, then
// FORCES the requested main tab (Content/Style) via an in-page click on the exact tab
// button, screenshots the panel, and dumps its controls. Verdicts judged from evidence.
//   OUT=… node .agents/skills/simplerdev-visual-editor-qa/scripts/qa-batch2.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const EMAIL = process.env.EMAIL || 'simplerdevelopment@simplerdevelopment.com';
const PASSWORD = process.env.PASSWORD || 'veqa-local-123';
const SITE = Number(process.env.SITE || 241), POST = Number(process.env.POST || 2007);
const OUT = process.env.OUT || './veqa-batch2';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[batch]', ...a);

const CARDS = [
  { sku: 'VEQA-053', sel: { text: 'console.log' }, tab: 'Content', note: 'code Language field is a dropdown/select' },
  { sku: 'VEQA-069', sel: { text: 'Card 1' }, tab: 'Content', note: 'card-grid columns selectable up to 12' },
  { sku: 'VEQA-047', sel: { img: 'sample landscape' }, tab: 'Content', note: 'image Width NOT on Content (moved to Style)' },
  { sku: 'VEQA-062', sel: { text: 'Scrolling headline' }, tab: 'Content', note: 'marquee icon field is a picker' },
  { sku: 'VEQA-060', sel: { text: 'Scrolling headline' }, tab: 'Content', note: 'marquee segments collapsible + duplicatable' },
  { sku: 'VEQA-050', sel: { img: 'a' }, tab: 'Content', note: 'gallery 2-3 default images + duplicate-image' },
  { sku: 'VEQA-056', sel: { text: 'Question one' }, tab: 'Content', note: 'accordion content is rich text' },
  { sku: 'VEQA-045', sel: { text: 'This platform ships' }, tab: 'Content', note: 'quote author/citation rich text' },
  { sku: 'VEQA-074', sel: { text: 'Retention' }, tab: 'Content', note: 'metric-card footer-text wording + media (not institution)' },
  { sku: 'VEQA-057', sel: { text: 'Tab One' }, tab: 'Style', note: 'tabs Style sub-tabs (Block/Tab Bar/Active Tab/Content Area)' },
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const { csrfToken } = await (await ctx.request.get(`${BASE}/api/auth/csrf`)).json();
await ctx.request.post(`${BASE}/api/auth/callback/credentials`, { form: { email: EMAIL, password: PASSWORD, csrfToken, json: 'true' } });
const page = await ctx.newPage();
await page.goto(`${BASE}/portal/websites/${SITE}/posts/${POST}/edit`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(9000);
const fl = page.frameLocator('iframe').first();

const clickTab = (name) => page.evaluate((tabName) => {
  const tabs = [...document.querySelectorAll('button,[role="tab"],a')]
    .filter(el => el.getBoundingClientRect().left > 1130 && (el.textContent || '').trim() === tabName);
  if (!tabs.length) return { clicked: false };
  tabs[0].click();
  return { clicked: true };
}, name);
const panelTitle = () => page.evaluate(() => {
  const h = [...document.querySelectorAll('h1,h2,h3')].filter(el => el.getBoundingClientRect().left > 1130 && el.getBoundingClientRect().width > 0);
  return (h[0]?.textContent || '').trim();
});
const dumpPanel = () => page.evaluate(() => {
  const els = [...document.querySelectorAll('button,select,input,textarea,label,[role="tab"],[contenteditable],h2,h3,summary')];
  const out = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.left < 1130 || r.width === 0 || r.height === 0) continue;
    const tag = el.tagName.toLowerCase();
    const ce = el.getAttribute('contenteditable') === 'true' ? ':editable' : '';
    const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 36);
    if (t || tag === 'select' || tag === 'input' || tag === 'textarea') out.push(`${tag}${el.type ? ':' + el.type : ''}${ce}｜${t}`);
  }
  return [...new Set(out)].slice(0, 50);
});

const results = {};
for (const c of CARDS) {
  try {
    const loc = c.sel.text ? fl.getByText(c.sel.text, { exact: false }).first() : fl.locator(`img[alt="${c.sel.img}"]`).first();
    await loc.click({ timeout: 6000 });
    await page.waitForTimeout(800);
    const title = await panelTitle();
    const tab = await clickTab(c.tab);
    await page.waitForTimeout(700);
    const dir = `${OUT}/${c.sku}`; fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: `${dir}/panel.png`, clip: { x: 1128, y: 40, width: 312, height: 950 } });
    const panel = await dumpPanel();
    results[c.sku] = { note: c.note, wantTab: c.tab, tabClicked: tab.clicked, selectedTitle: title, panel };
    log(c.sku, `sel="${title}"`, tab.clicked ? `tab:${c.tab}` : `tab:${c.tab}!`, JSON.stringify(panel).slice(0, 240));
  } catch (e) {
    results[c.sku] = { note: c.note, error: String(e).slice(0, 90) };
    log(c.sku, 'ERR', String(e).slice(0, 80));
  }
}
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
await ctx.close(); await browser.close();
log('done ->', OUT);
