"""第三期时间轴：冷开场（多语言快闪 + 猫狗）→ 字卡 → 她开场 → 基础三步（复用第二期）→ 交棒 → 你讲多语言/进场景（插 4 段场景）→ 她讲换角色（插猫狗）→ 成片流程（复用）→ 结尾快闪 + 两人同框 + 片尾"""
import json, difflib
EP2 = '../renoise-academy-ep2/'
P = json.load(open('plan.json')); NEW = {r['id']: r for r in P['new']}
Q = {r['id']: r for r in json.load(open('cut/qa.json'))}
Q2 = {r['id']: r for r in json.load(open(EP2 + 'cut/qa.json'))}
S2 = {s['id']: s for s in json.load(open(EP2 + 'script.json'))}
PUNCT = set('，。、：；！？,.:;!? “”「」"～~')
def chars_of(sid, text):
    toks = []
    for t in json.load(open(f'cut/{sid}.json', errors='replace'))['transcription']:
        s, e = t['offsets']['from'] / 1000, t['offsets']['to'] / 1000; tx = t['text'].strip()
        if not tx or tx.startswith('['): continue
        for k, ch in enumerate(tx):
            if ch not in PUNCT: toks.append((ch.lower(), s + (e - s) * k / len(tx)))
    clean = [(j, ch.lower()) for j, ch in enumerate(text) if ch not in PUNCT]
    a = ''.join(c for _, c in clean); b = ''.join(c for c, _ in toks)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False); st = [None] * len(clean)
    for bl in sm.get_matching_blocks():
        for k in range(bl.size): st[bl.a + k] = toks[bl.b + k][1]
    known = [k for k, v in enumerate(st) if v is not None]
    for k in range(len(st)):
        if st[k] is None:
            lo = max([j for j in known if j < k], default=None); hi = min([j for j in known if j > k], default=None)
            st[k] = 0.0 if lo is None and hi is None else (st[hi] if lo is None else (st[lo] + 0.18 * (k - lo) if hi is None else st[lo] + (st[hi] - st[lo]) * (k - lo) / (hi - lo)))
    return {str(j): round(st[k], 3) for k, (j, _) in enumerate(clean)}
ZH = {'L_en': '嗨！我是 AI 数字人，我会说你的语言。', 'L_ja': '你好！我是 AI 数字人。', 'L_ko': '你好！我是 AI 数字人。', 'L_fr': '你好！我是 AI 创造的数字人。',
      'L_es': '你好！我是用 AI 做的数字人。', 'L_ar': '你好！我是人工智能创造的数字人。',
      'S_ad': '40 小时续航，零线缆，按下就能播放。', 'S_travel': '这里是京都祇园。', 'S_dog': '晚上好。突发新闻：公园现已开放——欢迎来摸肚皮。'}
LBL = {'L_en': ('English', '英语'), 'L_ja': ('日本語', '日语'), 'L_ko': ('한국어', '韩语'), 'L_fr': ('Français', '法语'), 'L_es': ('Español', '西班牙语'), 'L_ar': ('العربية', '阿拉伯语')}
SC = {'S_shop': ('直播间带货', '中文'), 'S_ad': ('产品广告', 'English'), 'S_travel': ('旅游导览 · 京都', '日本語'), 'S_class': ('课程讲师', '中文'),
      'S_cat': ('橘猫店长', '中文'), 'S_dog': ('柴犬新闻主播', 'English'), 'S_duo': ('两位主播同框', '中文')}
items, t = [], 0.0
def add(d, gap=0.12):
    global t
    d['start'] = round(t, 3); items.append(d); t += d['dur'] + gap
def nar_new(i, ch):
    r = NEW[i]; add(dict(kind='nar', id=i, ch=ch, host=r['host'], shot=r['shot'], text=r['t'], src=f'nar/{i}.mp4', dur=Q[i]['keep'], chars=chars_of(i, r['t'])))
def nar_old(i, ch):
    s = S2[i]; add(dict(kind='nar', id=i, ch=ch, host='tank', shot=s['shot'], text=s['t'], src=f'nar/{i}.mp4', dur=Q2[i]['keep'], chars=chars_of(i, s['t'])))
def clip(i, role, ch, dur=None, offset=0.0, audio=True, gap=0.0):
    r = NEW[i]; d = dict(kind='clip', id=i, role=role, ch=ch, src=f'scene/{i}.mp4', vert=Q[i]['vert'], text=r['t'], dur=round(dur or Q[i]['keep'] - offset, 3), offset=offset, audio=audio)
    if role == 'lang': d.update(label=LBL[i][0], zh2=LBL[i][1], zh=ZH[i])
    elif i in SC: d.update(label=SC[i][0], lang=SC[i][1])
    if role == 'scene':
        if i in ZH: d['zh'] = ZH[i]
        else: d['chars'] = chars_of(i, r['t'])
    add(d, gap)
# 冷开场：六种语言快闪（每段放完一整句）+ 猫狗各一嘴
clip('L_en', 'lang', '开场', gap=0.0)
GREET = {'L_ja': ('こんにちは！', 0.95), 'L_ko': ('안녕하세요!', 1.15), 'L_fr': ('Bonjour !', 0.95), 'L_es': ('¡Hola!', 0.85), 'L_ar': ('مرحباً!', 0.95)}
for i, (g, d) in GREET.items():
    clip(i, 'lang', '开场', dur=d, gap=0.0); items[-1].update(text=g, zh='你好！', greet=True)
clip('S_cat', 'flash', '开场', dur=0.85, gap=0.0); items[-1].update(text='喵～', zh='（橘猫店长）')
clip('S_dog', 'flash', '开场', dur=0.95, gap=0.0); items[-1].update(text='Good evening.', zh='晚上好。（柴犬主播）')
add(dict(kind='title', id='title', ch='开场', dur=3.2))
nar_new('t1', '开场'); nar_new('t2', '开场')
for i in ['s1a', 's1b', 's1c', 's1d', 's1e', 's2a', 's2b', 's2c', 's3a', 's3b']: nar_old(i, '基础三步')
nar_new('t3', '基础三步')
for i in ['u1', 'u2', 'u3', 'u4']: nar_new(i, '新同事')
for i in ['u5', 'u6']: nar_new(i, '①多语言')
for i in ['u7', 'u8', 'u9', 'u10']: nar_new(i, '②进场景')
for i in ['S_shop', 'S_ad', 'S_travel', 'S_class']: clip(i, 'scene', '②进场景', gap=0.1)
nar_new('u11', '②进场景')
for i in ['t4', 't5']: nar_new(i, '③换角色')
for i in ['S_cat', 'S_dog']: clip(i, 'scene', '③换角色', gap=0.1)
nar_new('u12', '成片流程')
for i in ['s4b', 's4c', 's4d', 's6b', 's6c', 's7b', 's7c']: nar_old(i, '成片流程')
# 结尾：快闪（静音、配乐抬起）→ 两人同框 → 片尾
for i, off in [('S_shop', 2.0), ('L_ja', 1.4), ('S_ad', 1.0), ('L_es', 1.6), ('S_travel', 0.6), ('S_class', 2.6), ('L_ar', 2.0), ('S_cat', 3.0), ('L_ko', 1.0), ('S_dog', 3.5), ('L_fr', 2.2)]:
    clip(i, 'montage', '结尾', dur=0.55, offset=off, audio=False, gap=0.0)
t += 0.1
clip('S_duo', 'scene', '结尾', gap=0.1)
add(dict(kind='outro', id='outro', ch='结尾', dur=4.5), gap=0)
json.dump(dict(total=round(t, 3), items=items), open('film/src/tl.json', 'w'), ensure_ascii=False, indent=0)
print('总长', round(t, 1), '秒 =', f'{int(t//60)}:{t%60:04.1f}', '条目', len(items))
