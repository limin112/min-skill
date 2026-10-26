"""新生成片段：按语言转写 → 与文稿比对 → 裁到说话结束 +0.3s → cut/<id>.mp4（竖 720×1280 / 横 1280×720，30fps，48k 立体声）"""
import json, subprocess, difflib, re, os, sys
P = json.load(open('plan.json')); IDS = json.load(open('task_ids.json'))
WM = os.environ.get('WHISPER_MODEL') or next((p for p in map(os.path.expanduser, ['~/Library/Application Support/Murmur/models/ggml-medium-q5_0.bin', '~/models/ggml-medium-q5_0.bin', '~/.cache/whisper/ggml-medium-q5_0.bin', '~/models/ggml-medium.bin']) if os.path.exists(p)), '~/models/ggml-medium-q5_0.bin')   # 也可以用环境变量 WHISPER_MODEL 指定
LANG = {"Mandarin": "zh", "English": "en", "Japanese": "ja", "Korean": "ko", "French": "fr", "Spanish": "es", "Arabic": "ar"}
PROMPT = {"zh": "以下是普通话的句子。"}
clean = lambda s: re.sub(r'[\s，。、：；！？,.:;!?“”「」¡¿～~\'"؟!،]', '', s).lower()
only = set(sys.argv[1:])
MAXKEEP = {'S_travel': 2.95}   # 后半句读错，只留第一句
os.makedirs('cut', exist_ok=True)
rep = json.load(open('cut/qa.json')) if os.path.exists('cut/qa.json') else []
rep = [r for r in rep if only and r['id'] not in only]
for r in P['new']:
    sid = r['id']
    if only and sid not in only: continue
    src = f"gen/renoise-{IDS[sid]}.mp4"; wav = f"cut/{sid}.wav"; lg = LANG[r['lang']]
    subprocess.run(['ffmpeg','-loglevel','error','-y','-i',src,'-ar','16000','-ac','1',wav], check=True)
    cmd = ['whisper-cli','-m',WM,'-l',lg] + (['-ml','1'] if lg == 'zh' else []) + ['-oj','-of',f'cut/{sid}','-f',wav]
    if lg in PROMPT: cmd[5:5] = ['--prompt', PROMPT[lg]]
    subprocess.run(cmd, capture_output=True)
    d = [t for t in json.load(open(f'cut/{sid}.json', errors='replace'))['transcription'] if t['text'].strip() and not t['text'].strip().startswith('[')]
    heard = ''.join(t['text'] for t in d) if lg in ('zh','ja','ko') else ' '.join(t['text'].strip() for t in d)
    st = min(t['offsets']['from'] for t in d)/1000 if d else 0; en = max(t['offsets']['to'] for t in d)/1000 if d else 0
    w, h = map(int, subprocess.run(['ffprobe','-v','error','-select_streams','v','-show_entries','stream=width,height','-of','csv=p=0',src],capture_output=True,text=True).stdout.split(','))
    dur = float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',src],capture_output=True,text=True).stdout)
    acc = difflib.SequenceMatcher(None, clean(r['t']), clean(heard)).ratio()
    keep = min(dur, en + 0.35, MAXKEEP.get(sid, 99))
    size = '720:1280' if h > w else '1280:720'
    subprocess.run(['ffmpeg','-loglevel','error','-y','-i',src,'-t',f'{keep:.3f}','-vf',f'scale={size}:flags=lanczos,fps=30,format=yuv420p',
        '-af',f'aresample=48000,afade=t=out:st={max(0,keep-0.12):.3f}:d=0.12','-ac','2','-c:v','libx264','-crf','17','-preset','medium','-c:a','aac','-b:a','192k',f'cut/{sid}.mp4'], check=True)
    rep.append(dict(id=sid, lang=lg, acc=round(acc,3), speech=[round(st,2),round(en,2)], keep=round(keep,2), src_dur=round(dur,2), vert=h > w, heard=heard))
    print(f"{'⚠' if acc < 0.85 else ' '}{sid:8s} {lg} {acc:.0%}  说话 {st:.2f}–{en:.2f}  保留 {keep:.2f}/{dur:.2f}  {heard}", flush=True)
json.dump(rep, open('cut/qa.json','w'), ensure_ascii=False, indent=1)
