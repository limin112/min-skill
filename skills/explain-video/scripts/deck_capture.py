#!/usr/bin/env python3
"""Drive an HTML deck with Playwright: build the timeline, screenshot slides,
or record the animated deck as video.

The deck must expose `window.deckAPI` (see references/deck-template.html):
    deckAPI.go(index, { slideMs })   -- switch slide and run its animations
    deckAPI.getSlideCount()
    deckAPI.getDurationsSec()        -- per-slide data-duration values
    deckAPI.setRecordMode(true)      -- hide dock/hints/chrome

Subcommands:
  timeline  compute record/timeline.json (slide durations scaled to real audio)
  slides    static PNG per slide (fallback path, no animation)
  video     record the animated deck to record/animated_capture.webm

Usage:
  deck_capture.py timeline --project presentations/foo --audio .../voice.wav
  deck_capture.py slides   --project presentations/foo
  deck_capture.py video    --project presentations/foo
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright


def probe_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def deck_url(project: Path, record: bool = True) -> str:
    html = (project / "index.html").resolve()
    if not html.exists():
        raise SystemExit(f"no index.html in {project}")
    return html.as_uri() + ("?record=1" if record else "")


def open_deck(p, project: Path, viewport: dict, **ctx_kwargs):
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport=viewport, **ctx_kwargs)
    page = context.new_page()
    page.goto(deck_url(project), wait_until="domcontentloaded")
    page.wait_for_function("() => window.deckAPI && typeof window.deckAPI.go === 'function'")
    page.evaluate("() => window.deckAPI.setRecordMode(true)")
    return browser, context, page


def read_durations(project: Path, page=None) -> list[float]:
    """Per-slide seconds: narration.json wins, else the deck's data-duration."""
    narr = project / "narration.json"
    if narr.exists():
        data = json.loads(narr.read_text(encoding="utf-8"))
        return [float(s.get("duration_sec") or 0) for s in data["slides"]]
    if page is not None:
        return [float(x) for x in page.evaluate("() => window.deckAPI.getDurationsSec()")]
    raise SystemExit("no narration.json and no live page to read durations from")


def scale_to_audio(durations: list[float], audio_dur: float) -> list[float]:
    total = sum(durations)
    if total <= 0:
        return [audio_dur / len(durations)] * len(durations)
    scaled = [d * audio_dur / total for d in durations]
    scaled[-1] += audio_dur - sum(scaled)  # absorb float drift in the last slide
    return scaled


def cmd_timeline(args) -> None:
    project = args.project
    audio_dur = args.duration or probe_duration(args.audio)
    with sync_playwright() as p:
        browser, context, page = open_deck(p, project, {"width": 1920, "height": 1080})
        n = page.locator(".slide").count()
        durations = read_durations(project, page)
        titles = page.eval_on_selector_all(
            ".slide", "els => els.map(e => (e.querySelector('h1,h2')||{}).textContent || '')"
        )
        context.close()
        browser.close()

    if len(durations) != n:
        raise SystemExit(f"narration has {len(durations)} slides but deck has {n}")
    scaled = scale_to_audio(durations, audio_dur)

    meta, t = [], 0.0
    for i, d in enumerate(scaled):
        meta.append({
            "index": i + 1,
            "file": f"slide_{i + 1:02d}.png",
            "path": str((project / "record" / "slides" / f"slide_{i + 1:02d}.png").resolve()),
            "start": t, "end": t + d, "duration": d,
            "title": (titles[i] or "").strip(),
        })
        t += d

    out = project / "record" / "timeline.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{n} slides scaled to {audio_dur:.2f}s -> {out}")
    for m in meta:
        print(f'  {m["index"]:02d} {m["duration"]:6.2f}s  {m["title"][:36]}')


def cmd_slides(args) -> None:
    project = args.project
    slides_dir = project / "record" / "slides"
    slides_dir.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser, context, page = open_deck(
            p, project, {"width": 1920, "height": 1080}, device_scale_factor=args.scale
        )
        n = page.locator(".slide").count()
        for i in range(n):
            page.evaluate("i => window.deckAPI.go(i)", i)
            page.wait_for_timeout(args.settle_ms)  # let enter animations finish
            out = slides_dir / f"slide_{i + 1:02d}.png"
            page.locator(".stage").screenshot(path=str(out))
            print(f"captured {out.name}")
        context.close()
        browser.close()


def cmd_video(args) -> None:
    project = args.project
    timeline_path = project / "record" / "timeline.json"
    if not timeline_path.exists():
        raise SystemExit("run `deck_capture.py timeline` first")
    timeline = json.loads(timeline_path.read_text(encoding="utf-8"))
    durations_ms = [int(round(t["duration"] * 1000)) for t in timeline]

    out_dir = project / "record" / "playwright"
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.webm"):
        old.unlink()

    print(f"recording {len(durations_ms)} slides, {sum(durations_ms) / 1000:.2f}s")
    with sync_playwright() as p:
        browser, context, page = open_deck(
            p, project,
            {"width": args.width, "height": args.height},
            device_scale_factor=1,
            record_video_dir=str(out_dir),
            record_video_size={"width": args.width, "height": args.height},
        )
        # Warm the first frame so slide 1 is already painted when timing starts.
        page.evaluate("() => window.deckAPI.go(0, { slideMs: 100 })")
        page.wait_for_timeout(120)
        for idx, ms in enumerate(durations_ms):
            page.evaluate("([i, ms]) => window.deckAPI.go(i, { slideMs: ms })", [idx, ms])
            page.wait_for_timeout(ms)
        page.wait_for_timeout(80)
        page.close()
        context.close()   # video is only flushed to disk on context close
        browser.close()

    videos = sorted(out_dir.glob("*.webm"))
    if not videos:
        raise SystemExit("playwright produced no video")
    dest = project / "record" / "animated_capture.webm"
    dest.unlink(missing_ok=True)
    videos[-1].replace(dest)
    dur = probe_duration(dest)
    print(f"saved {dest} ({dest.stat().st_size / 1e6:.1f} MB, {dur:.2f}s)")
    print(f"NOTE: browser startup adds ~{dur - sum(durations_ms) / 1000:.2f}s of lead; compose.sh trims it")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    t = sub.add_parser("timeline")
    t.add_argument("--project", type=Path, required=True)
    t.add_argument("--audio", type=Path)
    t.add_argument("--duration", type=float)
    t.set_defaults(func=cmd_timeline)

    s = sub.add_parser("slides")
    s.add_argument("--project", type=Path, required=True)
    s.add_argument("--scale", type=int, default=2, help="device scale factor")
    s.add_argument("--settle-ms", type=int, default=900)
    s.set_defaults(func=cmd_slides)

    v = sub.add_parser("video")
    v.add_argument("--project", type=Path, required=True)
    v.add_argument("--width", type=int, default=1920)
    v.add_argument("--height", type=int, default=1080)
    v.set_defaults(func=cmd_video)

    args = ap.parse_args()
    if args.cmd == "timeline" and not (args.audio or args.duration):
        ap.error("timeline needs --audio or --duration")
    args.func(args)


if __name__ == "__main__":
    main()
