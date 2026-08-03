import wave, numpy as np, json, subprocess, os, sys, glob

DIR = os.path.dirname(os.path.abspath(__file__))
# usage: python3 prep.py [take.wav] [T0] [T1]  — defaults: newest take-*.wav, full length
takes = sorted(glob.glob(f"{DIR}/take-*.wav"), key=os.path.getmtime)
SRC = sys.argv[1] if len(sys.argv) > 1 else (takes[-1] if takes else None)
if not SRC: sys.exit("no take-*.wav found — record one with record.sh first")
T0 = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
T1 = float(sys.argv[3]) if len(sys.argv) > 3 else float(subprocess.run(
    ["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",SRC],
    capture_output=True,text=True).stdout.strip())

# 1) trim + GENTLE clean: highpass (rumble/DC) -> adeclick (impulsive clicks)
#    -> loudnorm -> smooth half-sine fades. No spectral denoise (kept natural).
OUT = f"{DIR}/voice.wav"
fout = round(T1-T0-0.09, 3)
chain = ("highpass=f=70,adeclick,"
         "loudnorm=I=-15:TP=-1.2:LRA=11,"
         "afade=t=in:st=0:d=0.05:curve=hsin,"
         f"afade=t=out:st={fout}:d=0.09:curve=hsin")
# -ac 1 is load-bearing: the envelope pass below reads the WAV as a flat int16
# array, so a stereo file would read as interleaved L/R — doubling the reported
# duration and turning the envelope into channel alternation. record.sh captures
# mono, but an exported take (e.g. from a DAW) is usually stereo.
subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y",
                "-ss",str(T0),"-t",str(round(T1-T0,3)),"-i",SRC,
                "-af",chain,"-ac","1","-ar","48000","-sample_fmt","s16",
                OUT], check=True)

# 2) loudness envelope of the trimmed clip, 30ms hop -> JS array
w = wave.open(OUT,"rb"); sr=w.getframerate()
x = np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float64)/32768.0
hop=int(0.030*sr); win=int(0.040*sr)
env=[]
for i in range(0,max(1,len(x)-win),hop):
    env.append(float(np.sqrt(np.mean(x[i:i+win]**2))))
m=max(env) or 1
env=[round(v/m,3) for v in env]
dur=len(x)/sr
json.dump({"dur":round(dur,3),"hop":0.030,"loud":env}, open(f"{DIR}/voice.json","w"))
print(f"trimmed {dur:.2f}s, {len(env)} loudness samples -> voice.wav / voice.json")
