import { readFileSync } from 'fs';
const file = process.argv[2];
let html = readFileSync(file,'utf8');
html = html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<head[\s\S]*?<\/head>/i,'').replace(/<!--[\s\S]*?-->/g,'');
const decode = s => s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&rsquo;|&lsquo;/g,"'").replace(/&ldquo;|&rdquo;|&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/&mdash;/g,'—').replace(/&ndash;/g,'–').replace(/&[a-z]+;/g,' ').replace(/\s+/g,' ').trim();
const out=[];
const re=/<(section|h1|h2|h3|h4|h5|p|a|li|img|blockquote|div)([^>]*)>/gi;
let tk; const open=[];
while((tk=re.exec(html))){
  const tag=tk[1].toLowerCase(); const attrs=tk[2]||'';
  const cls=(attrs.match(/class="([^"]*)"/i)||[])[1]||'';
  const after=html.slice(re.lastIndex);
  const inner=decode((after.match(/^([\s\S]*?)<\//)||[])[1]||'');
  if(tag==='section'){out.push(`\n===== SECTION class="${cls}" =====`);continue;}
  if(tag==='div'&&/hero|cta|roi|calculator|stat|testimonial|faq|accordion|outcome/i.test(cls)){out.push(`  <div.${cls}>`);continue;}
  if(tag==='img'){const src=(attrs.match(/src="([^"]*)"/i)||[])[1];const alt=(attrs.match(/alt="([^"]*)"/i)||[])[1]||'';out.push(`  [IMG] ${src} | "${alt}"`);continue;}
  if(/^h[1-5]$/.test(tag)){if(inner)out.push(`${tag.toUpperCase()}: ${inner}`);continue;}
  if(tag==='blockquote'){if(inner)out.push(`  QUOTE: ${inner}`);continue;}
  if(tag==='p'){if(inner&&inner.length>1)out.push(`  P: ${inner}`);continue;}
  if(tag==='li'){if(inner)out.push(`  • ${inner}`);continue;}
  if(tag==='a'){const href=(attrs.match(/href="([^"]*)"/i)||[])[1]||'';if(inner&&inner.length>1)out.push(`  [LINK] "${inner}" -> ${href}`);continue;}
}
console.log(out.join('\n'));
