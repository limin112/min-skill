#!/usr/bin/env python3
"""BT.709 SDR -> BT.2020 HLG 3D LUT (.cube), full-range RGB in / full-range RGB out.

usage: python3 -I hdr_lut.py out.cube [--white 203] [--peak 1000] [--knee 0.45] [--power 2.2] [--size 65]
       python3 -I hdr_lut.py --table     # expected HLG values for a few test colours (self-test reference)

Pipeline per pixel (BT.2408 style):
  gamma-2.4 decode -> luminance curve (SDR white -> `white` nits, highlights above `knee`
  expand towards `peak` nits) -> 709->2020 primaries -> HLG inverse OOTF (1000 nit, gamma 1.2) -> HLG OETF
"""
import argparse
import sys

import numpy as np

M709_TO_2020 = np.array([[0.627404, 0.329283, 0.043313],
                         [0.069097, 0.919540, 0.011362],
                         [0.016391, 0.088013, 0.895595]])
Y709 = np.array([0.2126, 0.7152, 0.0722])
Y2020 = np.array([0.2627, 0.6780, 0.0593])
HLG_A, HLG_B, HLG_C = 0.17883277, 0.28466892, 0.55991073


def hlg_oetf(e):
    e = np.clip(e, 0.0, 1.0)
    return np.where(e <= 1 / 12, np.sqrt(3 * e), HLG_A * np.log(np.maximum(12 * e - HLG_B, 1e-12)) + HLG_C)


def sdr_to_hlg(rgb, white=203.0, peak=1000.0, knee=0.45, power=2.2, lw=1000.0, gamma=1.2):
    lin = np.power(np.clip(rgb, 0.0, 1.0), 2.4)
    y = lin @ Y709
    expand = np.clip((y - knee) / (1 - knee), 0.0, 1.0) ** power
    nits = white * y + (peak - white) * expand
    gain = np.where(y > 1e-6, nits / np.maximum(y, 1e-6), white)
    disp = (lin * gain[..., None]) @ M709_TO_2020.T / lw
    yd = disp @ Y2020
    norm = np.where(yd > 1e-9, np.power(np.maximum(yd, 1e-9), (gamma - 1) / gamma), 1.0)
    return hlg_oetf(disp / norm[..., None])


def write_cube(path, size, **kw):
    g = np.linspace(0.0, 1.0, size)
    bb, gg, rr = np.meshgrid(g, g, g, indexing="ij")  # red varies fastest, as .cube expects
    out = sdr_to_hlg(np.stack([rr, gg, bb], -1).reshape(-1, 3), **kw)
    with open(path, "w") as f:
        f.write(f"TITLE \"sdr709_to_hlg2020\"\nLUT_3D_SIZE {size}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n")
        np.savetxt(f, out, fmt="%.6f")


def table(**kw):
    tests = [(0, 0, 0), (.1, .1, .1), (.25, .25, .25), (.5, .5, .5), (.75, .75, .75),
             (.9, .9, .9), (1, 1, 1), (1, 0, 0), (0, 1, 0), (.8, .6, .5)]
    for rgb in tests:
        o = sdr_to_hlg(np.array(rgb, dtype=float), **kw)
        y10 = 64 + 876 * float(o @ Y2020)  # 10-bit limited-range luma, bt2020nc
        print("in %-18s -> hlg %.4f %.4f %.4f   Y10 %.1f" % (rgb, *o, y10))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("out", nargs="?")
    ap.add_argument("--table", action="store_true")
    ap.add_argument("--white", type=float, default=203.0)
    ap.add_argument("--peak", type=float, default=1000.0)
    ap.add_argument("--knee", type=float, default=0.45)
    ap.add_argument("--power", type=float, default=2.2)
    ap.add_argument("--size", type=int, default=65)
    a = ap.parse_args()
    kw = dict(white=a.white, peak=a.peak, knee=a.knee, power=a.power)
    if a.table:
        table(**kw)
    elif a.out:
        write_cube(a.out, a.size, **kw)
    else:
        sys.exit(ap.format_usage())
