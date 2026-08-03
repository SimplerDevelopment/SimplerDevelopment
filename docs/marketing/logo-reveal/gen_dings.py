import numpy as np, wave, base64

import os
DIR=os.path.dirname(os.path.abspath(__file__))
sr=48000
def env(t, atk, tau): return np.clip(t/atk,0,1)*np.exp(-t/tau)
def note(f, dur, atk, tau, parts):
    t=np.linspace(0,dur,int(sr*dur),False)
    y=sum(a*np.sin(2*np.pi*f*mult*t) for mult,a in parts)
    return y*env(t,atk,tau)
def reverb(y, taps):
    out=y.copy()
    for d,g in taps:
        s=int(d*sr); pad=np.zeros(s); out=out+g*np.concatenate([pad,y])[:len(out)]
    return out
def pad_to(y, dur):
    n=int(sr*dur); return np.concatenate([y,np.zeros(max(0,n-len(y)))])[:n]
def save(name, y):
    y=y/np.max(np.abs(y))*0.7                       # -3dB, soft
    pcm=(y*32767).astype('<i2')
    w=wave.open(f"{DIR}/{name}","wb"); w.setnchannels(1); w.setsampwidth(2)
    w.setframerate(sr); w.writeframes(pcm.tobytes()); w.close()

RVB=[(0.045,0.28),(0.09,0.16),(0.15,0.08)]

# 1) Music box — warm C6, soft octave, medium decay
d1=note(1046.5,0.9,0.010,0.28,[(1,1.0),(2,0.28),(3,0.10)])
d1=pad_to(reverb(d1,RVB),1.1); save("ding1_musicbox.wav",d1)

# 2) Glass chime — two soft notes E6 + B6 staggered, long smooth tail
a=note(1318.5,0.9,0.012,0.34,[(1,1.0),(2,0.20)])
b=note(1975.5,0.9,0.012,0.30,[(1,0.7),(2,0.14)])
s=int(0.055*sr); d2=pad_to(a,1.15).copy(); d2[s:s+len(b)]+=b[:len(d2)-s]
d2=pad_to(reverb(d2,RVB),1.15); save("ding2_chime.wav",d2)

# 3) Warm bell — low A5 fundamental, mild partials, no harsh highs
d3=note(880,1.0,0.008,0.40,[(1,1.0),(2.0,0.35),(2.7,0.14),(4.0,0.06)])
d3=pad_to(reverb(d3,RVB),1.2); save("ding3_warmbell.wav",d3)

# 4) Celesta twinkle — quick soft rising C6-E6-G6 arpeggio (sparkle feel)
d4=np.zeros(int(sr*1.15))
for i,f in enumerate([1046.5,1318.5,1568.0]):
    n=note(f,0.7,0.008,0.24,[(1,1.0),(2,0.18)])
    off=int((0.05*i)*sr); d4[off:off+len(n)]+=n[:len(d4)-off]
d4=pad_to(reverb(d4,RVB),1.15); save("ding4_celesta.wav",d4)

# audition page
opts=[("ding1_musicbox","Music box — warm, single soft note"),
      ("ding2_chime","Glass chime — two-note, airy tail"),
      ("ding3_warmbell","Warm bell — low, rounded, no harsh highs"),
      ("ding4_celesta","Celesta twinkle — soft rising sparkle")]
rows=""
for f,label in opts:
    b=base64.b64encode(open(f"{DIR}/{f}.wav","rb").read()).decode()
    rows+=f'<div class=row><button onclick="new Audio(this.dataset.s).play()" data-s="data:audio/wav;base64,{b}">&#9654; play</button><b>{f}</b><span>{label}</span></div>\n'
html=f"""<meta charset=utf8><title>ding options</title>
<style>body{{font-family:system-ui;background:#111;color:#eee;padding:40px;max-width:640px;margin:auto}}
h2{{font-weight:600}} .row{{display:flex;align-items:center;gap:14px;padding:12px;border-bottom:1px solid #333}}
button{{background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:15px}}
button:hover{{background:#3a3a3a}} b{{min-width:150px}} span{{color:#999;font-size:13px}}</style>
<h2>Ding options — pick one for the star pop</h2>{rows}
<p style=color:#777;font-size:13px>Tell me the number/name you like and I'll wire it in.</p>"""
open(f"{DIR}/dings.html","w").write(html)
print("wrote 4 ding candidates + dings.html")
