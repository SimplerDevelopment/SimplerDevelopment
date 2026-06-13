import { readFileSync } from 'fs';
let html = readFileSync(process.argv[2],'utf8')
  .replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
const dec = s => s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&rsquo;|&lsquo;/g,"'").replace(/&ldquo;|&rdquo;|&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/&mdash;/g,'—').replace(/&ndash;/g,'–').replace(/&[a-z]+;/g,' ').replace(/\s+/g,' ').trim();
// find elements whose class matches one of the target classes, grab balanced-ish inner text (shallow: up to next same-depth close is hard with regex; instead grab until the next element of an interesting class OR a reasonable text run)
const classes = process.argv.slice(3);
for (const cls of classes) {
  const re = new RegExp(`<(\\w+)[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`,'gi');
  let m; const vals=[];
  while ((m = re.exec(html))) {
    // take next 600 chars, strip tags, but cut at the next occurrence of a div with class to avoid bleed
    let chunk = html.slice(re.lastIndex, re.lastIndex+700);
    chunk = chunk.split(/<div[^>]*class="/i)[0];
    const t = dec(chunk);
    if (t) vals.push(t.slice(0,300));
  }
  if (vals.length) { console.log(`\n[.${cls}] (${vals.length})`); vals.forEach((v,i)=>console.log(`  ${i+1}. ${v}`)); }
}
