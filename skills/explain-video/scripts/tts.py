#!/usr/bin/env python3
"""Turn narration.txt into audio/voice.wav, using whichever TTS is available.

Voice is the most swappable part of this pipeline — nothing downstream cares
which engine produced the wav, because the timeline and the subtitles are both
derived from the *measured* duration of the file. So start with whatever runs,
and upgrade the voice later without touching another step.

Engines:
  voicebox  local Voicebox daemon — voice cloning, best quality, needs the app
  edge      edge-tts — free Microsoft neural voices (`pip install edge-tts`)
  say       macOS built-in `say` — zero install, robotic, proves the pipeline
  auto      try the above in order, use the first one that works (default)

Usage:
  tts.py --text-file narration.txt --out audio/voice.wav
  tts.py --text-file narration.txt --out audio/voice.wav --engine edge
  tts.py --engine voicebox --list
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
VOICEBOX_BASE = "http://127.0.0.1:17493"

# Sensible per-engine defaults for Chinese. Override with --voice.
EDGE_DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"
SAY_PREFERRED = ("Tingting", "Meijia", "Sinji")


def run(cmd: list[str]) -> None:
    print("  $ " + " ".join(cmd))
    subprocess.run(cmd, check=True)


def ffprobe_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


# --- availability probes -----------------------------------------------------

def voicebox_up(base: str) -> bool:
    try:
        urllib.request.urlopen(base + "/profiles", timeout=3).read()
        return True
    except Exception:  # noqa: BLE001 — any failure means "not usable"
        return False


def edge_available() -> bool:
    return shutil.which("edge-tts") is not None


def say_available() -> bool:
    return sys.platform == "darwin" and shutil.which("say") is not None


HOWTO = {
    "voicebox": "start the Voicebox app (or point --base at it)",
    "edge": "pip install edge-tts",
    "say": "`say` is macOS-only — use --engine edge elsewhere",
}


def require(engine: str, base: str) -> None:
    ok = {"voicebox": lambda: voicebox_up(base),
          "edge": edge_available,
          "say": say_available}[engine]()
    if not ok:
        raise SystemExit(f"--engine {engine} is not available here: {HOWTO[engine]}")


def pick_engine(base: str) -> str:
    if voicebox_up(base):
        return "voicebox"
    if edge_available():
        return "edge"
    if say_available():
        return "say"
    raise SystemExit(
        "No TTS engine available. Pick one:\n"
        "  - macOS: nothing to do, `say` ships with the OS (rerun on a Mac)\n"
        "  - any OS: pip install edge-tts\n"
        f"  - voice cloning: start Voicebox so {base} answers"
    )


# --- engines -----------------------------------------------------------------

def tts_voicebox(text_file: Path, out: Path, args) -> None:
    cmd = [sys.executable, str(HERE / "tts_voicebox.py"), "--cancel-stuck",
           "--text-file", str(text_file), "--out", str(out),
           "--language", args.language, "--base", args.base]
    if args.voice:
        cmd += ["--profile", args.voice]
    run(cmd)


def tts_edge(text_file: Path, out: Path, args) -> None:
    voice = args.voice or EDGE_DEFAULT_VOICE
    mp3 = out.with_suffix(".edge.mp3")
    print(f"edge-tts voice={voice}")
    run(["edge-tts", "--voice", voice, "--file", str(text_file),
         "--write-media", str(mp3)])
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3),
         "-ar", "24000", "-ac", "1", str(out)])
    mp3.unlink(missing_ok=True)


def resolve_say_voice(wanted: str | None) -> str:
    listing = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout
    names = {line.split()[0] for line in listing.splitlines() if line.strip()}
    if wanted:
        if wanted not in names:
            raise SystemExit(f"say voice {wanted!r} not installed. `say -v '?'` lists yours.")
        return wanted
    for cand in SAY_PREFERRED:
        if cand in names:
            return cand
    # Fall back to any Chinese voice the system does have.
    for line in listing.splitlines():
        parts = line.split()
        if len(parts) > 1 and parts[1].startswith("zh_"):
            return parts[0]
    raise SystemExit(
        "No Chinese `say` voice installed. Add one in System Settings → "
        "Accessibility → Spoken Content → System Voice → Manage Voices, "
        "or use --engine edge."
    )


def tts_say(text_file: Path, out: Path, args) -> None:
    voice = resolve_say_voice(args.voice)
    print(f"say voice={voice} (built-in macOS TTS — fine for a dry run, "
          f"swap to edge/voicebox for anything you publish)")
    run(["say", "-v", voice, "-o", str(out),
         "--data-format=LEI16@22050", "-f", str(text_file)])


ENGINES = {"voicebox": tts_voicebox, "edge": tts_edge, "say": tts_say}


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--engine", default="auto", choices=["auto", *ENGINES])
    ap.add_argument("--text-file", type=Path)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--voice", help="voicebox profile / edge voice / say voice")
    ap.add_argument("--language", default="zh")
    ap.add_argument("--base", default=VOICEBOX_BASE, help="Voicebox daemon URL")
    ap.add_argument("--list", action="store_true",
                    help="list voices for the chosen engine and exit")
    args = ap.parse_args()

    if args.engine == "auto":
        engine = pick_engine(args.base)
        print(f"engine=auto -> {engine}")
    else:
        engine = args.engine
        require(engine, args.base)

    if args.list:
        if engine == "voicebox":
            run([sys.executable, str(HERE / "tts_voicebox.py"), "--list", "--base", args.base])
        elif engine == "edge":
            run(["edge-tts", "--list-voices"])
        else:
            run(["say", "-v", "?"])
        return

    if not args.text_file or not args.out:
        ap.error("--text-file and --out are required")
    if not args.text_file.is_file():
        raise SystemExit(f"no narration text at {args.text_file}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    ENGINES[engine](args.text_file, args.out, args)

    if not args.out.is_file():
        raise SystemExit(f"{engine} produced no audio at {args.out}")
    print(f"AUDIO_DURATION={ffprobe_duration(args.out):.2f}  -> {args.out}")


if __name__ == "__main__":
    main()
