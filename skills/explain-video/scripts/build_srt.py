#!/usr/bin/env python3
"""Build an SRT from the narration script, stretched to the real audio duration.

Why not Whisper: the narration text is already known exactly, so ASR only adds
transcription errors. What we actually need is *timing*. Distributing the known
text across the measured audio length by character weight lands within ~0.3s per
cue, which is good enough for burned-in captions and costs nothing.

Assumes narration.txt has one blank-line-separated paragraph per slide, in the
same order as the deck.

Usage:
  build_srt.py --text-file narration.txt --audio audio/voice.wav --out audio/voice.srt
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

SENT_END = "。！？；;!?"
CLAUSE_END = "，,、:：—"


def probe_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def width(s: str) -> float:
    """Visual/spoken weight: CJK glyph = 1, latin char = 0.5."""
    w = 0.0
    for ch in s:
        w += 1.0 if "⺀" <= ch <= "鿿" or "　" <= ch <= "〿" else 0.5
    return w


def split_units(para: str) -> list[str]:
    """Sentences first, then clauses — smallest units we are willing to time."""
    sents = [s.strip() for s in re.split(rf"(?<=[{SENT_END}])", para) if s.strip()]
    units = []
    for s in sents:
        parts = [p.strip() for p in re.split(rf"(?<=[{CLAUSE_END}])", s) if p.strip()]
        units.extend(parts or [s])
    return units


def chunk_para(para: str, max_w: float) -> list[str]:
    out: list[str] = []
    buf = ""
    for unit in split_units(para):
        if not buf:
            buf = unit
        elif width(buf) + width(unit) <= max_w:
            buf += unit
        else:
            out.append(buf)
            buf = unit
        if buf and buf[-1] in SENT_END and width(buf) >= max_w * 0.5:
            out.append(buf)
            buf = ""
    if buf:
        out.append(buf)
    return out or [para]


def wrap(text: str, max_w: float) -> str:
    """Break one cue into at most two lines, preferring a punctuation seam."""
    if width(text) <= max_w:
        return text
    mid = len(text) // 2
    for j in range(mid - 6, mid + 7):
        if 0 < j < len(text) and text[j - 1] in CLAUSE_END + SENT_END + " ":
            return text[:j].rstrip() + "\n" + text[j:].lstrip()
    return text[:mid] + "\n" + text[mid:]


def ts(sec: float) -> str:
    sec = max(0.0, sec)
    h, rem = divmod(int(sec), 3600)
    m, s = divmod(rem, 60)
    ms = int(round((sec - int(sec)) * 1000))
    if ms == 1000:
        s, ms = s + 1, 0
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--text-file", type=Path, required=True)
    ap.add_argument("--audio", type=Path, help="measure duration from this file")
    ap.add_argument("--duration", type=float, help="override audio duration in seconds")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--cues-json", type=Path, help="also dump cue list as JSON")
    ap.add_argument("--max-width", type=float, default=26, help="chars per cue (CJK units)")
    ap.add_argument("--pause", type=float, default=0.35, help="gap between slides, seconds")
    ap.add_argument("--min-cue", type=float, default=1.0)
    args = ap.parse_args()

    if args.duration:
        audio_dur = args.duration
    elif args.audio:
        audio_dur = probe_duration(args.audio)
    else:
        ap.error("need --audio or --duration")

    text = args.text_file.read_text(encoding="utf-8").strip()
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]

    chunks = []
    for pi, para in enumerate(paras):
        for c in chunk_para(para, args.max_width):
            chunks.append({"text": c, "para": pi, "w": max(width(c), 2.0)})

    n_breaks = max(len(paras) - 1, 0)
    pause = args.pause
    speech_budget = audio_dur - n_breaks * pause
    if speech_budget < audio_dur * 0.85:  # too many slides for the pause budget
        speech_budget = audio_dur * 0.92
        pause = (audio_dur - speech_budget) / max(n_breaks, 1)

    total_w = sum(c["w"] for c in chunks)
    cues: list[tuple[float, float, str]] = []
    t = 0.0
    last_para = 0
    for i, c in enumerate(chunks):
        if c["para"] != last_para:
            t += pause
            last_para = c["para"]
        dur = max(args.min_cue, speech_budget * c["w"] / total_w)
        start, end = t, min(audio_dur, t + dur)
        if i == len(chunks) - 1:
            end = audio_dur
        cues.append((start, end, c["text"]))
        t = end

    fixed = []
    for i, (s, e, tx) in enumerate(cues):
        if i:
            s = max(s, fixed[-1][1])
        if e <= s:
            e = s + 0.8
        if i == len(cues) - 1:
            e = audio_dur
        fixed.append((s, e, tx))

    blocks = [f"{i}\n{ts(s)} --> {ts(e)}\n{wrap(tx, args.max_width)}\n"
              for i, (s, e, tx) in enumerate(fixed, 1)]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("\n".join(blocks), encoding="utf-8")

    if args.cues_json:
        args.cues_json.write_text(
            json.dumps([{"i": i, "start": s, "end": e, "text": tx}
                        for i, (s, e, tx) in enumerate(fixed, 1)],
                       indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    print(f"{len(fixed)} cues over {audio_dur:.2f}s -> {args.out}")
    print("first:", fixed[0][2][:30].replace("\n", " "))
    print("last :", fixed[-1][2][:30].replace("\n", " "))


if __name__ == "__main__":
    main()
