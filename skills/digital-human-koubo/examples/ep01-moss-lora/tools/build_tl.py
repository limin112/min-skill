#!/usr/bin/env python3
"""cut/（assemble.py 的输出）+ script.json → edit/src/tl.json，并把片段放进 edit/public/clips/。

用法：python3 tools/build_tl.py   （在 production/ep01 里跑）
tl.json = {"total", "items": [{"kind":"nar","id","host","shot","ch","src","start","dur","text","sub","zh",
                               "chars":{"字下标":绝对秒}, "lines":[{"text","zh","start","end"}]},
                              {"kind":"title","id","start","dur"}, ...]}
字幕按标点切句，时间来自 whisper 逐字对齐；sub 是字幕专用写法（念「moss 零一」、字幕显示 moss01），按句子一一对应。
"""
import difflib, json, re, subprocess, sys
from pathlib import Path

S = json.load(open("script.json"))
Q = {r["id"]: r for r in json.load(open("cut/qa.json"))}
CH = {"s01": "开场", "s02": "开场", "s03": "开场",
      "s04": "① 为什么要 LoRA",
      "s05": "② 准备数据", "s05b": "② 准备数据", "s06": "② 准备数据", "s07": "② 准备数据", "s07b": "② 准备数据",
      "s08": "③ 训练", "s09": "③ 训练",
      "s10": "④ 验收", "s11": "④ 验收", "s12": "④ 验收", "s13": "④ 验收", "s13b": "④ 验收", "s13c": "④ 验收",
      "s14": "⑤ 让她开口", "s15": "⑤ 让她开口", "s16": "⑤ 让她开口", "s17": "⑤ 让她开口", "s17b": "⑤ 让她开口",
      "s18": "⑥ 全部开源", "s19": "⑥ 全部开源", "s20": "⑥ 全部开源"}
TITLE_AFTER = {"s03": 3.6}          # 片头标题卡插在哪段后面、多长
GAP = 0.12
PUNCT_SPLIT = "，。：；！？,.:;!?"
pub = Path("edit/public/clips"); pub.mkdir(parents=True, exist_ok=True)


def char_times(sid, text, keep):
    """whisper token → 每个字的相对时间；用 difflib 把听到的字对到文稿的字上，没对上的按邻居插值"""
    toks = []
    for t in json.load(open(f"cut/{sid}.json", errors="replace"))["transcription"]:
        a0, a1 = t["offsets"]["from"] / 1000, t["offsets"]["to"] / 1000
        tx = t["text"].strip()
        if not tx or tx.startswith("["): continue
        for k, ch in enumerate(tx):
            if not ch.isspace() and ch not in PUNCT_SPLIT: toks.append((ch.lower(), a0 + (a1 - a0) * k / len(tx)))
    idx = [i for i, c in enumerate(text) if not c.isspace() and c not in PUNCT_SPLIT + "“”「」…—"]
    src = "".join(text[i].lower() for i in idx); hrd = "".join(c for c, _ in toks)
    tm = {}
    for a, b, n in difflib.SequenceMatcher(None, src, hrd, autojunk=False).get_matching_blocks():
        for k in range(n): tm[idx[a + k]] = toks[b + k][1]
    known = sorted(tm.items()); out = {}
    for i in idx:
        if i in tm: out[i] = tm[i]; continue
        lo = max((p for p in known if p[0] < i), default=(None, 0.0), key=lambda p: p[0])
        hi = min((p for p in known if p[0] > i), default=(None, keep), key=lambda p: p[0])
        l0, l1 = (lo[0] if lo[0] is not None else 0), (hi[0] if hi[0] is not None else len(text))
        out[i] = lo[1] + (hi[1] - lo[1]) * (i - l0) / max(1, l1 - l0)
    return out


def split(text):
    """按标点切成 [(句子, 起始下标)]"""
    parts, buf, b0 = [], "", 0
    for i, c in enumerate(text):
        if c in PUNCT_SPLIT:
            if buf.strip(): parts.append((buf.strip() + ("" if c in "，,：:；;" else c if c in "!?！？" else ""), b0))
            buf = ""; continue
        if not buf: b0 = i
        buf += c
    if buf.strip(): parts.append((buf.strip(), b0))
    return parts


items, T = [], 0.0
for s in S:
    sid = s["id"]
    if sid not in Q:
        if "--partial" in sys.argv: continue          # 预览用：还没生成的段先跳过
        sys.exit(f"{sid} 还没进 cut/（先跑 h3.py run 和 assemble.py），或者加 --partial 先看已有的")
    keep = Q[sid]["keep"]
    dst = pub / f"{sid}.mp4"
    if not dst.exists() or dst.stat().st_mtime < Path(f"cut/{sid}.mp4").stat().st_mtime:
        # 每段单独做响度归一到 -16 LUFS：H3 原声在 -10 ~ -14 之间飘，不归一的话段与段之间忽大忽小
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", f"cut/{sid}.mp4", "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000",
                        "-c:a", "aac", "-b:a", "192k", str(dst)], check=True)
    ct = char_times(sid, s["t"], keep)
    at = lambda i: T + ct.get(i, ct[min(ct, key=lambda k: abs(k - i))])
    tp, sp = split(s["t"]), split(s.get("sub", s["t"]))
    zp = split(s["zh"]) if s.get("zh") else []
    if len(sp) != len(tp): sp = tp
    lines = []
    for k, ((txt, i0), (sub, _)) in enumerate(zip(tp, sp)):
        st = at(i0) - 0.05
        en = at(tp[k + 1][1]) - 0.04 if k + 1 < len(tp) else T + keep
        lines.append({"text": sub, "start": round(max(T, st), 3), "end": round(en, 3)})
    if zp:  # 英文段的中文翻译：按句数平均挂到英文句子上
        for k, ln in enumerate(lines):
            ln["zh"] = "".join(p for p, _ in zp[round(k * len(zp) / len(lines)):round((k + 1) * len(zp) / len(lines))])
    items.append({"kind": "nar", "id": sid, "host": s.get("host", "moss"), "shot": s.get("shot", "pip"), "lang": s.get("lang", "zh"),
                  "ch": CH.get(sid, ""), "src": f"clips/{sid}.mp4", "start": round(T, 3), "dur": round(keep, 3),
                  "text": s["t"], "chars": {str(i): round(T + v, 3) for i, v in ct.items()}, "lines": lines})
    T += keep + GAP
    if sid in TITLE_AFTER:
        items.append({"kind": "title", "id": "title", "ch": "开场", "start": round(T, 3), "dur": TITLE_AFTER[sid]})
        T += TITLE_AFTER[sid] + GAP
Path("edit/src/tl.json").write_text(json.dumps({"total": round(T + 0.6, 3), "items": items}, ensure_ascii=False, indent=1))
print(f"{len(items)} 项，总长 {T:.1f} 秒 → edit/src/tl.json")
