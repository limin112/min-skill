#!/usr/bin/env bash
# Mix narration voice with background music.
#
# Two rules learned the hard way:
#   1. amix normalizes by default, which silently divides every input's gain by
#      the input count — the BGM vanishes and turning up `volume=` does nothing.
#      Always pass normalize=0 and control levels explicitly.
#   2. Synthesized sine pads sound like tinnitus on speech. Use real music.
#      `--bgm synth` exists only as an offline fallback.
#   3. loudnorm always emits 192 kHz, overriding whatever aformat asked for, and
#      amix then follows its first input. Left alone that gives 4x-sized wavs and
#      a 96 kHz AAC in the final mux (the encoder's ceiling), which some mobile
#      hardware decoders refuse. Pin every loudnorm with a following aresample.
#
# Usage:
#   mix_bgm.sh --voice audio/voice.wav --bgm audio/music.mp3 --out audio/voice_with_bgm.wav
#   mix_bgm.sh --voice audio/voice.wav --bgm synth --out audio/voice_with_bgm.wav --volume 0.20
set -euo pipefail

VOICE="" ; BGM="" ; OUT="" ; VOL="0.20" ; FADE_OUT="5"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --voice)  VOICE="$2"; shift 2 ;;
    --bgm)    BGM="$2";   shift 2 ;;
    --out)    OUT="$2";   shift 2 ;;
    --volume) VOL="$2";   shift 2 ;;   # 0.12 subtle · 0.20 default · 0.40 forward
    --fade-out) FADE_OUT="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$VOICE" && -n "$BGM" && -n "$OUT" ]] || { echo "need --voice --bgm --out" >&2; exit 2; }
[[ -f "$VOICE" ]] || { echo "no such voice file: $VOICE" >&2; exit 1; }

DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$VOICE")
FADE_ST=$(python3 -c "print(max(0, $DUR - $FADE_OUT))")
WORK="$(dirname "$OUT")"; mkdir -p "$WORK"
LOOP="$WORK/bgm_loop.wav"

if [[ "$BGM" == "synth" ]]; then
  echo "synthesizing ambient bed (${DUR}s) — prefer a real track when you can"
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i "sine=frequency=98:duration=$DUR" \
    -f lavfi -i "sine=frequency=146.83:duration=$DUR" \
    -f lavfi -i "sine=frequency=196:duration=$DUR" \
    -f lavfi -i "anoisesrc=color=pink:amplitude=0.04:duration=$DUR" \
    -filter_complex "\
      [0:a]volume=0.22,afade=t=in:st=0:d=1.5,afade=t=out:st=$FADE_ST:d=$FADE_OUT[a0];\
      [1:a]volume=0.16,afade=t=in:st=0:d=2,afade=t=out:st=$FADE_ST:d=$FADE_OUT[a1];\
      [2:a]volume=0.12,afade=t=in:st=0.5:d=2.5,afade=t=out:st=$FADE_ST:d=$FADE_OUT[a2];\
      [3:a]volume=0.06,lowpass=f=1200,afade=t=in:st=0:d=1.5,afade=t=out:st=$FADE_ST:d=$FADE_OUT[a3];\
      [a0][a1][a2][a3]amix=inputs=4:duration=longest:normalize=0,loudnorm=I=-20:TP=-2:LRA=8,aresample=48000[out]" \
    -map "[out]" -c:a pcm_s16le "$LOOP"
else
  [[ -f "$BGM" ]] || { echo "no such bgm file: $BGM" >&2; exit 1; }
  # Loop the track to cover the voice, then fade and level it.
  ffmpeg -y -hide_banner -loglevel error \
    -stream_loop -1 -i "$BGM" -t "$DUR" \
    -af "afade=t=in:st=0:d=2,afade=t=out:st=$FADE_ST:d=$FADE_OUT,loudnorm=I=-20:TP=-2:LRA=9,aresample=48000" \
    -c:a pcm_s16le "$LOOP"
fi

# normalize=0 is the whole trick. duration=first keeps the voice as master.
ffmpeg -y -hide_banner -loglevel error \
  -i "$VOICE" -i "$LOOP" \
  -filter_complex "\
    [0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[v];\
    [1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=$VOL[b];\
    [v][b]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.97[out]" \
  -map "[out]" -c:a pcm_s16le "$OUT"

MP3="${OUT%.*}.mp3"
ffmpeg -y -hide_banner -loglevel error -i "$OUT" -codec:a libmp3lame -qscale:a 2 "$MP3"

echo "levels (mean/max dB):"
for f in "$VOICE" "$LOOP" "$OUT"; do
  printf '  %-28s ' "$(basename "$f")"
  ffmpeg -hide_banner -i "$f" -af volumedetect -f null - 2>&1 \
    | grep -E 'mean_volume|max_volume' | awk -F': ' '{printf "%s ", $2}'
  echo
done
echo "wrote $OUT and $MP3 (bgm volume=$VOL)"
