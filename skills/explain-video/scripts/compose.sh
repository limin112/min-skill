#!/usr/bin/env bash
# Align the recorded deck to the audio, burn captions, mux the final MP4.
#
# The sync bug this exists to prevent: Playwright's webm is always longer than
# the sum of the slide waits, because browser startup happens before the first
# deckAPI.go(). That surplus sits at the HEAD of the file, so captions timed
# from t=0 drift late by exactly that amount. Fix: trim (vid_dur - audio_dur)
# off the front FIRST, then burn captions onto the trimmed video.
#
# Usage:
#   compose.sh --project presentations/foo \
#     --video record/animated_capture.webm \
#     --audio audio/voice_with_bgm.wav \
#     --srt   audio/voice.srt \
#     --out   final/foo.mp4
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="" ; VIDEO="" ; AUDIO="" ; SRT="" ; OUT="" ; PYTHON="${PYTHON:-python3}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --video)   VIDEO="$2";   shift 2 ;;
    --audio)   AUDIO="$2";   shift 2 ;;
    --srt)     SRT="$2";     shift 2 ;;
    --out)     OUT="$2";     shift 2 ;;
    --python)  PYTHON="$2";  shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$PROJECT" && -n "$VIDEO" && -n "$AUDIO" && -n "$OUT" ]] \
  || { echo "need --project --video --audio --out" >&2; exit 2; }

cd "$PROJECT"
dur() { ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$1"; }

AUDIO_DUR=$(dur "$AUDIO")
VID_DUR=$(dur "$VIDEO")
LEAD=$($PYTHON -c "print(max(0.0, round($VID_DUR - $AUDIO_DUR, 3)))")
echo "audio=${AUDIO_DUR}s video=${VID_DUR}s -> trimming ${LEAD}s of lead-in"

mkdir -p record final
TRIMMED="record/aligned.mp4"
ffmpeg -y -hide_banner -loglevel error \
  -ss "$LEAD" -i "$VIDEO" -t "$AUDIO_DUR" \
  -vf "fps=30,format=yuv420p" \
  -c:v libx264 -preset veryfast -crf 18 -an \
  "$TRIMMED"

VIDEO_TRACK="$TRIMMED"
if [[ -n "$SRT" && -f "$SRT" ]]; then
  if ffmpeg -hide_banner -filters 2>/dev/null | grep -q ' subtitles '; then
    echo "burning captions with libass"
    VIDEO_TRACK="record/captioned.mp4"
    ffmpeg -y -hide_banner -loglevel error -i "$TRIMMED" \
      -vf "subtitles=${SRT}:force_style='FontSize=28,PrimaryColour=&H00FFFFFF&,OutlineColour=&H80000000&,BorderStyle=3,Outline=1,MarginV=60'" \
      -c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p -an "$VIDEO_TRACK"
  else
    echo "no libass in this ffmpeg — rendering caption PNGs and overlaying"
    VIDEO_TRACK="record/captioned.mp4"
    $PYTHON "$HERE/render_captions.py" \
      --srt "$SRT" --project . --input "$TRIMMED" --output "$VIDEO_TRACK"
    bash record/burn_caps.sh
  fi
fi

ffmpeg -y -hide_banner -loglevel error \
  -i "$VIDEO_TRACK" -i "$AUDIO" \
  -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 192k \
  -t "$AUDIO_DUR" -shortest \
  "$OUT"

echo "final: $OUT"
ffprobe -v error -show_entries format=duration:stream=codec_type,codec_name,width,height \
  -of default=nw=1 "$OUT"
