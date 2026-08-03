import numpy as np, subprocess
from collections import deque

import os
DIR=os.path.dirname(os.path.abspath(__file__))
A=np.fromfile(f"{DIR}/alpha128.raw",dtype=np.uint8).reshape(128,128)
ink=A>40
seen=np.zeros_like(ink,bool); comps=[]
for r in range(128):
 for c in range(128):
  if ink[r,c] and not seen[r,c]:
   q=deque([(r,c)]); seen[r,c]=True; px=[]
   while q:
    y,x=q.popleft(); px.append((y,x))
    for dy in(-1,0,1):
     for dx in(-1,0,1):
      ny,nx=y+dy,x+dx
      if 0<=ny<128 and 0<=nx<128 and ink[ny,nx] and not seen[ny,nx]:
       seen[ny,nx]=True; q.append((ny,nx))
   comps.append(px)

def mask_png(keep, out):
    m=np.zeros((128,128),np.uint8)
    for px in keep:
        for (y,x) in px: m[y,x]=A[y,x]     # keep original soft alpha
    rgba=np.zeros((128,128,4),np.uint8)     # black glyph, alpha=m
    rgba[...,3]=m
    p=subprocess.Popen(["ffmpeg","-hide_banner","-loglevel","error","-y",
        "-f","rawvideo","-pix_fmt","rgba","-s","128x128","-i","-",out],stdin=subprocess.PIPE)
    p.communicate(rgba.tobytes())

brackets=[px for px in comps if len(px)>=150]   # <, /, >
stars   =[px for px in comps if len(px)< 150]   # the 4 sparkles
print(f"brackets comps={len(brackets)}  stars comps={len(stars)}")
mask_png(brackets, f"{DIR}/icon_brackets.png")
mask_png(stars,    f"{DIR}/icon_stars.png")

# --- synthesize a bright, short "ding" (glockenspiel-ish) ---
sr=48000; dur=0.6; t=np.linspace(0,dur,int(sr*dur),False)
partials=[(1568,1.0),(3136,0.45),(4704,0.22),(6272,0.10)]  # G6 + octaves/partials
y=sum(a*np.sin(2*np.pi*f*t) for f,a in partials)
env=np.exp(-t/0.16)                       # fast bell decay
atk=np.clip(t/0.004,0,1)                   # 4ms attack
y=y*env*atk; y=y/np.max(np.abs(y))*0.85
pcm=(y*32767).astype('<i2')
import wave
w=wave.open(f"{DIR}/ding.wav","wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
w.writeframes(pcm.tobytes()); w.close()
print("wrote icon_brackets.png, icon_stars.png, ding.wav")
