#!/usr/bin/env bash
# Run the assembly half of the pipeline: narration.txt + index.html -> final MP4.
#
# Every step is skipped if its output already exists, so re-running is cheap and
# you can iterate on one stage at a time:
#   build_video.sh presentations/foo --only mix,compose --bgm-volume 0.12  # just remix
#   build_video.sh presentations/foo --from record                         # re-record onward
#
# Steps: tts · srt · timeline · record · mix · compose
# (bash 3.2 compatible — macOS /bin/bash has no associative arrays)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="${1:-}"; shift || true
[[ -n "$PROJECT" ]] || { echo "usage: build_video.sh <project-dir> [options]" >&2; exit 2; }
PROJECT="$(cd "$PROJECT" && pwd)"

# presentations/<slug> -> repo root -> .venv (playwright + pillow live there)
PY="${PY:-$(dirname "$(dirname "$PROJECT")")/.venv/bin/python}"
[[ -x "$PY" ]] || PY="python3"

TTS_ENGINE="auto"; VOICE=""; LANGUAGE="zh"; BGM="synth"; BGM_VOLUME="0.20"
FROM=""; ONLY=""; FORCE=0
ALL_STEPS="tts srt timeline record mix compose"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tts)        TTS_ENGINE="$2";    shift 2 ;;   # auto | voicebox | edge | say
    --voice)      VOICE="$2";         shift 2 ;;   # profile / voice name
    --profile)    VOICE="$2";         shift 2 ;;   # back-compat alias for --voice
    --language)   LANGUAGE="$2";      shift 2 ;;
    --bgm)        BGM="$2";           shift 2 ;;   # path | synth | none
    --bgm-volume) BGM_VOLUME="$2";    shift 2 ;;
    --from)       FROM="$2";          shift 2 ;;
    --only)       ONLY="$2";          shift 2 ;;
    --force)      FORCE=1;            shift ;;
    --python)     PY="$2";            shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

known_step() { case " $ALL_STEPS " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }

if [[ -n "$ONLY" ]]; then
  ENABLED=" ${ONLY//,/ } "
elif [[ -n "$FROM" ]]; then
  known_step "$FROM" || { echo "unknown step: $FROM (want one of: $ALL_STEPS)" >&2; exit 2; }
  ENABLED=""; seen=0
  for s in $ALL_STEPS; do
    [[ "$s" == "$FROM" ]] && seen=1
    [[ $seen == 1 ]] && ENABLED="$ENABLED $s"
  done
  ENABLED="$ENABLED "
else
  ENABLED=" $ALL_STEPS "
fi
for s in $ENABLED; do
  known_step "$s" || { echo "unknown step: $s (want one of: $ALL_STEPS)" >&2; exit 2; }
done

enabled() { case "$ENABLED" in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
should_run() {  # step, output-path
  enabled "$1" || return 1
  if [[ $FORCE == 0 && -e "$2" ]]; then
    echo "skip $1 ($(basename "$2") exists — pass --force to redo)"
    return 1
  fi
  echo; echo "=== $1 ==="
  return 0
}

SLUG="$(basename "$PROJECT")"
VOICE_WAV="$PROJECT/audio/voice.wav"
SRT="$PROJECT/audio/voice.srt"
MIXED="$PROJECT/audio/voice_with_bgm.wav"
CAPTURE="$PROJECT/record/animated_capture.webm"
FINAL="$PROJECT/final/$SLUG.mp4"
mkdir -p "$PROJECT/audio" "$PROJECT/record" "$PROJECT/final"

if should_run tts "$VOICE_WAV"; then
  echo "tts engine=$TTS_ENGINE lang=$LANGUAGE${VOICE:+ voice=$VOICE}"
  "$PY" "$HERE/tts.py" --engine "$TTS_ENGINE" \
    --text-file "$PROJECT/narration.txt" --out "$VOICE_WAV" \
    --language "$LANGUAGE" ${VOICE:+--voice "$VOICE"}
fi
[[ -f "$VOICE_WAV" ]] || { echo "no voice audio at $VOICE_WAV" >&2; exit 1; }

if should_run srt "$SRT"; then
  "$PY" "$HERE/build_srt.py" --text-file "$PROJECT/narration.txt" \
    --audio "$VOICE_WAV" --out "$SRT"
fi

if should_run timeline "$PROJECT/record/timeline.json"; then
  "$PY" "$HERE/deck_capture.py" timeline --project "$PROJECT" --audio "$VOICE_WAV"
fi

if should_run record "$CAPTURE"; then
  "$PY" "$HERE/deck_capture.py" video --project "$PROJECT"
fi

if enabled mix; then
  if [[ "$BGM" == "none" ]]; then
    echo "mix: skipped (--bgm none)"
    MIXED="$VOICE_WAV"
  elif should_run mix "$MIXED"; then
    echo "bgm=$BGM volume=$BGM_VOLUME"
    bash "$HERE/mix_bgm.sh" --voice "$VOICE_WAV" --bgm "$BGM" --out "$MIXED" --volume "$BGM_VOLUME"
  fi
fi
[[ -f "$MIXED" ]] || MIXED="$VOICE_WAV"

if enabled compose; then
  echo; echo "=== compose ==="
  bash "$HERE/compose.sh" --project "$PROJECT" \
    --video "$CAPTURE" --audio "$MIXED" --srt "$SRT" --out "$FINAL" --python "$PY"
  echo; echo "done -> $FINAL"
fi
