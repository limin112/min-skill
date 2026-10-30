#!/usr/bin/env python3
"""Predict luma stats of an SDR -> HLG conversion for several LUT parameter sets, without rendering anything.

usage: python3 -I hdr_tune.py src.mp4 [--ss 0] [--t 9999] [--try white=650,knee=0.35,power=1.8 ...]

Needs numpy + ffmpeg/ffprobe. Samples the source at <=120 frames, 320x180, and pushes them through the same
maths as hdr_lut.py. All levels are HLG signal %, limited range (75% = 203 nit reference white, 100% = peak).
"""
import argparse
import os
import runpy
import subprocess

import numpy as np

lut = runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "hdr_lut.py"))
sdr_to_hlg, Y2020 = lut["sdr_to_hlg"], lut["Y2020"]

PRESETS = [
    ("plain SDR, no boost (203 nit)", dict(peak=203.0)),
    ("default 203/.45/2.2 (highlights only)", dict()),
    ("bright  650/.35/1.8", dict(white=650.0, knee=0.35, power=1.8)),
    ("ceiling white=1000", dict(white=1000.0, peak=1000.0)),
]
W, H = 320, 180


def probe(path, entry, section="stream"):
    sel = "-select_streams v:0 " if section == "stream" else ""
    out = subprocess.run(f"ffprobe -v error {sel}-show_entries {section}={entry} -of default=nw=1:nk=1 '{path}'",
                         shell=True, capture_output=True, text=True).stdout.split()
    return out[0] if out else ""


def parse_try(s):
    return {k: float(v) for k, v in (kv.split("=") for kv in s.split(","))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--ss", type=float, default=0.0)
    ap.add_argument("--t", type=float, default=1e9)
    ap.add_argument("--try", dest="tries", action="append", default=[], metavar="white=..,knee=..,power=..,peak=..")
    a = ap.parse_args()

    total = float(probe(a.src, "duration", "format") or 0)
    eff = max(min(a.t, total - a.ss), 1.0)
    fps = min(1.0, 120.0 / eff)
    matrix = "bt601" if probe(a.src, "color_space") in ("smpte170m", "bt470bg") else "bt709"
    rng = "pc" if probe(a.src, "color_range") in ("pc", "jpeg") else "tv"
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(a.ss), "-t", str(a.t), "-i", a.src, "-an", "-vf",
                          f"fps={fps},scale={W}:{H}:flags=area,scale=in_color_matrix={matrix}:in_range={rng}:out_range=pc:flags=accurate_rnd,format=rgb24",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    if not raw:
        raise SystemExit("ffmpeg returned no frames -- is the path right?")
    rgb = (np.frombuffer(raw, dtype=np.uint8).astype(np.float64) / 255).reshape(-1, 3)
    print("sampled %d frames (%s matrix, %s range)" % (len(rgb) // (W * H), matrix, rng))
    print("reference, natural daylight HDR clip: mean 42.1% | p50 40.2% | p90  72.6% | p99  97.7% | >90%   2.6% | luma>=98%  0.9%")
    for name, kw in PRESETS + [("try " + t, parse_try(t)) for t in a.tries]:
        out = sdr_to_hlg(rgb, **kw)
        s = out @ Y2020
        print("%-38s mean %4.1f%% | p50 %4.1f%% | p90 %5.1f%% | p99 %5.1f%% | >90%% %5.1f%% | luma>=98%% %4.1f%% | any-ch clipped %4.1f%%" % (
            name, 100 * s.mean(), 100 * np.percentile(s, 50), 100 * np.percentile(s, 90), 100 * np.percentile(s, 99),
            100 * (s > .90).mean(), 100 * (s >= .98).mean(), 100 * (out.max(axis=1) >= .999).mean()))


if __name__ == "__main__":
    main()
