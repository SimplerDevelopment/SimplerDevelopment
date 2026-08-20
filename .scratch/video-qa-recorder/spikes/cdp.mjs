import http from 'node:http';
import { chromium } from 'playwright';

const A = 8901, B = 8902;
const big = 'X'.repeat(600_000);

const srvA = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html' });
  r.end('<!doctype html><title>origin A</title><body>A</body>');
}).listen(A);

const srvB = http.createServer((q, r) => {
  const u = q.url;
  if (q.method === 'OPTIONS') {           // preflight: deliberately refuse
    r.writeHead(403, { 'content-type': 'text/plain' });
    return r.end('PREFLIGHT_DENIED_BODY');
  }
  if (u === '/nocors')   { r.writeHead(200, {'content-type':'text/plain'}); return r.end('SECRET_BODY_NOCORS'); }
  if (u === '/put')      { r.writeHead(200, {'content-type':'text/plain'}); return r.end('SECRET_BODY_PUT'); }
  if (u === '/e404')     { r.writeHead(404, {'content-type':'text/plain','access-control-allow-origin':'*'}); return r.end('SECRET_BODY_404'); }
  if (u === '/e500')     { r.writeHead(500, {'content-type':'text/plain','access-control-allow-origin':'*'}); return r.end('SECRET_BODY_500'); }
  if (u === '/big')      { r.writeHead(200, {'content-type':'text/plain','access-control-allow-origin':'*'}); return r.end(big); }
  r.writeHead(404); r.end('nope');
}).listen(B);

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

const reqs = new Map();      // requestId -> {url, status, phase}
const netStamps = [], rtStamps = [], logs = [];

cdp.on('Network.requestWillBeSent', e => reqs.set(e.requestId, { url: e.request.url, phase: 'sent', wallTime: e.wallTime, timestamp: e.timestamp }));
cdp.on('Network.responseReceived', e => { const r = reqs.get(e.requestId) || {}; r.status = e.response.status; r.phase = 'response'; reqs.set(e.requestId, r);
  netStamps.push({ url: e.response.url, timestamp: e.timestamp }); });
cdp.on('Network.loadingFailed', e => { const r = reqs.get(e.requestId) || {}; r.phase = 'failed'; r.errorText = e.errorText; r.corsError = e.corsErrorStatus?.corsError; reqs.set(e.requestId, r); });
cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) r.phase = r.phase === 'failed' ? 'failed' : 'finished'; });
cdp.on('Runtime.consoleAPICalled', e => rtStamps.push({ ts: e.timestamp, arg: e.args?.[0]?.value }));
cdp.on('Log.entryAdded', e => logs.push({ source: e.entry.source, level: e.entry.level, text: e.entry.text.slice(0, 90), ts: e.entry.timestamp }));

await cdp.send('Network.enable');
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
await cdp.send('Page.enable');

// does Network.configureDurableMessages exist at all?
let durable;
try { await cdp.send('Network.configureDurableMessages', { enabled: true }); durable = 'ACCEPTED'; }
catch (e) { durable = 'REJECTED: ' + e.message.split('\n')[0]; }

await page.goto(`http://localhost:${A}/`);

// fire the requests
await page.evaluate(async (B) => {
  const swallow = p => p.then(r => r.text()).catch(e => 'ERR:' + e.message);
  await swallow(fetch(`http://localhost:${B}/nocors`));                                  // CORS-blocked (no ACAO)
  await swallow(fetch(`http://localhost:${B}/put`, { method:'PUT', headers:{'x-custom':'1'} })); // preflight denied
  await swallow(fetch(`http://localhost:${B}/e404`));
  await swallow(fetch(`http://localhost:${B}/e500`));
  await swallow(fetch(`http://localhost:${B}/big`));
  console.log('MARKER_FOR_TIMEBASE');
}, B);

// CSP violation, to see if CDP Log reports it
await page.setContent(`<meta http-equiv="Content-Security-Policy" content="script-src 'none'"><script>window.x=1</script>`, { waitUntil: 'load' }).catch(()=>{});
await page.waitForTimeout(600);

const tryBody = async (id) => {
  try { const r = await cdp.send('Network.getResponseBody', { requestId: id }); return `OK len=${r.body.length}`; }
  catch (e) { return 'FAIL: ' + e.message.split('\n')[0].replace(/^Protocol error \(Network.getResponseBody\): /, ''); }
};

console.log('\n=== durable messages ===\n' + durable);
console.log('\n=== BEFORE NAVIGATION ===');
const before = [];
for (const [id, r] of reqs) {
  if (!r.url?.includes(`:${B}/`)) continue;
  const res = await tryBody(id);
  before.push([id, r]);
  console.log(`${r.url.padEnd(34)} phase=${String(r.phase).padEnd(9)} status=${r.status ?? '-'} err=${r.errorText ?? r.corsError ?? '-'} => ${res}`);
}

await page.goto(`http://localhost:${A}/?second`);
await page.waitForTimeout(400);
console.log('\n=== AFTER NAVIGATION (same requestIds) ===');
for (const [id, r] of before) console.log(`${r.url.padEnd(34)} => ${await tryBody(id)}`);

console.log('\n=== TIMEBASE (the trap) ===');
console.log('Network.responseReceived timestamp :', netStamps[0]?.timestamp);
console.log('Runtime.consoleAPICalled timestamp :', rtStamps.find(r=>r.arg==='MARKER_FOR_TIMEBASE')?.ts);
console.log('Log.entryAdded timestamp           :', logs[0]?.ts);
console.log('Date.now()                         :', Date.now());
console.log('requestWillBeSent wallTime         :', [...reqs.values()][0]?.wallTime);

console.log('\n=== CSP / Log.entryAdded entries ===');
for (const l of logs.slice(0, 8)) console.log(`[${l.source}/${l.level}] ${l.text}`);

await browser.close(); srvA.close(); srvB.close();
