import base64, json, wave

import os
DIR = os.path.dirname(os.path.abspath(__file__))
b64 = lambda p: base64.b64encode(open(p,"rb").read()).decode()
WAV  = b64(f"{DIR}/voice.wav")
DING = b64(f"{DIR}/ding.wav")
FONT = b64(f"{DIR}/fonts/geist-latin.woff2")   # Geist latin — see README for where this comes from
BRK  = b64(f"{DIR}/icon_brackets.png")   # </> layer (always visible)
STR  = b64(f"{DIR}/icon_stars.png")      # sparkles layer (pops in at end)
vj = json.load(open(f"{DIR}/voice.json"))
DUR, HOP, LOUD = vj["dur"], vj["hop"], vj["loud"]
TOTAL = 3.2    # visual timeline: voice 2.70s + tail for the star/ding finish
DINGT = 2.45   # sparkles + ding fire here, just before "Development" tails out

# Beats measured from voice.json for take-1 (2026-08-03). The line is read as
# "Simpler [pause] Development":
#   0.12 onset · 1.08 "Simpler" swell apex (global peak) · 1.50-2.04 the pause
#   · 2.07 "Development" punch · 2.55 speech ends.
# Slower than the original 1.84s take (0.81/1.41/1.74) but the same shape, so
# the DEVL "holds through the lull" design finally has a real 0.54s lull to
# hold through. The dip at 0.45-0.48 is a syllable boundary inside "Simpler",
# NOT a word gap — do not choreograph to it.
ICONK = [  # brackets pop in on the low entrance, just ahead of the first word
 {"t":0.00,"o":0,"s":0.35,"r":-24,"e":"out"},
 {"t":0.08,"o":1,"s":1.12,"r":0,"e":"back"},
 {"t":0.20,"o":1,"s":1.00,"r":0,"e":"out"},
 {"t":TOTAL,"o":1,"s":1.00,"r":0,"e":"smooth"},
]
STARK = [  # sparkles hidden, then pop in at the end with the ding
 {"t":0.00,"o":0,"s":0.20,"r":-40,"e":"smooth"},
 {"t":DINGT,"o":0,"s":0.20,"r":-40,"e":"out"},
 {"t":DINGT+0.15,"o":1,"s":1.18,"r":8,"e":"out"},
 {"t":DINGT+0.30,"o":1,"s":1.00,"r":0,"e":"out"},
 {"t":TOTAL,"o":1,"s":1.00,"r":0,"e":"smooth"},
]
SIMP = [  # un-wipes from behind the icon, LANDS on the vocal attack 0.20
 # Deliberately NOT the 1.08 swell apex: "Simpler" is drawn out over 1.38s, so
 # anchoring to the apex left the word on screen ~0.9s after you hear it. The
 # sustained swell is carried by the loudness-driven scale/shadow instead.
 {"t":0.00,"f":0,"tx":-16,"ty":0,"e":"smooth"},
 {"t":0.08,"f":0,"tx":-16,"ty":0,"e":"out"},
 {"t":0.20,"f":1,"tx":0,"ty":0,"e":"out"},
 {"t":TOTAL,"f":1,"tx":0,"ty":0,"e":"smooth"},
]
DEVL = [  # holds through the 0.54s pause, SNAPS on the punch 2.07 with overshoot
 {"t":0.00,"f":0,"tx":-20,"ty":0,"e":"smooth"},
 {"t":1.86,"f":0,"tx":-20,"ty":0,"e":"out"},
 {"t":2.07,"f":1,"tx":7,"ty":-3,"e":"out"},
 {"t":2.21,"f":1,"tx":-2,"ty":2,"e":"out"},
 {"t":2.32,"f":1,"tx":0,"ty":0,"e":"out"},
 {"t":TOTAL,"f":1,"tx":0,"ty":0,"e":"smooth"},
]

HTML = r"""<meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Simpler Development — voice-synced intro</title>
<style>
 @font-face{ font-family:Geist; font-weight:100 900; font-display:block;
   src:url(data:font/woff2;base64,@@FONT@@) format("woff2"); }
 :root{ --bg:#ffffff; --fg:#0a0a0a; }
 *{margin:0;box-sizing:border-box}
 html,body{height:100%}
 body{background:var(--bg);color:var(--fg);font-family:Geist,system-ui,sans-serif;
   display:grid;place-items:center;overflow:hidden}
 #stage{text-align:center;user-select:none}
 .lockup{ display:flex;align-items:center;gap:18px;font-size:min(9vw,72px);
   will-change:transform,filter }
 #iconwrap{ position:relative;width:2.4em;height:2.4em;flex:none;
   transform-origin:50% 50%;will-change:transform,opacity }
 #iconwrap img{ position:absolute;inset:0;width:100%;height:100% }
 #stars{ transform-origin:50% 50%;will-change:transform,opacity }
 .words{ display:flex;align-items:baseline }
 .word{ display:inline-block;letter-spacing:-.03em;white-space:nowrap;
   color:var(--fg);will-change:transform,clip-path }
 #simp{ font-weight:700 }
 #dev{ font-weight:400;margin-left:.26em }
 #btns{margin-top:46px}
 button{background:transparent;border:1.5px solid #c9c9c9;color:#555;
   font-family:Geist;font-size:14px;font-weight:600;padding:9px 20px;
   border-radius:999px;cursor:pointer;letter-spacing:.03em}
 button:hover{border-color:#0a0a0a;color:#0a0a0a}
 .hint{margin-top:14px;font-size:12px;color:#aaa}
</style>
<div id=stage>
 <div class=lockup id=lockup>
   <span id=iconwrap>
     <img id=brackets src="data:image/png;base64,@@BRK@@" alt="">
     <img id=stars src="data:image/png;base64,@@STR@@" alt="">
   </span>
   <div class=words>
     <span class=word id=simp>Simpler</span><span class=word id=dev>Development</span>
   </div>
 </div>
 <div id=btns><button id=play>&#9654;&nbsp; Play</button></div>
 <div class=hint>click Play &middot; motion is locked to your recording</div>
</div>
<audio id=aud src="data:audio/wav;base64,@@WAV@@"></audio>
<audio id=ding src="data:audio/wav;base64,@@DING@@"></audio>
<script>
const DUR=@@DUR@@, HOP=@@HOP@@, TOTAL=@@TOTAL@@, DINGT=@@DINGT@@, LOUD=@@LOUD@@;
const ICONK=@@ICONK@@, STARK=@@STARK@@, SIMP=@@SIMP@@, DEVL=@@DEVL@@;
const $=id=>document.getElementById(id);
const aud=$('aud'), ding=$('ding'), iconwrap=$('iconwrap'), stars=$('stars'),
      simp=$('simp'), dev=$('dev'), lockup=$('lockup');
const ease={ smooth:x=>x*x*(3-2*x), out:x=>1-Math.pow(1-x,3),
  back:x=>{const c=1.9;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2);} };
function samp(kf,t,keys){
  if(t<=kf[0].t) return kf[0];
  for(let i=1;i<kf.length;i++){ if(t<=kf[i].t){
    const a=kf[i-1],b=kf[i],u=(ease[b.e]||ease.smooth)((t-a.t)/(b.t-a.t)),o={};
    for(const k of keys) o[k]=a[k]+(b[k]-a[k])*u; return o;
  }}
  return kf[kf.length-1];
}
const loudAt=t=>LOUD[Math.min(LOUD.length-1,Math.max(0,Math.floor(t/HOP)))]||0;
function render(t){
  const g=loudAt(t);
  const by=Math.sin(t*Math.PI*1.6)*2.2, bs=1+Math.sin(t*Math.PI*1.6)*0.006+g*0.018;
  lockup.style.transform=`translateY(${by.toFixed(2)}px) scale(${bs.toFixed(4)})`;
  lockup.style.filter=`drop-shadow(0 0 ${(2+g*16).toFixed(1)}px rgba(0,0,0,${(0.05+g*0.20).toFixed(2)}))`;
  const ic=samp(ICONK,t,['o','s','r']);
  const iIdle=1+Math.sin(t*Math.PI*1.9)*0.016;
  iconwrap.style.opacity=ic.o;
  iconwrap.style.transform=`scale(${(ic.s*iIdle*(1+g*0.10)).toFixed(3)}) rotate(${ic.r}deg)`;
  const sk=samp(STARK,t,['o','s','r']);
  stars.style.opacity=sk.o;
  stars.style.transform=`scale(${sk.s.toFixed(3)}) rotate(${sk.r.toFixed(1)}deg)`;
  for(const [el,kf] of [[simp,SIMP],[dev,DEVL]]){
    const k=samp(kf,t,['f','tx','ty']);
    el.style.clipPath=`inset(-45% ${((1-k.f)*100).toFixed(2)}% -45% 0)`;
    el.style.transform=`translate(${k.tx.toFixed(2)}px,${k.ty.toFixed(2)}px)`;
  }
}
let t0=null, dinged=false;
function loop(){
  const t=(performance.now()-t0)/1000;
  if(!dinged && t>=DINGT){ dinged=true; ding.currentTime=0; ding.play().catch(()=>{}); }
  render(Math.min(t,TOTAL));
  if(t<TOTAL) requestAnimationFrame(loop);
}
$('play').onclick=()=>{ dinged=false; render(0); aud.currentTime=0; aud.play();
  t0=performance.now(); requestAnimationFrame(loop);
  $('play').innerHTML='&#8635;&nbsp; Replay'; };
document.fonts.ready.then(()=>render(0));

// Renderer contract for sd-create-short's render.mjs: expose a seekable
// timeline so the MP4 export is deterministic seek-and-snap rather than a
// screencast (which drops frames). Harmless in a normal browser — nothing
// touches __short unless the renderer is driving.
window.__short = {
  width: @@RW@@, height: @@RH@@, fps: @@FPS@@, duration: @@RENDER_DUR@@,
  ready: document.fonts.ready.then(() => {
    // The Play button and hint are UI for the preview, not part of the frame.
    for (const el of [$('btns'), document.querySelector('.hint')]) if (el) el.style.display = 'none';
    render(0);
  }),
  seek: (t) => { render(Math.max(0, Math.min(t, TOTAL))); },
};
</script>
"""
RW, RH, FPS = 1920, 1080, 30   # MP4 export canvas (see window.__short below)

# The visual beats finish at TOTAL, but the bell is still ringing. In a browser
# the <audio> element outlives the rAF loop so you hear it decay; the MP4 has to
# be told explicitly, or ffmpeg cuts the tail mid-ring.
with wave.open(f"{DIR}/ding.wav", "rb") as _d:
    DING_DUR = _d.getnframes() / _d.getframerate()
RENDER_DUR = round(max(TOTAL, DINGT + DING_DUR), 3)

sub={"@@FONT@@":FONT,"@@BRK@@":BRK,"@@STR@@":STR,"@@WAV@@":WAV,"@@DING@@":DING,
     "@@RW@@":str(RW),"@@RH@@":str(RH),"@@FPS@@":str(FPS),"@@RENDER_DUR@@":str(RENDER_DUR),
     "@@DUR@@":str(DUR),"@@HOP@@":str(HOP),"@@TOTAL@@":str(TOTAL),"@@DINGT@@":str(DINGT),
     "@@LOUD@@":json.dumps(LOUD),"@@ICONK@@":json.dumps(ICONK),"@@STARK@@":json.dumps(STARK),
     "@@SIMP@@":json.dumps(SIMP),"@@DEVL@@":json.dumps(DEVL)}
for k,v in sub.items(): HTML=HTML.replace(k,v)
open(f"{DIR}/index.html","w").write(HTML)
print(f"wrote index.html ({len(HTML)//1024} KB)  voice={DUR}s total={TOTAL}s")
