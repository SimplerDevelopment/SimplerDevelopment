/**
 * Cutting-edge motion system for the Relayer home page.
 * Injected via posts.customCss (raw <style>) + posts.customJs (raw <script>, runs ~200ms
 * after window.load). All effects are progressive enhancements and prefers-reduced-motion safe.
 *
 * Targets stable [data-block-id="…"] hooks set in import-home.ts:
 *   hero · pill-band · pill-lead · pill-cols · cap-marquee · missing-layer · ml-h · ml-lead
 *   · ml-panels · ml-statements · briefing · brief-cols
 */

export const HOME_CSS = `
/* ===================== Relayer home — motion system ===================== */
:root{ --rl-mint:#23EE92; --rl-forest:#032916; }
html{ scroll-behavior:smooth; }
::selection{ background:rgba(35,238,146,.28); color:#032916; }

/* ---- scroll progress bar ---- */
#rl-progress{ position:fixed; top:0; left:0; height:3px; width:0%; z-index:2147483646;
  background:linear-gradient(90deg,#23EE92,#bfffe0); box-shadow:0 0 16px rgba(35,238,146,.7);
  transition:width .08s linear; }

/* ---- hero shell: aurora + spotlight + canvas + grid ---- */
[data-block-id="hero"]{ position:relative; overflow:hidden; isolation:isolate; background:#032916; }
[data-block-id="hero"] > section, [data-block-id="hero"] [data-block-type="section"]{ background:transparent !important; }
[data-block-id="hero"]::before{ content:""; position:absolute; inset:-20%; z-index:-3;
  background:
    radial-gradient(45% 40% at 18% 22%, rgba(35,238,146,.20), transparent 60%),
    radial-gradient(50% 45% at 86% 82%, rgba(35,238,146,.13), transparent 65%),
    radial-gradient(40% 40% at 62% 8%, rgba(13,110,64,.55), transparent 70%),
    #032916;
  background-size:200% 200%; animation:rl-aurora 20s ease-in-out infinite alternate; }
[data-block-id="hero"]::after{ content:""; position:absolute; inset:0; z-index:-1; pointer-events:none;
  background:radial-gradient(300px circle at var(--mx,70%) var(--my,28%), rgba(35,238,146,.16), transparent 72%);
  transition:background .18s ease-out; }
#rl-net{ position:absolute; inset:0; z-index:-2; width:100%; height:100%; pointer-events:none; }
.rl-grid{ position:absolute; inset:0; z-index:-2; pointer-events:none; opacity:.12;
  background-image:linear-gradient(rgba(246,245,243,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(246,245,243,.6) 1px,transparent 1px);
  background-size:60px 60px;
  -webkit-mask-image:radial-gradient(ellipse 78% 66% at 50% 42%,#000,transparent 76%);
  mask-image:radial-gradient(ellipse 78% 66% at 50% 42%,#000,transparent 76%); }
@keyframes rl-aurora{ 0%{background-position:0% 0%} 100%{background-position:100% 100%} }

/* ---- animated gradient/shimmer text (highlight words) ---- */
.rl-grad{ background:linear-gradient(100deg,#23EE92 0%,#d6ffe9 45%,#23EE92 90%); background-size:220% auto;
  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:#23EE92;
  animation:rl-shine 6s linear infinite; }
@keyframes rl-shine{ to{ background-position:220% center } }

/* ---- hero entrance (CSS only, no JS dependency) ---- */
[data-block-id="hero"] h1{ animation:rl-up 1s cubic-bezier(.16,1,.3,1) .05s both; }
[data-block-id="hero"] p:nth-of-type(1){ animation:rl-up 1s cubic-bezier(.16,1,.3,1) .24s both; }
[data-block-id="hero"] p:nth-of-type(2){ animation:rl-up 1s cubic-bezier(.16,1,.3,1) .36s both; }
[data-block-id="hero"] a{ animation:rl-up 1s cubic-bezier(.16,1,.3,1) .5s both; }
@keyframes rl-up{ from{opacity:0; transform:translateY(32px)} to{opacity:1; transform:none} }

/* ---- glowing CTAs ---- */
[data-block-id="hero"] a, [data-block-id="briefing"] a[href]{ position:relative; overflow:hidden;
  animation:rl-glow 3s ease-in-out infinite; }
[data-block-id="hero"] a::after, [data-block-id="briefing"] a[href]::after{ content:""; position:absolute; top:0; left:-130%;
  width:60%; height:100%; transform:skewX(-20deg);
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);
  animation:rl-sweep 4.5s ease-in-out infinite; }
@keyframes rl-glow{ 0%,100%{ box-shadow:0 10px 30px rgba(0,0,0,.22) } 50%{ box-shadow:0 0 28px 3px rgba(35,238,146,.5),0 10px 30px rgba(0,0,0,.22) } }
@keyframes rl-sweep{ 0%{left:-130%} 55%,100%{left:140%} }

/* ---- scroll reveal (JS toggles .r-in) ---- */
.r-hidden{ opacity:0; transform:translateY(34px); transition:opacity .9s cubic-bezier(.16,1,.3,1), transform .9s cubic-bezier(.16,1,.3,1); }
.r-hidden.r-in{ opacity:1; transform:none; }

/* ---- Missing Layer panels: 3D tilt + glow + animated data-flow ---- */
.rl-panel{ position:relative; transform-style:preserve-3d; will-change:transform;
  transition:transform .3s cubic-bezier(.16,1,.3,1), box-shadow .3s; box-shadow:0 24px 60px rgba(0,0,0,.30); }
.rl-panel:hover{ box-shadow:0 34px 90px rgba(0,0,0,.42),0 0 46px rgba(35,238,146,.28); }
.rl-art{ position:relative; width:100%; aspect-ratio:660/440; background-position:center; background-repeat:no-repeat; background-size:contain; }
.rl-scan{ position:absolute; inset:0; pointer-events:none; mix-blend-mode:screen;
  background:linear-gradient(90deg,transparent 0%,rgba(35,238,146,.0) 35%,rgba(35,238,146,.55) 50%,rgba(35,238,146,.0) 65%,transparent 100%);
  background-size:260% 100%; }
.rl-panel--seamless .rl-scan{ animation:rl-flow 3.2s linear infinite; }
.rl-panel--fragmented .rl-art{ animation:rl-flicker 4.5s steps(1) infinite; }
@keyframes rl-flow{ 0%{background-position:160% 0} 100%{background-position:-60% 0} }
@keyframes rl-flicker{ 0%,100%{opacity:1} 47%{opacity:1} 48%{opacity:.74} 49%{opacity:1} 71%{opacity:1} 72%{opacity:.82} 73%{opacity:1} }

/* ---- capability marquee ---- */
.rl-marq{ position:relative; overflow:hidden; width:100%;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);
  mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent); }
.rl-marq__track{ display:inline-flex; gap:0; white-space:nowrap; will-change:transform; animation:rl-marquee 26s linear infinite; }
.rl-marq:hover .rl-marq__track{ animation-play-state:paused; }
.rl-marq__item{ display:inline-flex; align-items:center; font:600 1.35rem/1 'Space Grotesk',sans-serif; color:#F6F5F3; padding:0 8px; }
.rl-marq__dot{ width:8px; height:8px; border-radius:50%; background:#23EE92; margin:0 30px; box-shadow:0 0 14px rgba(35,238,146,.8); }
@keyframes rl-marquee{ from{transform:translateX(0)} to{transform:translateX(-50%)} }

/* ---- briefing form: input focus glow ---- */
[data-block-id="briefing"] input, [data-block-id="briefing"] select{ transition:border-color .2s, box-shadow .2s; }
[data-block-id="briefing"] input:focus, [data-block-id="briefing"] select:focus{ outline:none;
  border-color:#23EE92 !important; box-shadow:0 0 0 4px rgba(35,238,146,.18) !important; }

/* ---- reduced motion ---- */
@media (prefers-reduced-motion:reduce){
  *{ animation:none !important; transition:none !important; }
  .r-hidden{ opacity:1 !important; transform:none !important; }
  #rl-net,.rl-grid{ display:none !important; }
}
`.trim();

export const HOME_JS = `
var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;

/* ---- scroll progress ---- */
var bar = document.createElement('div'); bar.id='rl-progress'; document.body.appendChild(bar);
function prog(){ var d=document.documentElement; var max=d.scrollHeight-d.clientHeight; bar.style.width=(max>0?(d.scrollTop/max*100):0)+'%'; }
window.addEventListener('scroll', prog, {passive:true}); prog();

/* ---- hero: grid overlay, cursor spotlight, particle network ---- */
var hero = document.querySelector('[data-block-id="hero"]');
if (hero){
  var grid=document.createElement('div'); grid.className='rl-grid'; hero.prepend(grid);
  if(!reduce){
    hero.addEventListener('pointermove', function(e){
      var r=hero.getBoundingClientRect();
      hero.style.setProperty('--mx', ((e.clientX-r.left)/r.width*100)+'%');
      hero.style.setProperty('--my', ((e.clientY-r.top)/r.height*100)+'%');
    }, {passive:true});

    var c=document.createElement('canvas'); c.id='rl-net'; hero.prepend(c);
    var ctx=c.getContext('2d'); var W=0,H=0,nodes=[],pulses=[]; var DPR=Math.min(window.devicePixelRatio||1,2);
    function size(){ W=hero.clientWidth; H=hero.clientHeight; c.width=W*DPR; c.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); }
    var LINK=175;
    function init(){ var n=Math.max(42,Math.min(110,Math.round(W/14))); nodes=[]; for(var i=0;i<n;i++){ nodes.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,r:Math.random()*1.8+.9}); } }
    function draw(){
      ctx.clearRect(0,0,W,H);
      var i,j;
      for(i=0;i<nodes.length;i++){ var a=nodes[i]; a.x+=a.vx; a.y+=a.vy; if(a.x<0||a.x>W)a.vx*=-1; if(a.y<0||a.y>H)a.vy*=-1; }
      for(i=0;i<nodes.length;i++){ for(j=i+1;j<nodes.length;j++){ var p=nodes[i],q=nodes[j]; var dx=p.x-q.x,dy=p.y-q.y; var d=Math.sqrt(dx*dx+dy*dy);
        if(d<LINK){ var o=(1-d/LINK); ctx.strokeStyle='rgba(35,238,146,'+(o*0.55)+')'; ctx.lineWidth=1.1; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke();
          if(pulses.length<40 && Math.random()<0.0016){ pulses.push({a:p,b:q,t:0,s:0.014+Math.random()*0.022}); } } } }
      for(i=0;i<nodes.length;i++){ var nn=nodes[i]; ctx.fillStyle='rgba(205,255,231,.95)'; ctx.beginPath(); ctx.arc(nn.x,nn.y,nn.r,0,6.2832); ctx.fill(); }
      for(i=pulses.length-1;i>=0;i--){ var P=pulses[i]; P.t+=P.s; if(P.t>=1){ pulses.splice(i,1); continue; }
        var x=P.a.x+(P.b.x-P.a.x)*P.t, y=P.a.y+(P.b.y-P.a.y)*P.t;
        ctx.shadowColor='rgba(35,238,146,1)'; ctx.shadowBlur=14; ctx.fillStyle='rgba(120,255,190,1)'; ctx.beginPath(); ctx.arc(x,y,2.8,0,6.2832); ctx.fill(); ctx.shadowBlur=0; }
      requestAnimationFrame(draw);
    }
    size(); init(); draw();
    var rt; window.addEventListener('resize', function(){ clearTimeout(rt); rt=setTimeout(function(){ size(); init(); }, 200); }, {passive:true});
  }
}

/* ---- scroll reveal with stagger ---- */
var revealIds = ['pill-lead','pill-cols','cap-marquee','ml-h','ml-lead','ml-panels','ml-statements','brief-cols'];
if(!reduce && 'IntersectionObserver' in window){
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add('r-in'); io.unobserve(en.target); } });
  }, {threshold:0.14, rootMargin:'0px 0px -8% 0px'});
  revealIds.forEach(function(id){ var el=document.querySelector('[data-block-id="'+id+'"]'); if(el){ el.classList.add('r-hidden'); io.observe(el); } });
}

/* ---- 3D tilt on Missing Layer panels ---- */
if(!reduce){
  document.querySelectorAll('.rl-panel').forEach(function(panel){
    panel.addEventListener('pointermove', function(e){
      var r=panel.getBoundingClientRect();
      var rx=((e.clientY-r.top)/r.height-0.5)*-7, ry=((e.clientX-r.left)/r.width-0.5)*9;
      panel.style.transform='perspective(900px) rotateX('+rx+'deg) rotateY('+ry+'deg) translateY(-4px)';
    });
    panel.addEventListener('pointerleave', function(){ panel.style.transform=''; });
  });
}
`.trim();

/** Animated Missing-Layer panel: the source circuit SVG + a moving data-flow scan + tag. */
export function panelHtml(variant: 'fragmented' | 'seamless', tag: string, svgUrl: string): string {
  return `
<div class="rl-panel rl-panel--${variant}" style="background:#032916;border:1px solid rgba(35,238,146,.18);border-radius:20px;padding:22px;">
  <div style="font:600 0.75rem/1 'Hanken Grotesk',sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#23EE92;margin-bottom:16px;">${tag}</div>
  <div class="rl-art" style="background-image:url('${svgUrl}');"><span class="rl-scan"></span></div>
</div>`.trim();
}

/** Forest capability marquee (duplicated track for seamless loop). */
export function marqueeHtml(items: string[]): string {
  const one = items.map((t) => `<span class="rl-marq__item">${t}</span><span class="rl-marq__dot"></span>`).join('');
  return `<div class="rl-marq"><div class="rl-marq__track">${one}${one}</div></div>`;
}
