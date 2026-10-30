#!/bin/bash
# usage: hdr_clip.sh in.mp4 start dur out.mp4 [lut args...]
#   SDR video -> 10-bit HEVC, HLG / BT.2020 (highlights glow on HDR screens). Native resolution and fps.
#   lut args go to hdr_lut.py, e.g. --white 650 --knee 0.35 --power 1.8   (see SKILL.md)
#   env: CRF (default 15; 18 is plenty for a low-bitrate source)
set -e
[ $# -ge 4 ] || { sed -n '2,6p' "$0" >&2; exit 2; }
HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/common.sh"
IN=$(abs "$1"); SS=$2; DUR=$3; OUT=$(abs "$4"); shift 4
check_sdr_source "$IN"
WORK=$(mktemp -d "${TMPDIR:-/tmp}/hdr-video.XXXXXX"); trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
python3 -I "$HERE/hdr_lut.py" sdr2hlg.cube "$@"
ffmpeg -v error -y -ss "$SS" -t "$DUR" -i "$IN" \
  -vf "$(in_stage),lut3d=file=sdr2hlg.cube:interp=tetrahedral,$OUT_STAGE,$TAG" \
  "${ENC[@]}" "$OUT"
verify_hlg "$OUT"
