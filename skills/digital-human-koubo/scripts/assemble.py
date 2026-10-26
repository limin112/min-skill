#!/usr/bin/env python3
"""逐段回听 → 剪掉段尾空白 → 统一规格 → 拼接。
用法：python3 assemble.py script.json [--out 成片_完整版.mp4] [--lang zh] [--size 宽x高（默认保持源尺寸）]
- script.json：[{"id","t","lang",...}]（和 h3.py 同一份）；片段在 gen/<段id>.mp4（h3.py run 取回的）
- 每段的 lang：zh / en-GB / en / ja …，whisper 按段的语言转写
- 每段：whisper 转写（中性提示，不用 --prompt 原文，免得漏前半句）→ 和文稿比准确率 → 只保留到说完后 0.25 秒
- 输出 cut/<id>.mp4（30fps、48k 立体声）、cut/<id>.json（逐字时间，align.py 用）、cut/qa.json、拼接好的 --out（-16 LUFS）
- 准确率 < 85% 的段打 ⚠，先人工听；真念错就单独重拍那段"""
import json, subprocess, difflib, re, os, sys
from pathlib import Path
a = sys.argv[1:]
if len(a) < 1: sys.exit(__doc__)
S = json.load(open(a[0]))
opt = lambda k, d: a[a.index(k) + 1] if k in a else d
out_name, lang, size = opt('--out', '成片_完整版.mp4'), opt('--lang', 'zh'), opt('--size', '')
WM = os.environ.get('WHISPER_MODEL') or next((p for p in map(os.path.expanduser, ['~/.cache/whisper.cpp/ggml-large-v3-turbo.bin', '~/Library/Application Support/Murmur/models/ggml-medium-q5_0.bin', '~/models/ggml-medium-q5_0.bin', '~/.cache/whisper/ggml-medium-q5_0.bin', '~/models/ggml-medium.bin']) if os.path.exists(p)), '~/models/ggml-medium-q5_0.bin')
clean = lambda s: re.sub(r'[\s，。、：；！？,.:;!?“”]', '', s).lower()
Path('cut').mkdir(exist_ok=True); rep = []
for s in S:
    sid = s['id']; src = f"gen/{sid}.mp4"; wav = f'cut/{sid}.wav'
    lg = (s.get('lang_code') or s.get('lang') or lang).split('-')[0]
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-ar', '16000', '-ac', '1', wav], check=True)
    cmd = ['whisper-cli', '-m', WM, '-l', lg] + (['--prompt', '以下是普通话的句子。', '-ml', '1'] if lg == 'zh' else []) + ['-oj', '-of', f'cut/{sid}', '-f', wav]
    subprocess.run(cmd, capture_output=True)
    d = [t for t in json.load(open(f'cut/{sid}.json', errors='replace'))['transcription'] if t['text'].strip() and not t['text'].strip().startswith('[')]
    heard = ''.join(t['text'] for t in d)
    st = min(t['offsets']['from'] for t in d) / 1000 if d else 0; en = max(t['offsets']['to'] for t in d) / 1000 if d else 0
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], capture_output=True, text=True).stdout)
    w, h = map(int, subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src], capture_output=True, text=True).stdout.split(','))
    sz = size or f'{w - w % 2}x{h - h % 2}'          # 保持源尺寸（H3 出的 480×864 / 1024×576 原样保留）
    acc = difflib.SequenceMatcher(None, clean(s['t']), clean(heard)).ratio()
    keep = min(dur, en + 0.25)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-t', f'{keep:.3f}', '-vf', f'scale={sz.replace("x", ":")}:flags=lanczos,fps=30,format=yuv420p',
                    '-af', f'aresample=48000,afade=t=out:st={max(0, keep - 0.12):.3f}:d=0.12', '-ac', '2', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-c:a', 'aac', '-b:a', '192k', f'cut/{sid}.mp4'], check=True)
    rep.append(dict(id=sid, acc=round(acc, 3), speech=[round(st, 2), round(en, 2)], keep=round(keep, 2), src_dur=round(dur, 2), heard=heard))
    print(f"{'⚠' if acc < 0.85 else ' '}{sid:5s} 准确率 {acc:.0%}  说话 {st:.2f}–{en:.2f}s  保留 {keep:.2f}/{dur:.2f}s  听到：{heard}")
json.dump(rep, open('cut/qa.json', 'w'), ensure_ascii=False, indent=1)
sizes = {subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f"cut/{s['id']}.mp4"], capture_output=True, text=True).stdout.strip() for s in S}
if len(sizes) > 1 and not size:
    sys.exit(f'各段尺寸不一样（{sorted(sizes)}，竖屏小窗和横屏场景混着），不拼预览片：cut/<段id>.mp4 直接进剪辑工程。要预览加 --size 宽x高')
open('cut/list.txt', 'w').write(''.join(f"file '{s['id']}.mp4'\n" for s in S))
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'cut/list.txt', '-c', 'copy', 'cut/joined.mp4'], check=True)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', 'cut/joined.mp4', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out_name], check=True)
print('拼接完成', out_name, round(sum(r['keep'] for r in rep), 2), '秒')
