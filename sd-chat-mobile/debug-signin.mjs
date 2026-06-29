// Debug the mobile sign-in flow in a real browser.
// Run with:
//   EMAIL=you@example.com PASSWORD='your-password' node debug-signin.mjs
// Output: every request, every response status, every console message.
import { chromium } from 'playwright';

const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Set EMAIL and PASSWORD env vars first.');
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const requests = [];
page.on('request', (req) => {
  if (req.url().includes('/api/portal/')) {
    requests.push({
      kind: 'request',
      method: req.method(),
      url: req.url(),
      headers: req.headers(),
      postData: req.postData()?.slice(0, 200),
    });
  }
});
page.on('response', async (res) => {
  const url = res.url();
  if (url.includes('/api/portal/')) {
    let body = '';
    try {
      const text = await res.text();
      body = text.slice(0, 400);
    } catch {}
    requests.push({
      kind: 'response',
      status: res.status(),
      url,
      hasAuthEcho: Object.keys(res.headers()).filter((h) => h.includes('access-control')).join(','),
      body,
    });
  }
});
page.on('console', (msg) => {
  const txt = msg.text();
  if (txt.startsWith('[api]') || txt.startsWith('[auth]') || txt.startsWith('[mcp-auth]')) {
    console.log(`[browser-console:${msg.type()}] ${txt}`);
  }
});

console.log('Navigating to http://localhost:8081 …');
await page.goto('http://localhost:8081', { waitUntil: 'networkidle' });

console.log('Tap Sign in …');
await page.getByText('Sign in', { exact: true }).first().click();
await page.waitForTimeout(800);

console.log('Filling form …');
await page.getByPlaceholder(/example\.com|email/i).fill(EMAIL);
await page.getByPlaceholder(/[•·]/).or(page.locator('input[type="password"]')).fill(PASSWORD);
await page.waitForTimeout(300);

console.log('Submitting …');
await page.getByText('Sign in', { exact: true }).last().click();

// Watch for 8 s — long enough to see sign-in + the post-redirect bounce
await page.waitForTimeout(8000);

console.log('\n========== NETWORK TRACE ==========');
for (const r of requests) {
  if (r.kind === 'request') {
    const authHdr = r.headers.authorization || r.headers.Authorization;
    const authNote = authHdr ? `Authorization: ${authHdr.slice(0, 28)}…` : 'NO Authorization';
    console.log(`  → ${r.method} ${r.url}  [${authNote}]`);
    if (r.postData) console.log(`     body: ${r.postData.replace(/("password":")[^"]+/, '$1***')}`);
  } else {
    console.log(`  ← ${r.status} ${r.url}`);
    if (r.body) console.log(`     body: ${r.body}`);
  }
}

console.log('\n========== LOCALSTORAGE TOKEN ==========');
const tokenSnapshot = await page.evaluate(() => {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.includes('auth')) out[k] = (localStorage.getItem(k) || '').slice(0, 60) + '…';
  }
  return out;
});
console.log(JSON.stringify(tokenSnapshot, null, 2));

console.log('\n========== FINAL URL ==========');
console.log(page.url());

await browser.close();
