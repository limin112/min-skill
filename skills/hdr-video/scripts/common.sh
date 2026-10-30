# sourced by hdr_clip.sh / hdr_sbs.sh -- source probing, shared filter pieces, encode args, output check
# (not meant to be run on its own)

abs() { echo "$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; }

probe() { ffprobe -v error -select_streams v:0 -show_entries "stream=$2" -of default=nw=1:nk=1 "$1" | head -1; }

# refuse HDR sources (this pipeline is SDR -> HLG only), read the source's matrix/range
check_sdr_source() {
  local trc space range
  trc=$(probe "$1" color_transfer); space=$(probe "$1" color_space); range=$(probe "$1" color_range)
  case "$trc" in
    arib-std-b67|smpte2084) echo "source is already HDR ($trc); this skill only converts SDR sources" >&2; exit 2;;
  esac
  case "$space" in smpte170m|bt470bg) IN_MATRIX=bt601;; *) IN_MATRIX=bt709;; esac
  case "$range" in pc|jpeg) IN_RANGE=pc;; *) IN_RANGE=tv;; esac
}

# yuv(8-bit, bt709, tv) -> full-range 16-bit RGB, and back to bt2020nc / limited / 10-bit
in_stage()  { echo "scale=in_color_matrix=$IN_MATRIX:in_range=$IN_RANGE:out_range=pc:flags=accurate_rnd+full_chroma_int,format=gbrp16le"; }
OUT_STAGE="scale=out_color_matrix=bt2020:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p10le"
# frames must carry the HLG tags themselves: otherwise the source's bt709 transfer leaks through
# the filter graph and the encoder writes it, silently producing a non-HDR file
TAG="setparams=colorspace=bt2020nc:color_primaries=bt2020:color_trc=arib-std-b67:range=tv"

ENC=(-c:v libx265 -preset slow -crf "${CRF:-15}" -pix_fmt yuv420p10le -tag:v hvc1
     -color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc -color_range tv
     -x265-params "colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc:range=limited:repeat-headers=1:log-level=error"
     -c:a aac -b:a 256k -movflags +faststart)

# fail loudly if the result is not tagged HLG / BT.2020 / 10-bit
verify_hlg() {
  local got
  got=$(ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt,color_space,color_transfer,color_primaries,width,height,r_frame_rate:format=duration,size -of compact "$1")
  echo "$got"
  case "$got" in
    *pix_fmt=yuv420p10le*color_space=bt2020nc*color_transfer=arib-std-b67*color_primaries=bt2020*) ;;
    *) echo "ERROR: output is not tagged HLG/BT.2020 10-bit -- do not ship this file" >&2; return 1;;
  esac
}
