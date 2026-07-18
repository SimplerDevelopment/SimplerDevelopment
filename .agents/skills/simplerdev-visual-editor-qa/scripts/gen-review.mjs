// Generate a QA review page. Two modes:
//   mode=file  → single self-contained HTML, images base64-embedded, "Download JSON" export.
//   mode=embed → an html-embed BUNDLE dir (index.html + img/) whose form POSTs decisions
//                straight into a SimplerDevelopment survey via POST /api/surveys/<slug>
//                (public, CORS *, formName required). Zip the dir + posts_upload_html_zip.
// Surveys can't render images (SurveyFormInline is plain-text), so the images live in this
// page; the survey is just the response sink.
//   node gen-review.mjs <manifest.json> <out.(html|dir)> [file|embed]
import fs from 'node:fs';
import path from 'node:path';

const [, , manifestPath, outArg, mode = 'file'] = process.argv;
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

let imgRef; // (srcPath, sku, i) -> string used in <img src>
if (mode === 'embed') {
  fs.mkdirSync(path.join(outArg, 'img'), { recursive: true });
  imgRef = (src, sku, i) => {
    if (!fs.existsSync(src)) return null;
    const name = `${sku}-${i}.png`;
    fs.copyFileSync(src, path.join(outArg, 'img', name));
    return `img/${name}`;
  };
} else {
  // file mode: pass through already-hosted URLs; base64-embed local files.
  imgRef = (src) => {
    if (/^https?:\/\//.test(src) || src.startsWith('/api/')) return src;
    try { return 'data:image/png;base64,' + fs.readFileSync(src).toString('base64'); } catch { return null; }
  };
}

const s = manifest.submit; // { endpoint, slug, formName }
const cardHtml = (c, idx) => `
<section class="card" data-sku="${c.sku}" data-dec="${c.decField}" data-note="${c.noteField}">
  <div class="head"><span class="sku">${c.sku}</span><span class="area">${c.area || ''}</span>
    <span class="verdict v-${(c.verdict || 'review').toLowerCase().replace(/[^a-z]/g, '')}">${c.verdict || 'REVIEW'}${c.confidence ? ' · ' + c.confidence : ''}</span></div>
  <div class="issue"><b>Issue:</b> ${c.issue || ''}</div>
  ${c.assessment ? `<div class="assess"><b>My assessment:</b> ${c.assessment}</div>` : ''}
  ${c.question ? `<div class="q"><b>❓ My question:</b> ${c.question}</div>` : ''}
  <div class="shots">${(c.images || []).map((p, i) => { const u = imgRef(p, c.sku, i); return u ? `<img src="${u}" loading="lazy">` : ''; }).join('')}</div>
  <div class="controls">
    <label class="opt"><input type="radio" name="${c.sku}" value="Approve (ship)"> ✅ Approve (ship)</label>
    <label class="opt"><input type="radio" name="${c.sku}" value="Reject"> ❌ Reject</label>
    <label class="opt"><input type="radio" name="${c.sku}" value="Needs rework"> 🔁 Needs rework</label>
    <textarea placeholder="Optional note / answer to my question…"></textarea>
  </div>
</section>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Visual Editor QA — Review</title>
<style>
 :root{color-scheme:light} *{box-sizing:border-box}
 body{font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;max-width:920px;margin:0 auto;padding:20px;color:#111;background:#fafafa}
 h1{font-size:22px;margin:.2em 0}.lead{color:#555}
 .bar{position:sticky;top:0;background:#fafafaf2;backdrop-filter:blur(4px);padding:12px 0;border-bottom:1px solid #ddd;display:flex;gap:12px;align-items:center;z-index:5}
 .bar button{font-size:15px;padding:9px 18px;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer}
 .bar button:disabled{opacity:.5;cursor:default}.count{color:#555}.msg{font-weight:600}
 .card{background:#fff;border:1px solid #e3e3e3;border-radius:12px;padding:16px 18px;margin:16px 0}
 .head{display:flex;gap:10px;align-items:center;margin-bottom:8px}
 .sku{font-weight:700;font-family:ui-monospace,monospace}.area{color:#888;font-size:13px}
 .verdict{margin-left:auto;font-size:12px;font-weight:700;padding:3px 8px;border-radius:6px;background:#eee}
 .v-pass{background:#dcfce7;color:#166534}.v-needsyou,.v-review{background:#fef9c3;color:#854d0e}.v-fail{background:#fee2e2;color:#991b1b}.v-taste{background:#e0e7ff;color:#3730a3}
 .issue,.assess,.q{margin:6px 0;font-size:14px}.q{background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 10px;border-radius:4px}
 .shots{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.shots img{max-width:340px;border:1px solid #ddd;border-radius:8px}
 .controls{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px dashed #e3e3e3}
 .opt{cursor:pointer;font-size:14px}.controls textarea{flex:1;min-width:240px;min-height:38px;border:1px solid #ccc;border-radius:8px;padding:6px 8px;font:inherit}
 .card.done{outline:2px solid #16a34a55}
</style></head><body>
<h1>Visual Editor QA — Review</h1>
<p class="lead">${manifest.intro || ''}</p>
<div class="bar"><button id="submit" onclick="submitAll()">Submit decisions</button><span class="count" id="count"></span><span class="msg" id="msg"></span></div>
${manifest.cards.map(cardHtml).join('')}
<script>
 const ENDPOINT=${JSON.stringify(s.endpoint)}, SLUG=${JSON.stringify(s.slug)}, FORMNAME=${JSON.stringify(s.formName || 'custom-embed')};
 const KEY='veqa-dec-'+SLUG;
 const cards=[...document.querySelectorAll('.card')];
 const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
 cards.forEach(c=>{const sku=c.dataset.sku,st=saved[sku];if(!st)return;if(st.decision){const r=c.querySelector('input[value="'+CSS.escape(st.decision)+'"]');if(r)r.checked=true}if(st.note)c.querySelector('textarea').value=st.note});
 function collect(){const o={};cards.forEach(c=>{const dec=c.querySelector('input[type=radio]:checked');o[c.dataset.sku]={decision:dec?dec.value:null,note:c.querySelector('textarea').value||''}});return o}
 function refresh(){const o=collect();localStorage.setItem(KEY,JSON.stringify(o));const n=Object.values(o).filter(x=>x.decision).length;document.getElementById('count').textContent=n+' / '+cards.length+' decided';cards.forEach(c=>{c.classList.toggle('done',!!c.querySelector('input:checked'))})}
 document.addEventListener('input',refresh);document.addEventListener('change',refresh);refresh();
 async function submitAll(){
   const o=collect(); const answers={};
   cards.forEach(c=>{const st=o[c.dataset.sku];if(st.decision)answers[c.dataset.dec]=st.decision;if(st.note)answers[c.dataset.note]=st.note});
   if(!Object.keys(answers).length){document.getElementById('msg').textContent='Make at least one decision first.';return}
   const btn=document.getElementById('submit');btn.disabled=true;document.getElementById('msg').textContent='Submitting…';
   try{
     const res=await fetch(ENDPOINT+'/api/surveys/'+SLUG,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({formName:FORMNAME,answers,source:'veqa-review'})});
     const j=await res.json();
     if(res.ok&&j.success){document.getElementById('msg').textContent='✅ Submitted — thanks! You can close this.';}
     else{document.getElementById('msg').textContent='⚠ '+(j.error||('HTTP '+res.status));btn.disabled=false;}
   }catch(e){document.getElementById('msg').textContent='⚠ '+e.message;btn.disabled=false;}
 }
</script></body></html>`;

const outFile = mode === 'embed' ? path.join(outArg, 'index.html') : outArg;
fs.writeFileSync(outFile, html);
console.log('[gen]', mode, 'wrote', outFile, Math.round(html.length / 1024) + 'KB');
