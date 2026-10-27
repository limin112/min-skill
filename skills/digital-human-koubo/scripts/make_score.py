#!/usr/bin/env python3
"""代码合成原创配乐（纯 numpy，无采样、无版权问题）→ mp3，响度 -18 LUFS，垫在口播底下用。

用法：python3 make_score.py [--mood magic|tech|warm|epic] [--sec 240] [--seed 7] [--out edit/public/music/score.mp3]
      python3 make_score.py --list          看各情绪的配置
情绪：
  magic  魔幻 · D 小调 72 BPM：弦乐铺底 + 钢片琴琶音 + 轻定音鼓 + 长混响（奇幻、学院、夜晚）
  tech   科技 · A 小调 112 BPM：合成器铺底 + 方波琶音 + 八分音符脉冲贝斯 + 轻电子鼓（AI、编程、产品发布）
  warm   温暖 · C 大调 84 BPM：柔和铺底 + 钢琴感分解和弦 + 指弹低音，几乎不打鼓（生活、故事、教程）
  epic   史诗 · C 小调 90 BPM：厚铺底 + 铜管感长音 + 战鼓 + 大混响（发布会、里程碑、宏大叙事）
episode.json → music.mood 写了情绪的话，build_tl.py 之后直接跑这个脚本不带 --mood 也会读它。
"""
import json, subprocess, sys, wave
from pathlib import Path
import numpy as np

MOODS = {
    "magic": dict(name="魔幻", bpm=72, chords=[[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]],   # Dm B♭ F C
                  pad="saw", pad_cut=0.035, pad_gain=0.55, bass="drone", arp="bell", arp_rate=2, arp_gain=0.16,
                  drums="timpani", reverb=(2.4, 2.6, 0.42)),
    "tech":  dict(name="科技", bpm=112, chords=[[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],   # Am F C G
                  pad="saw", pad_cut=0.05, pad_gain=0.38, bass="pulse", arp="square", arp_rate=4, arp_gain=0.10,
                  drums="electro", reverb=(1.2, 4.0, 0.25)),
    "warm":  dict(name="温暖", bpm=84, chords=[[48, 52, 55], [45, 48, 52], [53, 57, 60], [55, 59, 62]],    # C Am F G
                  pad="sine", pad_cut=0.03, pad_gain=0.42, bass="pluck", arp="piano", arp_rate=2, arp_gain=0.20,
                  drums="none", reverb=(1.8, 3.2, 0.32)),
    "epic":  dict(name="史诗", bpm=90, chords=[[48, 51, 55], [44, 48, 51], [51, 55, 58], [46, 50, 53]],    # Cm A♭ E♭ B♭
                  pad="saw", pad_cut=0.045, pad_gain=0.62, bass="drone", arp="brass", arp_rate=1, arp_gain=0.22,
                  drums="war", reverb=(3.0, 2.0, 0.5)),
}

a = sys.argv[1:]
opt = lambda k, d: a[a.index(k) + 1] if k in a else d
if "--list" in a:
    for k, m in MOODS.items(): print(f"{k:6s} {m['name']}  {m['bpm']} BPM  鼓:{m['drums']}  琶音:{m['arp']}")
    sys.exit()
EP = json.loads(Path("episode.json").read_text()) if Path("episode.json").exists() else {}
MOOD = opt("--mood", (EP.get("music") or {}).get("mood", "magic"))
if MOOD not in MOODS: sys.exit(f"没有这个情绪：{MOOD}（可选 {' / '.join(MOODS)}）")
M = MOODS[MOOD]
SEC = float(opt("--sec", 240)); OUT = Path(opt("--out", "edit/public/music/score.mp3"))
SR = 44100; BEAT = 60 / M["bpm"]; BAR = BEAT * 4
rng = np.random.default_rng(int(opt("--seed", 7)))
n = int(SR * SEC); L = np.zeros(n); R = np.zeros(n); t_all = np.arange(n) / SR
bars = int(SEC / BAR) + 1
CH = M["chords"]
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
tt_ = lambda d: np.arange(int(SR * d)) / SR


def lowpass(x, k):
    """一阶低通；有 scipy 用 lfilter，没有就逐点算（慢一点）"""
    try:
        from scipy.signal import lfilter
        return lfilter([k], [1, k - 1], x)
    except ImportError:
        y = np.empty_like(x); acc = 0.0
        for i in range(len(x)): acc += k * (x[i] - acc); y[i] = acc
        return y


def osc(f, tt, odd=False, nh=10):
    """限带锯齿 / 方波（加法合成前 nh 个谐波），高音不会混叠出刺耳的全频噪声"""
    ks = range(1, 2 * nh, 2) if odd else range(1, nh + 1)
    return sum(np.sin(2 * np.pi * f * k * tt) / k for k in ks if f * k < SR / 2.5) * (4 / np.pi if odd else 2 / np.pi)


def add(buf, start, sig, gain=1.0):
    s = int(start * SR); e = min(len(buf), s + len(sig))
    if 0 <= s < len(buf): buf[s:e] += gain * sig[:e - s]


def both(start, sig, gain=1.0, pan=0.5):
    add(L, start, sig, gain * (1 - pan) * 2); add(R, start, sig, gain * pan * 2)


# 铺底：每小节一个和弦长音
pad = np.zeros(n)
for b in range(bars):
    d = BAR + 0.6; tt = tt_(d)
    env = np.minimum(1, tt / 1.2) * np.minimum(1, (d - tt) / 1.0)
    if M["pad"] == "saw":
        sig = sum(((tt * hz(m + 12) * (1 + det)) % 1 * 2 - 1) for m in CH[b % 4] for det in (-0.004, 0.0, 0.005)) / 9
    else:
        sig = sum(np.sin(2 * np.pi * hz(m + 12) * (1 + det) * tt) for m in CH[b % 4] for det in (-0.002, 0.002)) / 6
    add(pad, b * BAR, sig * env)
pad = lowpass(pad, M["pad_cut"])
swell = 0.75 + 0.25 * np.sin(2 * np.pi * t_all / (BAR * 16) - np.pi / 2)   # 每 16 小节一次长呼吸
L += M["pad_gain"] * pad * swell; R += M["pad_gain"] * np.roll(pad, 220) * swell

# 低音
for b in range(bars):
    root = CH[b % 4][0] - 12
    if M["bass"] == "drone":
        d = BAR + 0.3; tt = tt_(d); env = np.minimum(1, tt / 0.6) * np.minimum(1, (d - tt) / 0.5)
        both(b * BAR, (np.sin(2 * np.pi * hz(root) * tt) + 0.25 * np.sin(4 * np.pi * hz(root) * tt)) * env, 0.16)
    elif M["bass"] == "pulse":   # 八分音符脉冲，略带锯齿
        for k in range(8):
            d = BEAT / 2 * 0.9; tt = tt_(d); env = np.exp(-tt * 7) * np.minimum(1, tt / 0.003)
            sig = 0.7 * np.sin(2 * np.pi * hz(root) * tt) + 0.3 * ((tt * hz(root)) % 1 * 2 - 1)
            both(b * BAR + k * BEAT / 2, lowpass(sig, 0.12) * env, 0.22)
    else:                        # pluck：一拍、三拍弹根音和五度
        for k, iv in ((0, 0), (2, 7)):
            d = BEAT * 1.8; tt = tt_(d); env = np.exp(-tt * 3) * np.minimum(1, tt / 0.004)
            both(b * BAR + k * BEAT, np.sin(2 * np.pi * hz(root + iv) * tt) * env, 0.2)

# 旋律层：分解和弦 / 长音
ARP = [0, 1, 2, 1, 0, 2, 1, 2]
for b in range(bars):
    ch = CH[b % 4]; quiet = 0.4 if b < 2 else 1.0   # 开头两小节先轻一点
    steps = 4 * M["arp_rate"]
    for k in range(steps):
        st = b * BAR + k * BEAT / M["arp_rate"] + rng.normal(0, 0.004)
        m = ch[ARP[k % 8]] + 24 + (12 if rng.random() < 0.12 else 0)
        g = M["arp_gain"] * (0.7 + 0.3 * rng.random()) * quiet; pan = 0.5 + 0.35 * np.sin(k)
        if M["arp"] == "bell":      # 钢片琴：正弦 + 非整数泛音，快衰减
            d = 1.2; tt = tt_(d); env = np.exp(-tt * 4.5) * np.minimum(1, tt / 0.004)
            sig = (np.sin(2 * np.pi * hz(m) * tt) + 0.35 * np.sin(2 * np.pi * hz(m) * 3.01 * tt) * np.exp(-tt * 9)) * env
        elif M["arp"] == "square":  # 方波 + 低通，短促
            d = 0.35; tt = tt_(d); env = np.exp(-tt * 12) * np.minimum(1, tt / 0.002)
            sig = osc(hz(m), tt, odd=True, nh=5) * env
        elif M["arp"] == "piano":   # 钢琴感：几个整数泛音，越高衰减越快
            m -= 12; d = 2.0; tt = tt_(d)
            sig = sum(np.sin(2 * np.pi * hz(m) * h * tt) * np.exp(-tt * (2.2 + h * 1.5)) / h for h in (1, 2, 3, 4)) * np.minimum(1, tt / 0.003)
        else:                       # brass：每拍一个长音，慢起，锯齿低通
            if k % 2: continue
            m -= 12; d = BEAT * 2.1; tt = tt_(d)
            env = np.minimum(1, tt / 0.25) * np.minimum(1, (d - tt) / 0.3)
            sig = sum(osc(hz(mm) * (1 + det), tt, nh=6) for mm in (m, m - 12) for det in (-0.003, 0.003)) / 4 * env
        both(st, sig, g, pan)

# 鼓
def kick(pitch=48, dec=3.2, noise=0.15, d=1.4):
    tt = tt_(d); f = hz(pitch) * (1 + 0.5 * np.exp(-tt * 18))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * dec) + noise * rng.normal(0, 1, len(tt)) * np.exp(-tt * 25)

def hat(d=0.06):
    """白噪声减去它自己的低通 = 高通，只留嘶嘶的高频"""
    tt = tt_(d); x = rng.normal(0, 1, len(tt)); return (x - lowpass(x, 0.35)) * np.exp(-tt * 70)

for b in range(bars):
    if b < 2 and M["drums"] != "timpani": continue   # 前两小节不进鼓
    if M["drums"] == "timpani" and b % 4 == 0:
        both(b * BAR, kick(38, 3.2, 0.15, 1.6), 0.45)
    elif M["drums"] == "electro":
        for k in (0, 2): both(b * BAR + k * BEAT, kick(36, 9, 0.05, 0.5), 0.5)
        for k in range(8): both(b * BAR + k * BEAT / 2, hat(), 0.05 if k % 2 else 0.03, 0.62)
    elif M["drums"] == "war":
        both(b * BAR, kick(36, 2.6, 0.08, 2.0), 0.6)
        if b % 2: both(b * BAR + 2.5 * BEAT, kick(41, 4, 0.1, 1.2), 0.35, 0.35); both(b * BAR + 3 * BEAT, kick(41, 4, 0.1, 1.2), 0.4, 0.65)

# 卷积混响：指数衰减的噪声当 IR，左右独立
ir_sec, ir_dec, wet = M["reverb"]
ir_n = int(SR * ir_sec); decay = np.exp(-np.arange(ir_n) / SR * ir_dec)
def reverb(x, seed):
    ir = lowpass(np.random.default_rng(seed).normal(0, 1, ir_n), 0.18) * decay; ir /= np.sqrt((ir ** 2).sum())   # 低通过的噪声：混响尾巴发暗，像真房间
    m = 1 << int(np.ceil(np.log2(len(x) + ir_n)))
    return np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[:len(x)]
L = 0.72 * L + wet * reverb(L, 1); R = 0.72 * R + wet * reverb(R, 2)

fade = np.minimum(1, t_all / 3.0) * np.minimum(1, (SEC - t_all) / 4.0)
st = np.stack([L * fade, R * fade], 1); st /= np.abs(st).max() * 1.12
OUT.parent.mkdir(parents=True, exist_ok=True)
wav = OUT.with_suffix(".tmp.wav")
with wave.open(str(wav), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype("<i2").tobytes())
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-af", "loudnorm=I=-18:TP=-2", "-b:a", "192k", str(OUT)], check=True)
wav.unlink()
print(f"✓ {OUT}（{SEC:.0f} 秒 · {M['name']} · {M['bpm']} BPM）")
