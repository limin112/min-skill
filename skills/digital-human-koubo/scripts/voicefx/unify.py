#!/usr/bin/env python3
"""多段 Grok 原声统一音色和空间感（第二、三期实测：齿音段间差 13.2 → 5.9 dB）。
1) 频谱匹配：每段 1/3 倍频程能量向「参照组」中位数靠拢（±4 dB，平滑后用 firequalizer）
2) 去刺耳：去齿音 + 6.6 kHz / 3.6 kHz 轻收 + 200 Hz 轻补 + 轻压缩
3) 同一个小房间混响：原本混响尾巴长的段少加，干的段多加
4) 每段 -18 LUFS

用法：
  python3 unify.py <输出目录> <片段1.mp4> <片段2.mp4> ...            # 参照组 = 这批片段自己
  python3 unify.py <输出目录> --ref <参照片段目录> <片段…>          # 新片段向旧片段靠拢（比如复用上一期的段）
  python3 unify.py <输出目录> --scene <片段…>                     # 场景 / 动物片段：只去齿音 + 响度，不加房间
  可选：--roomtone <秒数>  另出一条整片房间底噪 roomtone.wav（-60 dBFS 左右，铺在整片下面）
输出 <输出目录>/<文件名>.wav（48k 立体声）。剪辑时数字人视频轨一定 muted，只用这里的 wav。"""
import subprocess, sys
from pathlib import Path
import numpy as np
SR = 48000
CENTERS = [100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500]
CHAIN = ("highpass=f=80,lowpass=f=15000,deesser=i=0.6:m=0.6:f=0.55,equalizer=f=6600:t=q:w=1.3:g=-3,equalizer=f=3600:t=q:w=1.1:g=-1.2,"
         "equalizer=f=200:t=q:w=0.9:g=1.4,acompressor=threshold=-22dB:ratio=2.3:attack=8:release=120:makeup=1.4")
SCENE = "highpass=f=70,deesser=i=0.5:m=0.5:f=0.55,equalizer=f=6600:t=q:w=1.3:g=-2"

def load(p, af=None):
    cmd = ["ffmpeg", "-loglevel", "error", "-i", str(p)] + (["-af", af] if af else []) + ["-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32).copy()
def band_db(x):
    n = 1 << 14; win = np.hanning(n); acc = None; k = 0
    for i in range(0, len(x) - n, n // 2):
        seg = x[i:i + n]
        if np.sqrt(np.mean(seg ** 2)) < 0.01: continue
        s = np.abs(np.fft.rfft(seg * win)) ** 2; acc = s if acc is None else acc + s; k += 1
    f = np.fft.rfftfreq(n, 1 / SR); s = acc / max(1, k)
    out = np.array([10 * np.log10(np.sum(s[(f >= c / 2 ** (1 / 6)) & (f < c * 2 ** (1 / 6))]) + 1e-12) for c in CENTERS])
    return out - out.mean()
def tail_ms(x):
    """语音峰值后衰减 20 dB 所需时间的中位数（ms），越大越「湿」"""
    hop = SR // 50; env = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) + 1e-9 for i in range(0, len(x) - hop, hop)])
    db = 20 * np.log10(env); out = []
    for i in range(1, len(db) - 15):
        if db[i] > db.max() - 18 and db[i + 1] < db[i] - 3:
            j = i
            while j < len(db) - 1 and db[j] > db[i] - 20: j += 1
            if j - i < 40: out.append((j - i) * 20)
    return int(np.median(out)) if out else 0
def room_ir():
    """小房间脉冲响应：早期反射 + 0.32 s 衰减尾巴，高频吸收（像卧室 / 书房里自拍）"""
    rng = np.random.default_rng(7)
    n = int(0.55 * SR); t = np.arange(n) / SR
    ir = np.zeros((n, 2), np.float32); ir[0] = 1.0
    for d, g in [(0.0061, .42), (0.0093, .33), (0.0137, .28), (0.0189, .22), (0.0247, .17), (0.0311, .12)]:
        j = int(d * SR); ir[j, 0] += g * (1 if rng.random() > .5 else -1); ir[j + int(rng.integers(5, 40)), 1] += g * (1 if rng.random() > .5 else -1)
    tail = rng.standard_normal((n, 2)).astype(np.float32) * np.exp(-6.91 * t / 0.32)[:, None] * 0.09
    tail[: int(0.012 * SR)] = 0
    k = np.exp(-np.arange(0, 60) / 9.0); k /= k.sum()
    for c in range(2): tail[:, c] = np.convolve(tail[:, c], k, mode="same")
    return ir + tail
IR = room_ir()
def roomify(dry, wet):
    w = np.stack([np.convolve(dry, IR[:, c])[: len(dry)] for c in range(2)], 1)
    return np.stack([dry, dry], 1) * (1 - wet) + w * wet
def fq(g):
    g = np.convolve(np.pad(g, 1, mode="edge"), [0.25, 0.5, 0.25], mode="valid")
    return "firequalizer=gain_entry='" + ";".join(f"entry({c},{v:.2f})" for c, v in zip(CENTERS, g)) + "'"
def write(path, st):
    tmp = path.with_suffix(".tmp.wav")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", str(tmp)], input=st.astype(np.float32).tobytes(), check=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(tmp), "-af", "loudnorm=I=-18:TP=-2:LRA=7", "-ar", str(SR), "-ac", "2", str(path)], check=True)
    tmp.unlink()

def main():
    a = sys.argv[1:]
    if len(a) < 2: sys.exit(__doc__)
    out = Path(a.pop(0)); out.mkdir(parents=True, exist_ok=True)
    ref = scene = None; roomtone = None
    if "--ref" in a: i = a.index("--ref"); ref = Path(a[i + 1]); del a[i:i + 2]
    if "--roomtone" in a: i = a.index("--roomtone"); roomtone = float(a[i + 1]); del a[i:i + 2]
    if "--scene" in a: a.remove("--scene"); scene = True
    clips = [Path(p) for p in a]
    if scene:
        for c in clips:
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(c), "-af", SCENE + ",loudnorm=I=-18:TP=-2:LRA=7", "-ar", str(SR), "-ac", "2", str(out / f"{c.stem}.wav")], check=True)
            print(f"{c.stem:10s} 场景：去齿音 + 响度")
    else:
        B = {c: band_db(load(c)) for c in clips}
        pool = [band_db(load(p)) for p in sorted(ref.glob("*.mp4"))] if ref else list(B.values())
        med = np.median(np.stack(pool), 0)
        for c in clips:
            g = np.clip(med - B[c], -4, 4)
            tl = tail_ms(load(c)); wet = float(np.clip(0.24 - (tl - 60) / 320 * 0.16, 0.08, 0.24))
            write(out / f"{c.stem}.wav", roomify(load(c, fq(g) + "," + CHAIN), wet))
            print(f"{c.stem:10s} 频谱修正 {np.abs(g).max():.1f} dB  混响 wet {wet:.2f}（原尾巴 {tl} ms）")
    if roomtone:
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"anoisesrc=d={roomtone}:c=brown:r={SR}:a=0.02", "-af", "lowpass=f=1800,highpass=f=60,volume=-14dB", "-ac", "2", str(out / "roomtone.wav")], check=True)
        print("roomtone.wav 完成")

if __name__ == "__main__":
    main()
