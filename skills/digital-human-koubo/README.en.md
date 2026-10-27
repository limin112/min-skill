# digital-human-koubo · Any article → a locally generated digital-human explainer video

[中文](README.md) · **English** · [日本語](README.ja.md)

**Give it an article; get back a multi-character explainer video with animated figures and bilingual subtitles.** Every model runs locally and is open source — no cloud generation service. A new article means new data, not new code.

```
article ─▶ script.json (multiple characters · multiple languages · one declarative `visual` per segment)
local text-to-image (MOSS-Image, optionally with your own character LoRA) ─▶ character first frames
MiniMax H3 + Turbo LoRA (8 steps, two GPUs) ─▶ per-segment "picture + native voice"
whisper.cpp listens back to every segment ─▶ per-character timing ─▶ generic Remotion template + synthesized score ─▶ final video
```

https://github.com/user-attachments/assets/b1b299ae-412f-4722-a6cc-b3edc19e1f8f

▶ **Video**: plays above (540p) · sharper version [ep01.mp4](examples/ep01-moss-lora/ep01.mp4) (3:38 · 720p · 23 MB) · **Post**: [x.com/MinLiBuilds/status/2114876477267386417](https://x.com/MinLiBuilds/status/2114876477267386417?s=20) · **Repo**: [github.com/limin112/min-skill/tree/main/skills/digital-human-koubo](https://github.com/limin112/min-skill/tree/main/skills/digital-human-koubo)

## What an episode looks like

```
my-episode/
  article/        the article and its figures
  script.json     [{"id":"s04","host":"host","ch":"① How it works","t":"...the exact words to speak...",
                    "visual":{"type":"image","src":"article/fig1.jpg","marks":[{"rect":[120,80,600,300],"at":"this part"}]}}, …]
  cast.json       {"host":{"use":"moss"},"buddy":{"use":"oliver"}}      ← borrow from the character library, or define new ones
  episode.json    {"series":"…","title":"…","theme":"tech","music":{"mood":"tech"}, …}
```

**Visual types** (`references/visuals.md`): `big` headline · `image` figure (crop / highlight boxes / stamp / shout) · `images` side-by-side comparison · `stats` counting numbers · `bars` bar comparison · `terminal` · `flow` · `tags` · `list` · `card` · `quote` · `shout` · `end` credits with the cast. An array stacks several in one segment. Every element is timed to the narration with `"at": "<the word being spoken>"`.

**Mood presets** (palette and score change together; one word in `episode.json`):

| | Palette | Score (`scripts/make_score.py`, synthesized in code, no copyright issues) |
|---|---|---|
| `magic` | deep purple + gold · starfield · crescent moon | D minor, 72 BPM: string pad + celesta arpeggio + soft timpani |
| `tech` | deep blue + cyan · grid | A minor, 112 BPM: synth pad + square arpeggio + pulse bass + electronic drums |
| `warm` | dark brown + orange · plain | C major, 84 BPM: soft pad + piano broken chords + plucked bass |
| `epic` | dark red + gold · starfield | C minor, 90 BPM: thick pad + brass swells + war drums + big reverb |

**Ready-made characters** (`assets/cast/library.json`; borrow with `{"use": "<id>"}`):

| | id | |
|---|---|---|
| <img src="assets/cast/moss_916.jpg" width="80"> | `moss` | photoreal lead host (MOSS-Image + the self-trained moss01 LoRA) |
| <img src="assets/cast/oliver_916.jpg" width="80"> | `oliver` | British sidekick with black-rimmed glasses |
| <img src="assets/cast/hoot_169.jpg" width="140"> | `hoot` | Pixar-style owl teaching assistant |
| <img src="assets/cast/chibi_916.jpg" width="80"> | `chibi` | 2D anime chibi |

New characters: generate first frames with `scripts/gen_image.py` and add them to `cast.json` (`references/new-avatar.md`).

## Usage

Once installed, tell Claude "turn this article into an explainer video" or "have the digital human explain this link"; the workflow is in [SKILL.md](SKILL.md) (written in Chinese). By hand:

```bash
python3 scripts/h3.py build script.json tasks.json      # split segments, build H3 prompts, estimate GPU time
python3 scripts/h3.py run tasks.json --gpus 2           # generate on two GPUs, resumable
python3 scripts/assemble.py script.json                 # whisper listen-back, trim tails → cut/
bash scripts/new_edit.sh explainer-169 edit             # create the edit project
python3 scripts/build_tl.py --edit edit                 # timeline + subtitles + assets
python3 scripts/make_score.py --out edit/public/music/score.mp3
cd edit && npx remotion render src/index.ts Explainer out/video.mp4
```

Full example: [`examples/ep01-moss-lora`](examples/ep01-moss-lora) — an article on training a character LoRA → a 3:38 video, 25 segments, 4 characters, opening in British English and switching to Mandarin.

## Requirements

| | Where | Notes |
|---|---|---|
| MiniMax H3 (ComfyUI) | a machine with a 24 GB+ GPU | weights from ModelScope `Comfy-Org/MiniMax-H3`; acceleration: `scripts/h3_setup_accel.sh` (Turbo node + LoRA, via ModelScope) |
| Text-to-image (default MOSS-Image + KohakuMoss) | a machine with a 24 GB+ GPU | environment: [limin112/Lora](https://github.com/limin112/Lora); to use another model, change the remote command in `gen_image.py` |
| ffmpeg · Python 3 + numpy · Node 18+ · whisper-cli | your computer | `bash scripts/doctor.sh` checks everything |

Machine addresses and model paths live in the `h3` / `image` sections of `persona.json`. Deployment details, measured speeds and pitfalls: [references/h3.md](references/h3.md).

| Measured (RTX 4090 48 GB) | One segment |
|---|---|
| H3 original, 20 steps · 1024×576 · 15 s | ~23 min |
| **H3 + Turbo, 8 steps · 480×864 · 7–9 s** | **~2–4.5 min** (two GPUs in parallel: 25 segments in ~45 min) |

## Credits and licenses
- Forked from [andyhuo520/digital-human-koubo](https://github.com/andyhuo520/digital-human-koubo) (MIT, see [LICENSE-upstream](LICENSE-upstream)): the caption-style template, 48 packaging components and the listen-back / alignment / voice-matching scripts come from upstream. This fork replaces the generation backend with local text-to-image + MiniMax H3, and adds the generic article template, declarative visuals, the character library, multiple characters and languages, two-GPU scheduling and mood presets for the score.
- Upstream's presenter images, style previews and packaging gallery show the original author's digital human and are not redistributed here, per upstream's NOTICE (see [assets/README.md](assets/README.md)).
- Third-party components: [NOTICE.md](NOTICE.md). All characters are AI-generated fictional people; none depicts a real person or an existing IP. Videos are marked "AI generated".
