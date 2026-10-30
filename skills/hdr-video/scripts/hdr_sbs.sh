#!/bin/bash
# usage: hdr_sbs.sh in.mp4 start dur out.mp4 [lut args...]
#   A/B in ONE HLG file, full frame on each side (fits 928x522 each, on a 1920x1080 black canvas):
#   left = SDR (white at 203 nit, no boost), right = HDR (hdr_lut.py with your args).
#   Only meaningful on an HDR display; labels need Pillow (skipped without it). env: CRF (default 15)
set -e
[ $# -ge 4 ] || { sed -n '2,6p' "$0" >&2; exit 2; }
HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/common.sh"
IN=$(abs "$1"); SS=$2; DUR=$3; OUT=$(abs "$4"); shift 4
check_sdr_source "$IN"
WORK=$(mktemp -d "${TMPDIR:-/tmp}/hdr-video.XXXXXX"); trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
python3 -I "$HERE/hdr_lut.py" sdr2hlg.cube "$@"
python3 -I "$HERE/hdr_lut.py" sdr_ref.cube --peak 203   # same pipeline minus the boost = SDR sitting in an HLG container

# labels sit in the black bar above each picture; greys only, text at 75% signal = 203 nit so they don't glare
if python3 -I - <<'EOF'
from PIL import Image, ImageDraw, ImageFont

def font(size):
    for p in ("/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default(size)

im = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
big, small = font(38), font(22)
for cx, title, sub in ((480, "SDR", "white at 203 nit"), (1440, "HDR", "HLG  ·  boosted brightness")):
    d.text((cx - d.textlength(title, font=big) / 2, 196), title, font=big, fill=(191, 191, 191, 255))
    d.text((cx - d.textlength(sub, font=small) / 2, 244), sub, font=small, fill=(128, 128, 128, 255))
im.save("labels_sbs.png")
EOF
then LABELS=1; else LABELS=0; echo "note: Pillow not available, rendering without labels" >&2; fi

BOX="scale=928:522:force_original_aspect_ratio=decrease:flags=lanczos,pad=960:1080:(960-iw)/2:(1080-ih)/2:color=black"
FC="[0:v]$(in_stage),split=2[a][b];
[a]lut3d=file=sdr_ref.cube:interp=tetrahedral,$BOX[l];
[b]lut3d=file=sdr2hlg.cube:interp=tetrahedral,$BOX[r];
[l][r]hstack,$OUT_STAGE"
INPUTS=(-ss "$SS" -t "$DUR" -i "$IN")
if [ "$LABELS" = 1 ]; then
  # overlay defaults to 8-bit output (yuv420): format=yuv420p10 keeps the 10 bits
  INPUTS+=(-i labels_sbs.png)
  FC="$FC[v];[v][1:v]overlay=0:0:format=yuv420p10,format=yuv420p10le,$TAG[out]"
else
  FC="$FC,$TAG[out]"
fi
ffmpeg -v error -y "${INPUTS[@]}" -filter_complex "$FC" -map "[out]" -map "0:a:0?" "${ENC[@]}" "$OUT"
verify_hlg "$OUT"
