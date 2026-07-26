#!/usr/bin/env python3
"""Generate narration audio with the local Voicebox daemon.

Voicebox quirks this script works around:
  - /generate/{id}/status is a blocking SSE stream. Poll /history/{id} with
    Accept: application/json instead.
  - A crashed/orphaned worker leaves jobs stuck in "generating" forever and
    blocks new ones. --cancel-stuck clears them before submitting.
  - Audio comes back from /history/{id}/export-audio (fall back to /audio/{id}).

Usage:
  tts_voicebox.py --list
  tts_voicebox.py --text-file narration.txt --out audio/voice.wav \\
      --profile <your-profile> --language zh

--profile is optional; without it the daemon's first profile is used. Prefer
scripts/tts.py, which falls back to edge-tts or macOS `say` when Voicebox is
not running.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_BASE = "http://127.0.0.1:17493"
DONE = {"completed", "complete", "done", "success", "ready"}
DEAD = {"failed", "error", "cancelled", "canceled"}


def get(base: str, path: str, timeout: int = 15):
    req = urllib.request.Request(base + path, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def post(base: str, path: str, body: dict | None = None, timeout: int = 30):
    data = json.dumps(body).encode() if body is not None else b""
    req = urllib.request.Request(
        base + path,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        return json.loads(raw) if raw else {}


def resolve_profile(base: str, wanted: str | None) -> dict:
    profiles = get(base, "/profiles")
    if not profiles:
        raise SystemExit("Voicebox has no voice profiles yet — create one in the app first.")
    if not wanted:
        print(f'no --profile given, using first: {profiles[0]["name"]}')
        return profiles[0]
    for p in profiles:
        if p["id"] == wanted or p["name"].lower() == wanted.lower():
            return p
    names = ", ".join(f'{p["name"]} ({p["id"][:8]})' for p in profiles)
    raise SystemExit(f"profile {wanted!r} not found. available: {names}")


def cancel_stuck(base: str) -> int:
    try:
        hist = get(base, "/history?limit=25")
    except Exception as e:  # noqa: BLE001
        print(f"  history unavailable ({e}); skipping cancel", file=sys.stderr)
        return 0
    n = 0
    for it in hist.get("items", []):
        if it.get("status") in ("generating", "queued", "pending", "running"):
            try:
                post(base, f"/generate/{it['id']}/cancel", timeout=10)
                print(f"  cancelled stuck {it['id'][:8]} ({it.get('status')})")
                n += 1
            except Exception as e:  # noqa: BLE001
                print(f"  cancel failed {it['id'][:8]}: {e}", file=sys.stderr)
    return n


def wait_done(base: str, gen_id: str, timeout: int) -> dict:
    t0 = time.time()
    last = None
    while time.time() - t0 < timeout:
        try:
            it = get(base, f"/history/{gen_id}")
        except Exception as e:  # noqa: BLE001
            print(f"  poll error: {e}")
            time.sleep(2)
            continue
        status = it.get("status")
        if status != last:
            print(f"  [{time.time() - t0:5.0f}s] {status} dur={it.get('duration')}")
            last = status
        if status in DONE:
            return it
        if status in DEAD:
            raise SystemExit(f"generation {status}: {it.get('error')}")
        time.sleep(2)
    raise SystemExit(f"timeout after {timeout}s waiting on {gen_id}")


def download(base: str, gen_id: str, out: Path) -> Path:
    errs = []
    for path in (f"/history/{gen_id}/export-audio", f"/audio/{gen_id}"):
        try:
            with urllib.request.urlopen(base + path, timeout=180) as r:
                data = r.read()
            if len(data) > 1000:
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(data)
                print(f"  saved {out} ({len(data) / 1e6:.1f} MB)")
                return out
            errs.append(f"{path}: only {len(data)} bytes")
        except Exception as e:  # noqa: BLE001
            errs.append(f"{path}: {e}")
    raise SystemExit("download failed:\n  " + "\n  ".join(errs))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--list", action="store_true", help="list profiles and exit")
    ap.add_argument("--text-file", type=Path)
    ap.add_argument("--text", help="inline text (overrides --text-file)")
    ap.add_argument("--out", type=Path)
    ap.add_argument("--profile", default=None, help="profile name or id (default: first available)")
    ap.add_argument("--language", default="zh")
    ap.add_argument("--engine", default=None, help="default: profile's default_engine")
    ap.add_argument("--max-chunk-chars", type=int, default=350)
    ap.add_argument("--crossfade-ms", type=int, default=60)
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--cancel-stuck", action="store_true", help="cancel hung jobs first")
    args = ap.parse_args()

    try:
        profiles = get(args.base, "/profiles")
    except Exception as e:  # noqa: BLE001
        raise SystemExit(
            f"Voicebox not reachable at {args.base} ({e}).\n"
            "Start the Voicebox app, or point --base elsewhere."
        ) from e

    if args.list:
        for p in profiles:
            print(f'{p["id"]}  {p["name"]:<12} lang={p.get("language")} engine={p.get("default_engine")}')
        return

    if not args.out:
        ap.error("--out is required")
    text = args.text or (args.text_file.read_text(encoding="utf-8").strip() if args.text_file else "")
    if not text:
        ap.error("need --text or a non-empty --text-file")

    profile = resolve_profile(args.base, args.profile)
    engine = args.engine or profile.get("default_engine") or "kokoro"
    print(f'profile={profile["name"]} ({profile["id"][:8]}) engine={engine} lang={args.language} chars={len(text)}')

    if args.cancel_stuck:
        cancel_stuck(args.base)

    resp = post(
        args.base,
        "/generate",
        {
            "profile_id": profile["id"],
            "text": text,
            "language": args.language,
            "engine": engine,
            "max_chunk_chars": args.max_chunk_chars,
            "crossfade_ms": args.crossfade_ms,
        },
    )
    gen_id = resp.get("id") or resp.get("generation_id")
    if not gen_id:
        raise SystemExit(f"no generation id in response: {resp}")
    print(f"generation={gen_id}")

    item = wait_done(args.base, gen_id, args.timeout)
    print(f'done: {item.get("duration")}s')
    download(args.base, gen_id, args.out)
    print(f'AUDIO_DURATION={item.get("duration")}')


if __name__ == "__main__":
    main()
