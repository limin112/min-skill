#!/usr/bin/env python3
"""合成一段原创「魔法学院」配乐（纯代码生成，无采样、无版权问题）→ edit/public/music/score.mp3

用法：python3 tools/make_score.py [秒数，默认 240]
D 小调 i–VI–III–VII（Dm–B♭–F–C），每和弦 4 拍 @ 72 BPM：
  低音持续音 + 弦乐铺底（失谐锯齿波 + 低通）+ 钢片琴琶音（正弦 + 泛音，快衰减）+ 每 4 小节一记轻定音鼓 + 卷积混响
"""
import subprocess, sys, wave
import numpy as np

SR = 44100
SEC = float(sys.argv[1]) if len(sys.argv) > 1 else 240
BPM = 72; BEAT = 60 / BPM; BAR = BEAT * 4
rng = np.random.default_rng(7)
n = int(SR * SEC); L = np.zeros(n); R = np.zeros(n)
t_all = np.arange(n) / SR

def hz(m): return 440 * 2 ** ((m - 69) / 12)
CH = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]]   # Dm, B♭, F, C（MIDI）

def lowpass(x, a):
    """一阶低通 y[i] = y[i-1] + a·(x[i] − y[i-1])；有 scipy 用 lfilter，没有就逐点算（慢一点）"""
    try:
        from scipy.signal import lfilter
        return lfilter([a], [1, a - 1], x)
    except ImportError:
        y = np.empty_like(x); acc = 0.0
        for i in range(len(x)): acc += a * (x[i] - acc); y[i] = acc
        return y

def add(buf, start, sig, gain=1.0):
    s = int(start * SR); e = min(len(buf), s + len(sig))
    if s < len(buf): buf[s:e] += gain * sig[:e - s]

# 弦乐铺底：每和弦一个长音，失谐锯齿 → 一阶低通（向量化：先合成再整体滤波）
pad = np.zeros(n)
bars = int(SEC / BAR) + 1
for b in range(bars):
    ch = CH[b % 4]; st = b * BAR; d = BAR + 0.6
    tt = np.arange(int(SR * d)) / SR
    env = np.minimum(1, tt / 1.2) * np.minimum(1, (d - tt) / 1.0)
    sig = sum(((tt * hz(m + 12) * (1 + det)) % 1 * 2 - 1) for m in ch for det in (-0.004, 0.0, 0.005)) / 9
    add(pad, st, sig * env)
pad = lowpass(pad, 0.035)
# 每 16 小节做一次长呼吸（片头、段落感）
swell = 0.75 + 0.25 * np.sin(2 * np.pi * t_all / (BAR * 16) - np.pi / 2)
L += 0.55 * pad * swell; R += 0.55 * np.roll(pad, 220) * swell

# 低音持续音：根音低八度正弦 + 一点二次谐波
for b in range(bars):
    root = CH[b % 4][0] - 12; d = BAR + 0.3
    tt = np.arange(int(SR * d)) / SR
    env = np.minimum(1, tt / 0.6) * np.minimum(1, (d - tt) / 0.5)
    sig = np.sin(2 * np.pi * hz(root) * tt) + 0.25 * np.sin(4 * np.pi * hz(root) * tt)
    add(L, b * BAR, 0.32 * sig * env); add(R, b * BAR, 0.32 * sig * env)

# 钢片琴琶音：八分音符上行，偶尔高八度点缀，左右轻微摆位
arp = [0, 1, 2, 1, 0, 2, 1, 2]
for b in range(bars):
    ch = CH[b % 4]
    for k in range(8):
        st = b * BAR + k * BEAT / 2 + rng.normal(0, 0.004)
        m = ch[arp[k]] + 24 + (12 if rng.random() < 0.12 else 0)
        d = 1.2; tt = np.arange(int(SR * d)) / SR
        env = np.exp(-tt * 4.5) * np.minimum(1, tt / 0.004)
        sig = (np.sin(2 * np.pi * hz(m) * tt) + 0.35 * np.sin(2 * np.pi * hz(m) * 3.01 * tt) * np.exp(-tt * 9)) * env
        g = 0.16 * (0.7 + 0.3 * rng.random()) * (0.4 if b < 2 else 1.0)   # 开头两小节先轻一点
        pan = 0.5 + 0.35 * np.sin(k)
        add(L, st, g * (1 - pan) * 2 * sig); add(R, st, g * pan * 2 * sig)

# 轻定音鼓：每 4 小节第一拍
for b in range(0, bars, 4):
    d = 1.6; tt = np.arange(int(SR * d)) / SR
    f = hz(38) * (1 + 0.5 * np.exp(-tt * 18))
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 3.2) + 0.15 * rng.normal(0, 1, len(tt)) * np.exp(-tt * 25)
    add(L, b * BAR, 0.45 * sig); add(R, b * BAR, 0.45 * sig)

# 卷积混响：2.4 秒指数衰减噪声当 IR，左右独立
ir_n = int(SR * 2.4); decay = np.exp(-np.arange(ir_n) / SR * 2.6)
def reverb(x, seed):
    ir = np.random.default_rng(seed).normal(0, 1, ir_n) * decay; ir /= np.sqrt((ir ** 2).sum())
    m = 1 << int(np.ceil(np.log2(len(x) + ir_n)))
    return np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[:len(x)]
L = 0.72 * L + 0.42 * reverb(L, 1); R = 0.72 * R + 0.42 * reverb(R, 2)

# 首尾淡入淡出 + 归一
fade = np.minimum(1, t_all / 3.0) * np.minimum(1, (SEC - t_all) / 4.0)
st = np.stack([L * fade, R * fade], 1); st /= np.abs(st).max() * 1.12
wav = "/tmp/_score.wav"
with wave.open(wav, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype("<i2").tobytes())
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-af", "loudnorm=I=-18:TP=-2", "-b:a", "192k", "edit/public/music/score.mp3"], check=True)
print(f"✓ edit/public/music/score.mp3（{SEC:.0f} 秒，D 小调 · {BPM} BPM）")
