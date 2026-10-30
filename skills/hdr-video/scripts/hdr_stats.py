#!/usr/bin/env python3
"""Luma distribution of a video file, as limited-range signal 0-100% -- compare an SDR source, a reference clip, your HDR render.

usage: python3 -I hdr_stats.py video.mp4 [--ss 0] [--t 1e9] [--fps 2] [--crop W:H:X:Y] [--scale 480:270]

Reads the raw Y plane (extractplanes, no range conversion) and accumulates a histogram, so any resolution/length is fine.
Assumes a limited-range file (8-bit 16-235 / 10-bit 64-940), which is what both SDR and HLG deliveries normally are.
Needs numpy + ffmpeg/ffprobe.
"""
import argparse
import subprocess

import numpy as np


def probe(path, entry):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", f"stream={entry}",
                          "-of", "default=nw=1:nk=1", path], capture_output=True, text=True).stdout.split()
    return out[0] if out else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--ss", type=float, default=0.0)
    ap.add_argument("--t", type=float, default=1e9)
    ap.add_argument("--fps", type=float, default=2.0)
    ap.add_argument("--crop", help="W:H:X:Y, measure only this region")
    ap.add_argument("--scale", help="W:H, downscale before measuring (faster)")
    a = ap.parse_args()

    eight = probe(a.video, "pix_fmt") in ("yuv420p", "yuvj420p", "yuv422p", "yuv444p", "nv12")
    # extractplanes cannot negotiate a format on its own for some inputs -> always put an explicit format before it
    vf = [f"fps={a.fps}"]
    if a.crop:
        vf.append(f"crop={a.crop}")
    if a.scale:
        vf.append(f"scale={a.scale}:flags=area")
    vf += ["format=yuv420p" if eight else "format=yuv420p10le", "extractplanes=y"]
    bps = 1 if eight else 2
    cmd = ["ffmpeg", "-v", "error", "-ss", str(a.ss), "-t", str(a.t), "-i", a.video, "-an", "-vf", ",".join(vf),
           "-f", "rawvideo", "-pix_fmt", "gray" if eight else "gray10le", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    counts, rest = np.zeros(1024), b""
    while True:
        buf = p.stdout.read(1 << 22)
        if not buf:
            break
        buf = rest + buf
        n = len(buf) // bps * bps
        arr = np.frombuffer(buf[:n], dtype=np.uint8 if eight else "<u2")
        counts += np.bincount(arr, minlength=1024)[:1024]
        rest = buf[n:]
    if p.wait() or counts.sum() == 0:
        raise SystemExit("no frames decoded -- check the path / --crop")

    lo, span = (16, 219) if eight else (64, 876)
    sig = np.clip((np.arange(1024) - lo) / span, 0, 1.1)
    total = counts.sum()
    cdf = np.cumsum(counts) / total
    pct = lambda q: 100 * sig[np.searchsorted(cdf, q / 100)]
    share = lambda thr: 100 * counts[sig > thr].sum() / total
    codes = np.nonzero(counts)[0]
    print("%d-bit | mean %4.1f%% | p50 %4.1f%% | p90 %5.1f%% | p99 %5.1f%% | >75%% %5.1f%% | >90%% %5.1f%% | >=98%% %4.1f%% | raw Y %d-%d" % (
        8 if eight else 10, 100 * (sig * counts).sum() / total, pct(50), pct(90), pct(99), share(.75), share(.90),
        100 * counts[sig >= .98].sum() / total, codes[0], codes[-1]))


if __name__ == "__main__":
    main()
