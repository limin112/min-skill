#!/usr/bin/env python3
"""渲染前检查 edit.json：所有 "段:词" 时间引用都能在 tl.json 里找到，卡片不互相打架。
用法：python3 check_edit.py <工程>/src   （目录里要有 tl.json 和 edit.json）"""
import json, re, sys
from pathlib import Path
d = Path(sys.argv[1] if len(sys.argv) > 1 else 'src')
tl = json.load(open(d / 'tl.json')); ed = json.load(open(d / 'edit.json')); S = tl['segs']
bad = []
def T(r, where):
    if isinstance(r, (int, float)): return float(r)
    m = re.match(r'^(\d+):(.*)$', str(r))
    if not m: bad.append(f'{where}: 时间写法不对 {r!r}（应为 "3:" / "3:end" / "3:关键词" / "3:关键词#2" / 秒数）'); return None
    i = int(m.group(1))
    if not 1 <= i <= len(S): bad.append(f'{where}: 没有第 {i} 段（共 {len(S)} 段）'); return None
    s = S[i - 1]; w = m.group(2)
    if not w: return s['start']
    if w == 'end': return s['end']
    word, _, nth = w.partition('#'); idx = -1
    for _ in range(int(nth or 1)):
        idx = s['text'].find(word, idx + 1)
    if idx < 0: bad.append(f'{where}: 第 {i} 段找不到「{word}」— 原文：{s["text"]}'); return None
    return s['chars'].get(str(idx), s['start'])
for k, c in enumerate(ed.get('chapters', [])): T(c['at'], f'chapters[{k}]')
for k, e in enumerate(ed.get('emojis', [])): T(e['at'], f'emojis[{k}] {e.get("e")}')
for k, p in enumerate(ed.get('punch', [])): T(p, f'punch[{k}]')
spans = []
for k, c in enumerate(ed.get('cards', [])):
    a = T(c['at'], f'cards[{k}] {c["type"]}')
    if 'until' in c: T(c['until'], f'cards[{k}].until')
    for j, it in enumerate(c.get('items', [])):
        if 'at' in it: T(it['at'], f'cards[{k}].items[{j}]')
    for side in ('left', 'right'):
        if isinstance(c.get(side), dict) and 'at' in c[side]: T(c[side]['at'], f'cards[{k}].{side}')
    if a is not None: spans.append((a, c['type'], k))
for k, s in enumerate(ed.get('showcase', [])):
    a, b = T(s['from'], f'showcase[{k}].from'), T(s['to'], f'showcase[{k}].to')
    if a is not None and b is not None and b - a < 1.5: bad.append(f'showcase[{k}]: 只有 {b - a:.1f} 秒，作品看不清（建议 ≥ 3 秒）')
if ed.get('cta'): T(ed['cta']['at'], 'cta')
# 包装组件：所有嵌套的 at / until 都检查
KNOWN = set("""RetentionCaption ZoomFocus HandDraw FreezeFrame LowerThird SourceTag Counter Countdown ChapterCard SpecCard Danmaku ReactionPop ProgressChapters TeaserColdOpen CompareWipe PaperCollage MapRoute
MemeWindow ColdOpenFreeze EvidenceCard PollPop GlitchInterstitial NamePlate HostFloaters Aside TiltLine DocFocus TypedNameTag PunchInHost RecapBoard SearchTyping CalloutPill LeaderLabel LineDraw BarCompare GhostWord SlamText TornStrip ArchiveCards
NumberSpike ProgressTracker ReviewCards WordStack KeywordStack GlassPanel Odometer SourceDoc TextBehind""".split())
def walk(v, where):
    if isinstance(v, list):
        for i, x in enumerate(v): walk(x, f'{where}[{i}]')
    elif isinstance(v, dict):
        for k, x in v.items():
            if k in ('at', 'until') and isinstance(x, (str, int, float)): T(x, f'{where}.{k}')
            else: walk(x, f'{where}.{k}')
for k, it in enumerate(ed.get('pack', [])):
    if it.get('use') not in KNOWN: bad.append(f'pack[{k}]: 没有组件「{it.get("use")}」（见 references/packaging.md）')
    walk(it, f'pack[{k}] {it.get("use")}')
    for fld in ('src', 'img', 'host', 'cutout'):
        if isinstance(it.get(fld), str) and not (d.parent / 'public' / it[fld]).exists(): bad.append(f'pack[{k}] {it.get("use")}: 素材不存在 public/{it[fld]}')
keys = ed.get('keys', []); text = ''.join(s['text'] for s in S)
miss = [k for k in keys if k not in text]
if miss: bad.append(f'keys 里这些词稿子里没有：{miss}')
spans.sort()
for (a1, t1, k1), (a2, t2, k2) in zip(spans, spans[1:]):
    if a2 - a1 < 0.8: print(f'提醒：cards[{k1}] {t1} 和 cards[{k2}] {t2} 只隔 {a2 - a1:.2f} 秒，前一张会被挤掉')
preset = ed.get('preset', '标准')
if preset not in ('克制', '标准', '热闹'): bad.append(f'preset 只能是 克制 / 标准 / 热闹，现在是 {preset!r}')
n = len(ed.get('emojis', [])); mins = tl['total'] / 60
print(f'{len(S)} 段 · {tl["total"]:.1f} 秒 · 花字强度 {preset} · 关键词 {len(keys)} · 表情 {n}（每分钟 {n / mins:.1f}）· 卡片 {len(spans)} · 推近 {len(ed.get("punch", []))} · 包装组件 {len(ed.get("pack", []))}')
if bad:
    print('\n'.join('✗ ' + b for b in bad)); sys.exit(1)
print('✓ 时间引用全部能对上')
