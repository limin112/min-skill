#!/usr/bin/env python3
"""Render SRT cues as transparent PNGs and emit an ffmpeg burn-in script.

Needed because Homebrew's ffmpeg is often built without libass, so the
`subtitles=` filter does not exist. Overlaying pre-rendered PNGs gated by
`enable='between(t,start,end)'` gives the same result with no libass, and gives
full control over the caption box style.

Also more reliable than libass for CJK: the font is chosen here, explicitly.

Usage:
  render_captions.py --srt audio/voice.srt --project presentations/foo \\
      --input record/animated_trimmed.mp4 --output record/animated_captioned.mp4
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Supplemental/Songti.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]

CUE_RE = re.compile(r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})")


def parse_srt(path: Path) -> list[tuple[float, float, str]]:
    cues = []
    for block in re.split(r"\n\s*\n", path.read_text(encoding="utf-8").strip()):
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        m = CUE_RE.match(lines[1])
        if not m:
            continue
        h1, m1, s1, ms1, h2, m2, s2, ms2 = map(int, m.groups())
        cues.append((
            h1 * 3600 + m1 * 60 + s1 + ms1 / 1000,
            h2 * 3600 + m2 * 60 + s2 + ms2 / 1000,
            "\n".join(lines[2:]).strip(),
        ))
    return cues


def pick_font(explicit: str | None, size: int) -> ImageFont.FreeTypeFont:
    for cand in ([explicit] if explicit else []) + FONT_CANDIDATES:
        if cand and Path(cand).exists():
            return ImageFont.truetype(cand, size)
    raise SystemExit("no CJK-capable font found; pass --font /path/to/font.ttf")


def render_cue(text: str, font, size: tuple[int, int], margin: int, opacity: int) -> Image.Image:
    W, H = size
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    lines = text.split("\n")
    dims = []
    for line in lines:
        bb = draw.textbbox((0, 0), line, font=font)
        dims.append((bb[2] - bb[0], bb[3] - bb[1]))
    tw = max(d[0] for d in dims)
    th = sum(d[1] for d in dims) + (len(lines) - 1) * 12
    pad_x, pad_y = 40, 24
    box_w, box_h = tw + pad_x * 2, th + pad_y * 2
    box_x, box_y = (W - box_w) // 2, H - box_h - margin
    draw.rounded_rectangle(
        [box_x, box_y, box_x + box_w, box_y + box_h], radius=18, fill=(14, 17, 20, opacity)
    )
    y = box_y + pad_y
    for line, (lw, lh) in zip(lines, dims):
        x = (W - lw) // 2
        draw.text((x + 1, y + 1), line, font=font, fill=(0, 0, 0, 140))
        draw.text((x, y), line, font=font, fill=(255, 255, 255, 255))
        y += lh + 12
    return img


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--srt", type=Path, required=True)
    ap.add_argument("--project", type=Path, required=True)
    ap.add_argument("--input", type=Path, required=True, help="video to burn onto")
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--font", default=None)
    ap.add_argument("--font-size", type=int, default=44)
    ap.add_argument("--margin", type=int, default=70, help="px from bottom edge")
    ap.add_argument("--opacity", type=int, default=205, help="caption box alpha 0-255")
    ap.add_argument("--crf", type=int, default=17)
    args = ap.parse_args()

    cues = parse_srt(args.srt)
    if not cues:
        raise SystemExit(f"no cues parsed from {args.srt}")

    cap_dir = args.project / "record" / "caps"
    if cap_dir.exists():
        shutil.rmtree(cap_dir)
    cap_dir.mkdir(parents=True)

    font = pick_font(args.font, args.font_size)
    meta = []
    for i, (start, end, text) in enumerate(cues, 1):
        img = render_cue(text, font, (args.width, args.height), args.margin, args.opacity)
        path = cap_dir / f"cap_{i:03d}.png"
        img.save(path)
        meta.append({"i": i, "start": start, "end": end, "path": str(path.resolve())})

    (args.project / "record" / "caps_meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # One overlay per cue, chained. ~30 cues is fine; several hundred will blow
    # up ffmpeg's filter graph — split the video into parts if you get there.
    inputs = ["-i", str(args.input)]
    parts, last = [], "[0:v]"
    for idx, m in enumerate(meta):
        inputs += ["-i", m["path"]]
        out = f"[v{idx + 1}]"
        enable = rf"between(t\,{m['start']:.3f}\,{m['end']:.3f})"
        parts.append(f"{last}[{idx + 1}:v]overlay=0:0:enable='{enable}'{out}")
        last = out

    args.output.parent.mkdir(parents=True, exist_ok=True)
    cmd = (
        "ffmpeg -y -hide_banner -loglevel error "
        + " ".join(inputs)
        + f' -filter_complex "{";".join(parts)}"'
        + f' -map "{last}" -c:v libx264 -preset medium -crf {args.crf}'
        + f" -pix_fmt yuv420p -an {args.output}\n"
    )
    script = args.project / "record" / "burn_caps.sh"
    script.write_text(cmd, encoding="utf-8")
    print(f"{len(meta)} caption PNGs -> {cap_dir}")
    print(f"burn script -> {script}")


if __name__ == "__main__":
    main()
