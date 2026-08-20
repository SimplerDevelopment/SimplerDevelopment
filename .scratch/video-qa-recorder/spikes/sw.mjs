import http from 'node:http';
import { chromium } from 'playwright';
const P = 8903;
const srv = http.createServer((q, r) => {
  if (q.url === '/sw.js') { r.writeHead(200, {'content-type':'application/javascript'});
    return r.end(`self.addEventListener('activate', e => { e.waitUntil(fetch('/SW_ORIGINATED_PING').catch(()=>{})); });`); }
  if (q.url === '/SW_ORIGINATED_PING') { r.writeHead(200, {'content-type':'text/plain'}); return r.end('pong'); }
  r.writeHead(200, {'content-type':'text/html'});
  r.end(`<!doctype html><title>sw</title><script>navigator.serviceWorker.register('/sw.js')</script>`);
}).listen(P);

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const seen = [];
cdp.on('Network.requestWillBeSent', e => seen.push(e.request.url));
await cdp.send('Network.enable');

await page.goto(`http://localhost:${P}/`);
await page.waitForTimeout(2500);
const withoutAutoAttach = seen.some(u => u.includes('SW_ORIGINATED_PING'));

// now with autoattach to workers
const attached = [];
cdp.on('Target.attachedToTarget', e => attached.push(e.targetInfo.type + ':' + e.targetInfo.url));
await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
await page.reload();
await page.waitForTimeout(2500);

console.log('URLs seen on the PAGE session          :', JSON.stringify([...new Set(seen)], null, 1));
console.log('SW-originated fetch visible by default? :', withoutAutoAttach ? 'YES' : 'NO');
console.log('Targets attached after setAutoAttach    :', JSON.stringify(attached, null, 1));
await browser.close(); srv.close();
