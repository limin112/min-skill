---
name: explain-video
description: Build a narrated explainer video from a concept — discussion → structure → HTML slide deck → narration script → TTS voice → subtitles → background music → Playwright screen recording → ffmpeg composite. Use when asked to make a 讲解视频 / explainer / talking-deck video, to turn a topic or article into a narrated video or animated slide deck, or to redo one stage of an existing deck (re-record, re-mix BGM, regenerate captions, swap the voice).
version: 0.1.0
---

# Explain Video Pipeline

Turns a concept into a finished narrated video. No digital human, no avatar — an
HTML deck is the source of truth, and everything else is generated from it.

The whole point of doing it this way: an HTML deck is code. It diffs, it takes a
scripted screenshot, it re-renders identically, and one file drives both the
visuals and the narration text. Drag-and-drop slide tools cannot do that.

## Pipeline

```
concept ──discuss──▶ framework.json ──▶ index.html + narration.{txt,json,md}
                                              │
                    ┌─────────────────────────┴──────────────────────┐
                    ▼                                                ▼
           TTS (voicebox/edge/say)                        Playwright records
              audio/voice.wav                             the animated deck
                    │                                                │
              build_srt.py                                    trim the lead-in
              audio/voice.srt ─────────▶ caption PNGs ────▶ overlay + mux ────▶ final/*.mp4
                    │                                                ▲
              mix_bgm.sh ──────────────────────────────────────────┘
```

Steps 1–2 are authoring (do them with the user). Steps 3–7 are mechanical and
`scripts/build_video.sh` runs them.

## Step 1 — Agree on the framework before writing anything

Do not open an editor yet. Talk the concept through with the user, then write
`framework.json`:

```json
{
  "concept": "...", "audience": "...", "one_liner": "...",
  "total_pages": 8, "target_duration_sec": 94,
  "structure": [{ "page": 1, "role": "钩子", "point": "..." }]
}
```

Rules that hold up: 8 pages ≈ 90–110 seconds. One point per page. Give every
page a *role* (hook / context / why / overview / method / method / method /
close), not just a title. Show the framework and get a yes before drafting.

## Step 2 — Deck and narration together

Copy `references/deck-template.html` to `presentations/<slug>/index.html` and
rewrite the slides. Write the narration **into** the slides as
`data-narration`, with `data-duration` in seconds — that markup is the single
source, and everything downstream reads it.

Narration voice: spoken, not written. Short sentences. No academic register. One
to two sentences per page. Read it out loud; if you stumble, so will the TTS.

Then emit four sibling files:

| file | what | consumed by |
|---|---|---|
| `index.html` | the deck | recording |
| `narration.json` | per-slide title / narration / duration_sec | timeline |
| `narration.txt` | continuous script, **one blank-line-separated paragraph per slide, same order** | TTS + SRT |
| `narration.md` | human-readable script + page/time table | the user |

`narration.txt`'s paragraph-per-slide structure is load-bearing — `build_srt.py`
uses paragraph boundaries to place the pauses between slides. Pressing `E` in
the deck exports `narration.json` directly from the markup.

Let the user read `narration.md` and approve before spending TTS time.

## Steps 3–7 — Assemble

```bash
S=~/.claude/skills/minli-skill/skills/explain-video/scripts
bash $S/build_video.sh presentations/<slug> --bgm audio/music.mp3
```

`--tts auto` (the default) uses the local Voicebox daemon if it answers, else
`edge-tts` if installed, else macOS `say`. Nothing downstream cares which one
ran, so a first pass on `say` is a legitimate way to see the whole pipeline
work before setting up a real voice:

```bash
bash $S/build_video.sh presentations/<slug> --tts say                       # zero install
bash $S/build_video.sh presentations/<slug> --tts edge --voice zh-CN-YunxiNeural
bash $S/build_video.sh presentations/<slug> --tts voicebox --voice <profile>  # cloned voice
python3 $S/tts.py --engine edge --list                                       # what voices exist
```

Each step skips if its output exists, so iterating is cheap:

```bash
bash $S/build_video.sh presentations/<slug> --only mix,compose --bgm-volume 0.12   # BGM too loud
bash $S/build_video.sh presentations/<slug> --from record                          # deck changed
bash $S/build_video.sh presentations/<slug> --only srt,compose                      # captions off
bash $S/build_video.sh presentations/<slug> --force                                 # rebuild all
```

Scripts, if you need one on its own:

- `tts.py` — narration → `audio/voice.wav` on whichever engine is available.
- `tts_voicebox.py` — the Voicebox backend on its own. `--list` shows profiles.
- `build_srt.py` — narration + measured audio duration → `audio/voice.srt`.
- `deck_capture.py timeline|slides|video` — timeline scaled to real audio; static PNGs; animated webm.
- `render_captions.py` — SRT → transparent PNGs + `record/burn_caps.sh`.
- `mix_bgm.sh` — voice + music → `audio/voice_with_bgm.wav`.
- `compose.sh` — align, burn captions, mux → `final/<slug>.mp4`.

Use `.venv/bin/python` if the project has one (Playwright and Pillow live
there); `build_video.sh` finds it automatically.

## Things that will bite you

**Audio duration is the master clock.** Authored `data-duration` values are
estimates. TTS decides the real length. Everything — slide timeline, captions,
recording — gets scaled to the measured `voice.wav` duration, never the other
way round. Never hardcode a duration; always `ffprobe` it.

**Playwright's webm is longer than the sum of the waits.** Browser startup
happens before the first `deckAPI.go()`, and that surplus sits at the *head* of
the file. `compose.sh` trims `vid_dur - audio_dur` off the front before burning
captions. Skip that and every caption lands late by ~2–3 seconds. This was the
"字幕和音频不同步" bug.

**`subtitles=` may not exist.** Homebrew ffmpeg is frequently built without
libass. Check with `ffmpeg -filters | grep subtitles`. `compose.sh` falls back
to Pillow-rendered transparent PNGs overlaid with
`enable='between(t,start,end)'` — which also gives better CJK font control.
Caption PNG chains scale fine to ~50 cues; past a few hundred, split the video.

**`amix` normalizes by default.** It divides each input's gain by the input
count, so the BGM disappears and raising `volume=` does nothing. Always
`normalize=0` and set levels explicitly. Voice at `loudnorm=I=-16`, BGM at
`volume=0.20`, `alimiter=limit=0.97` on the sum. Verify with `volumedetect`
rather than trusting the graph.

**Synthesized sine pads sound like tinnitus.** The "滋滋声" complaint. Use a real
music file. `--bgm synth` is only a no-network fallback.

**Voicebox hangs need clearing.** `/generate/{id}/status` is a blocking SSE
stream — poll `/history/{id}` with `Accept: application/json` instead. A crashed
worker leaves jobs stuck in `generating` forever and blocks new ones;
`tts_voicebox.py --cancel-stuck` clears them. If the daemon itself is
unresponsive, `kill` the orphaned `voicebox-server` and reopen the app.

**Don't ASR your own script for subtitles.** The text is already known exactly;
Whisper only adds transcription errors. What's missing is *timing*, and
distributing known text across the measured duration by character weight lands
within ~0.3s per cue. (Voicebox's `/transcribe` also failed on every model tier
in practice.)

**A deck sized for the preview looks empty at 1920×1080.** The "右边太空了"
problem. Two causes, both fixed in the template's `body.record-mode` block:
`max-width` on slide children strands the right third, and `rem`-capped
`clamp()` font sizes tuned for the ~1120px preview stage stay small when the
stage grows to full frame. Record mode drops the ceilings and sizes type in
`vw`, and reserves `padding-bottom: 16vh` so vertically-centred content sits
above the caption band instead of behind it. Always eyeball a real frame
(`ffmpeg -ss <t> -i final.mp4 -frames:v 1 f.png`) before calling it done.

## Output layout

```
presentations/<slug>/
  framework.json  index.html  narration.{json,txt,md}
  audio/   voice.wav  voice.srt  bgm_loop.wav  voice_with_bgm.{wav,mp3}
  record/  timeline.json  animated_capture.webm  aligned.mp4
           caps/  caps_meta.json  burn_caps.sh  captioned.mp4
  final/   <slug>.mp4
```

## Requirements

Required: `ffmpeg` + `ffprobe`; Python 3.9+ with `playwright` (then
`python -m playwright install chromium`) and `pillow`.

```bash
pip install playwright pillow && python -m playwright install chromium
brew install ffmpeg            # macOS; any recent ffmpeg works
```

For the voice, one of: Voicebox on `127.0.0.1:17493` (cloned voice, best),
`pip install edge-tts` (free neural voices, cross-platform), or macOS `say`
(already there). A CJK font is needed for Chinese captions — `render_captions.py`
probes for `Arial Unicode.ttf`, Hiragino Sans GB, or STHeiti.

Developed and run on macOS (Apple Silicon). The Python and ffmpeg steps are
portable; `--tts say` is the only macOS-only piece.

## Reference

- `references/deck-template.html` — working deck with the full `deckAPI` recording
  contract, staggered enter animations, and `[data-step]` progressive highlights.
