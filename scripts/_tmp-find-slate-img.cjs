const https = require('https');
// try a set of candidate URLs; also fetch the live target HTML and grep for "slate" img
const candidates = [
  'https://postcaptain.com/wp-content/uploads/2024/05/slate-platinum-partner.png',
  'https://postcaptain.com/wp-content/uploads/2024/05/slate-platinum-partner-1.png',
  'https://postcaptain.com/wp-content/uploads/2024/05/slate-platinum.png',
  'https://postcaptain.com/wp-content/uploads/2025/05/slate-platinum.png',
];

function head(url) {
  return new Promise((res) => {
    const req = https.request(url, { method: 'HEAD' }, r => res({ url, status: r.statusCode, type: r.headers['content-type'] }));
    req.on('error', e => res({ url, err: e.message }));
    req.end();
  });
}

function get(url) {
  return new Promise((res) => {
    https.get(url, r => {
      let buf = '';
      r.on('data', c => buf += c);
      r.on('end', () => res({ url, status: r.statusCode, html: buf }));
    }).on('error', e => res({ url, err: e.message }));
  });
}

(async () => {
  console.log('--- Candidate HEAD checks ---');
  for (const c of candidates) {
    console.log(JSON.stringify(await head(c)));
  }
  console.log('\n--- Fetch postcaptain.com and grep for slate/platinum images ---');
  const page = await get('https://postcaptain.com/');
  if (page.status === 200) {
    const hits = [...page.html.matchAll(/https:\/\/postcaptain\.com\/wp-content\/uploads\/[^"'\s]+?(slate|platinum|partner|badge)[^"'\s]*?\.(png|jpg|jpeg|webp|svg)/gi)];
    const seen = new Set();
    hits.forEach(h => { if (!seen.has(h[0])) { seen.add(h[0]); console.log(h[0]); } });
    if (seen.size === 0) console.log('(no direct matches — doing broader search)');
    // broader
    const broader = [...page.html.matchAll(/https:\/\/postcaptain\.com\/wp-content\/uploads\/[^"'\s]+?\.(png|jpg|jpeg|webp|svg)/gi)];
    const allSeen = new Set();
    broader.forEach(h => allSeen.add(h[0]));
    console.log('\n--- All image URLs found on homepage ---');
    [...allSeen].slice(0, 40).forEach(u => console.log(u));
  } else {
    console.log('homepage fetch failed', page);
  }
})();
