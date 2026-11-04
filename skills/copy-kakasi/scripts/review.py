#!/usr/bin/env python3
"""确认页（无限画布）：按段落分区，每个镜头一张卡片——H3 成片预览（有了就放）+ 原片 | 结果（首帧、尾帧），逐镜头勾「通过」或写意见，一键导出。
检查点 2（换脸后）和检查点 3（H3 出片后）都用它。

在工程根目录跑：python3 review.py [--open]
→ qc/review.html（缩略图在 qc/review/，点图看 keys/ 里的原图）。换脸还在跑也可以生成，没做完的标"待做"；重新跑一次就更新。
操作：拖动平移 · 滚轮平移 · ⌘/Ctrl+滚轮或捏合缩放 · 双击放大 · 0 看全部 · 顶栏按段落跳转。
用户导出的意见是 JSON（{镜头: 意见}），贴回对话里按镜头重做。
"""
import html, json, subprocess, sys, webbrowser
from PIL import Image
from common import ROOT, project, edl, shots, cast, nn, frames_for
import faces, h3_fl

THUMB = 640


def lbl(C, r): return C.get(r, {}).get("label", r)     # 角色显示名：cast.json 的 label，不写就用角色 id


def result_of(n, tag, s, C):
    """这一帧最终会用哪张（和 h3_fl.key 一致）、怎么来的、还差什么"""
    want_rp = [r for r in C if f"{r}_{tag}" in s.get("pose", {})]
    rp_todo = [r for r in want_rp if not (ROOT / f"keys/repaint/{n}_{tag}.{r}.ok").exists()]
    sw_todo = [r for r in s.get("swap", {}) if not (ROOT / f"keys/swap/{n}_{tag}.png").exists()]
    todo = [f"{lbl(C, r)}换脸" for r in sw_todo] + [f"{lbl(C, r)}重画" for r in rp_todo]
    for d, label in (("user", "用户提供"), ("repaint", "打码重画"), ("clean", "原帧去字幕"), ("swap", "直接换脸")):
        p = ROOT / f"keys/{d}/{n}_{tag}.png"
        if p.exists(): return p, label, "、".join(todo)
    if want_rp or s.get("swap"): return None, "", "、".join(todo) or "待做"
    return ROOT / f"keys/src/{n}_{tag}.png", "原帧（没有可换的脸）", ""


def thumb(p):
    out = ROOT / "qc/review" / f"{p.parent.name}_{p.stem}.jpg"
    if not out.exists() or out.stat().st_mtime < p.stat().st_mtime:
        im = Image.open(p).convert("RGB"); im.thumbnail((THUMB, THUMB)); im.save(out, quality=85)
    return f"review/{out.name}?v={int(p.stat().st_mtime)}"


def preview(n):
    """调好色的成片镜头（graded/NN.mp4）→ 640 宽静音预览"""
    g = ROOT / f"graded/{n}.mp4"
    if not g.exists(): return ""
    out = ROOT / f"qc/review/{n}.mp4"
    if not out.exists() or out.stat().st_mtime < g.stat().st_mtime:
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(g), "-vf", "scale=640:-2", "-an", "-c:v", "libx264", "-crf", "24",
                        "-preset", "fast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)], check=True)
    return (f'<div class="vid"><video src="review/{n}.mp4?v={int(out.stat().st_mtime)}" muted loop playsinline preload="metadata" controls></video>'
            f'<div class="dim">H3 成片（悬停播放）</div></div>')


def pre(title, text, extra=""):
    return (f'<div class="pr"><div class="prh"><b>{title}</b>{extra}<button class="cpy">复制</button></div>'
            f'<pre>{html.escape(text)}</pre></div>')


def codex_prompts(n, tag, s, C):
    """这一帧实际经过的出图步骤（按先后），提示词由 faces.py 现场生成（Codex 通道另外追加保存路径和尺寸要求）"""
    out = []
    user = ROOT / f"keys/user/{n}_{tag}.png"
    if user.exists():
        note = ROOT / f"keys/user/{n}_{tag}.txt"
        return [pre("用户提供 / 手工做的帧", note.read_text() if note.exists() else "这一帧是用户提供或手工制作的，没有经过 faces.py。")]
    if (ROOT / f"keys/repaint/{n}_{tag}.joint.ok").exists() or (project().get("face_mode") == "joint" and faces.joint_roles(s, C, tag)):
        roles, got, has_first, imgs = faces.joint_inputs(n, tag, s, C)
        return [pre("所有角色一起打码、一次重画（faces.py joint）", faces.joint_prompt(n, tag, s, C, roles, got, has_first),
                    f' <span class="dim">图：{" + ".join(str(i.relative_to(ROOT)) for i in imgs)}</span>')]
    if s.get("swap") and (ROOT / f"keys/swap/{n}_{tag}.png").exists():
        roles = list(s["swap"])
        refs = [C[r]["refs"][0] for r in roles] + ([f"keys/swap/{n}_a.png"] if tag == "b" else [])
        out.append(pre("① 直接换脸（faces.py swap）", faces.swap_prompt(n, tag, s, C, roles),
                       f' <span class="dim">图：keys/src/{n}_{tag}.png + {" + ".join(refs)}</span>'))
    for r in C:
        if f"{r}_{tag}" in s.get("pose", {}) and (ROOT / f"keys/repaint/{n}_{tag}.{r}.ok").exists():
            has_first = tag == "b" and (ROOT / f"keys/repaint/{n}_a.png").exists()
            refs = C[r]["refs"][:3] if has_first else C[r]["refs"]
            out.append(pre(f"{'②' if out else '①'} 打码后重画{lbl(C, r)}（faces.py repaint）", faces.repaint_prompt(n, tag, s, r, C[r], has_first, refs),
                           f' <span class="dim">图：keys/masked/{n}_{tag}_{r}.png + {" + ".join(refs)}{f" + keys/repaint/{n}_a.png" if has_first else ""}</span>'))
    return out or [pre("没有经过出图", "这一帧没有要换的脸，H3 直接用原片帧。")]


def h3_prompt(e, n, s, C, state):
    L = frames_for(e["frames"]); st = state.get(n, {})
    first, last = h3_fl.key(n, "a"), (None if s.get("first_only") else h3_fl.key(n, "b"))
    meta = (f' <span class="dim">{L} 帧 · {st.get("steps", "?")} 步 · 种子 {st.get("seed", "?")} · 首帧 {first.relative_to(ROOT)}'
            f'{" · 尾帧 " + str(last.relative_to(ROOT)) if last else " · 只钉首帧"}'
            f'{" · 成片只取前 " + str(e["frames"]) + " 帧" if s.get("take") == "head" or s.get("first_only") else " · 整段重采样到 " + str(e["frames"]) + " 帧"}</span>')
    return pre("H3 首尾帧模式（h3_fl.py）", h3_fl.prompt_for(n, s, L, C), meta)


def qa_notes(n):
    """质检没过的帧、H3 片段：放在卡片最上面，别让人漏看（筛选"只看待做"也会选中）"""
    out = []
    for tag, name in (("a", "首帧"), ("b", "尾帧")):
        p = ROOT / f"keys/repaint/{n}_{tag}.qa_fail"
        if p.exists(): out.append(f"{name}质检没过：{html.escape(p.read_text())}")
    p = ROOT / f"gen/{n}.qa.json"
    if p.exists():
        q = json.loads(p.read_text())
        if not q.get("ok"): out.append("H3 片段质检没过：" + html.escape("；".join(q.get("issues", []))))
    return "".join(f'<p class="todo"><b>⚠ {x}</b></p>' for x in out)


def card(e, s, C, t, state):
    n = nn(e); dur = e["frames"] / 24; pairs = []; ready = 0; total = 0
    for tag in ("a",) if s.get("first_only") else ("a", "b"):
        src = ROOT / f"keys/src/{n}_{tag}.png"
        res, label, todo = result_of(n, tag, s, C)
        total += 1; ready += 1 if res and not todo else 0
        img = lambda p: f'<img src="{thumb(p)}" data-full="../{p.relative_to(ROOT)}" loading="lazy">'
        pairs.append(f'''<div class="pair"><figure>{img(src)}<figcaption>{"首帧" if tag == "a" else "尾帧"} · 原片</figcaption></figure>
<figure class="res">{img(res) if res else '<div class="empty">待做</div>'}<figcaption>{"首帧" if tag == "a" else "尾帧"} · <b>{label or "—"}</b>{f' <span class="todo">待做：{todo}</span>' if todo else ""}</figcaption></figure></div>''')
    who = "、".join(lbl(C, w) for w in s.get("who", [])) or "无主角的脸"
    how = "".join(f"<li><b>直接换{lbl(C, k)}</b>：{html.escape(v)}</li>" for k, v in s.get("swap", {}).items())
    how += "".join(f"<li><b>{lbl(C, k[:-2])}{'首帧' if k.endswith('a') else '尾帧'}重画</b>：{html.escape(v)}</li>" for k, v in s.get("pose", {}).items())
    return f'''<div class="card shot" id="s{n}" data-n="{n}">
<header><span class="id">{n}</span><span class="act">{html.escape(e.get("act", ""))}</span>
<span class="dim">{int(t // 60)}:{t % 60:04.1f}–{int((t + dur) // 60)}:{(t + dur) % 60:04.1f} · {dur:.1f}s · {who}</span>
<label class="ok"><input type="checkbox" data-k="ok"> 通过</label></header>
{qa_notes(n)}{preview(n)}{"".join(pairs)}
<details><summary>画面 / 情绪 / 换脸说明</summary><p>{html.escape(s.get("desc", ""))}</p><p class="dim">{html.escape(s.get("cam", ""))}</p><ul>{how or "<li>没有要换的脸</li>"}</ul></details>
<details><summary>换脸提示词</summary>{"".join(f'<h4>{"首帧" if tag == "a" else "尾帧"}</h4>' + "".join(codex_prompts(n, tag, s, C)) for tag in (("a",) if s.get("first_only") else ("a", "b")))}</details>
<details><summary>H3 提示词</summary>{h3_prompt(e, n, s, C, state)}</details>
<textarea data-k="note" placeholder="这个镜头的意见（例如：眼神要看左边 / 不像我 / 眼镜歪了）"></textarea>
</div>''', ready, total


def main():
    P, S, C = project(), shots(), cast()
    (ROOT / "qc/review").mkdir(parents=True, exist_ok=True)
    acts, t, ready, total = [], 0.0, 0, 0
    sf = ROOT / "gen/state.json"; state = json.loads(sf.read_text()) if sf.exists() else {}
    for e in edl():
        a = e.get("act") or "镜头"
        if not acts or acts[-1][0] != a: acts.append((a, []))
        c, r, k = card(e, S.get(nn(e), {}), C, t, state); acts[-1][1].append(c); ready += r; total += k; t += e["frames"] / 24
    blocks = "".join(f'<section class="blk" id="a{i}"><h2 class="lane">{html.escape(a)} <span class="dim">· {len(cs)} 个镜头</span></h2>'
                     f'<div class="grid">{"".join(cs)}</div></section>' for i, (a, cs) in enumerate(acts))
    nav = "".join(f'<button data-go="#a{i}">{html.escape(a)}</button>' for i, (a, _) in enumerate(acts))
    stage = "gen" if any((ROOT / f"graded/{nn(e)}.mp4").exists() for e in edl()) else "keys"
    title = f"{P.get('title', '')} · " + ("H3 成片逐镜头确认" if stage == "gen" else "换脸首尾帧确认")
    page = (TEMPLATE.replace("{{TITLE}}", html.escape(title)).replace("{{WORLD}}", f'<div class="stack">{blocks}</div>')
            .replace("{{NAV}}", nav).replace("{{PROGRESS}}", f"{ready}/{total} 帧就绪").replace("{{KEY}}", json.dumps(f"review:{ROOT.name}:{stage}")))   # 两个阶段的意见分开存
    out = ROOT / "qc/review.html"; out.write_text(page)
    print(f"→ {out.relative_to(ROOT)}（{ready}/{total} 帧就绪）")
    if "--open" in sys.argv: webbrowser.open(out.as_uri())


TEMPLATE = r'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{TITLE}}</title>
<style>
:root{--bg:#121110;--dot:#2a2622;--card:#1c1a17;--line:#35302a;--ink:#ece6dc;--dim:#968c80;--acc:#dc7454;--acc2:#e9b872;--ok:#7bc47f;--bad:#e07a6a}
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--ink);font:15px/1.6 "PingFang SC","Hiragino Sans GB",system-ui,sans-serif}
#vp{position:fixed;inset:0;cursor:grab;background-image:radial-gradient(var(--dot) 1.2px,transparent 1.2px);background-size:28px 28px}#vp.drag{cursor:grabbing}
#world{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.stack{position:absolute;left:0;top:0;display:flex;flex-direction:column;gap:110px}
.lane{margin:0 0 30px;font-size:44px;font-weight:700;white-space:nowrap}.lane .dim{font-size:24px;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(4,1400px);gap:60px;align-items:start}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:22px 24px;box-shadow:0 10px 30px #0007}
.card.passed{border-color:#4f7a52;box-shadow:0 0 0 3px #4f7a5266}.card.noted{border-color:#9a6a3a;box-shadow:0 0 0 3px #9a6a3a66}
.shot header{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;margin-bottom:14px}
.id{font:700 34px/1 ui-monospace,Menlo,monospace;color:var(--acc)}.act{color:var(--acc2);font-size:20px;font-weight:600}.dim{color:var(--dim)}
.ok{margin-left:auto;color:var(--ok);font-size:18px;cursor:pointer}.ok input{width:20px;height:20px;vertical-align:-3px}
.vid{margin-bottom:14px}.vid video{width:100%;aspect-ratio:16/9;background:#000;border-radius:8px;display:block}.vid .dim{font-size:14px;margin-top:4px}
.pair{display:flex;gap:14px;margin-bottom:14px}.pair figure{flex:1;margin:0;min-width:0}
.pair img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;border-radius:6px;background:#0f0e0d;cursor:zoom-in}
.res img{outline:3px solid #3a352e}figcaption{font-size:14px;color:var(--dim);margin-top:5px}figcaption b{color:var(--ink)}
.todo{color:var(--bad)}.empty{aspect-ratio:16/9;border:2px dashed var(--line);border-radius:6px;display:grid;place-items:center;color:var(--dim);font-size:20px}
details{margin-top:4px}summary{cursor:pointer;color:var(--acc);font-weight:600}
details h4{margin:12px 0 6px;color:var(--acc2);font-size:15px}.pr{margin:8px 0}.prh{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:6px;font-size:14px}
.prh .cpy{margin-left:auto;background:#141210;color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:3px 12px;cursor:pointer;font-size:12px}
pre{white-space:pre-wrap;word-break:break-word;background:#0f0e0d;border:1px solid var(--line);border-radius:8px;padding:12px;margin:0;max-height:520px;overflow:auto;
 font:13px/1.55 ui-monospace,Menlo,monospace;color:#d8cfc2;cursor:text;user-select:text}details p{margin:8px 0}details ul{margin:6px 0;padding-left:20px}
textarea{width:100%;margin-top:12px;min-height:56px;background:#141210;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:10px;font:inherit;font-size:16px;resize:vertical;cursor:text}
#ui{position:fixed;left:16px;top:14px;right:16px;display:flex;gap:8px;z-index:9;align-items:center;flex-wrap:wrap}
#ui button,#ui select{background:#1c1a17ee;color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:7px 14px;font:inherit;font-size:13px;cursor:pointer}
#ui button:hover{border-color:var(--acc)}#ui .main{background:var(--acc2);color:#1a1408;border-color:var(--acc2);font-weight:600}
#ui .sp{flex:1}#zoom{font:12px ui-monospace,Menlo,monospace;color:var(--dim)}.prog{color:var(--acc2);font-size:13px}#cnt{font-size:13px;color:var(--dim)}
#help{position:fixed;right:16px;bottom:14px;font-size:12px;color:var(--dim);z-index:9}
#lb{position:fixed;inset:0;background:#000e;display:none;align-items:center;justify-content:center;z-index:20;cursor:zoom-out}#lb.on{display:flex}#lb img{max-width:96vw;max-height:94vh}
#out{position:fixed;inset:12% 18%;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;display:none;z-index:21;flex-direction:column;gap:10px}
#out.on{display:flex}#out textarea{flex:1;font-family:ui-monospace,Menlo,monospace;font-size:13px}#out button{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:7px 14px;cursor:pointer}
</style></head><body>
<div id="ui"><b style="margin-right:6px">{{TITLE}}</b><span class="prog">{{PROGRESS}}</span><span id="cnt"></span>
<button data-go="fit">全部</button>{{NAV}}<button id="zin">＋</button><button id="zout">－</button><span id="zoom"></span><span class="sp"></span>
<select id="flt"><option value="all">全部镜头</option><option value="todo">只看待做</option><option value="open">只看未通过</option><option value="noted">只看有意见</option></select>
<button class="main" id="exp">导出意见</button></div>
<div id="help">拖动平移 · 滚轮平移 · ⌘/Ctrl+滚轮或捏合缩放 · 双击放大 · 0 看全部 · 点图看大图</div>
<div id="vp"><div id="world">{{WORLD}}</div></div>
<div id="lb"><img></div>
<div id="out"><b>复制下面的内容，贴回对话：</b><textarea readonly></textarea><div><button id="cp">复制</button> <button id="cl">关闭</button></div></div>
<script>
const vp=document.getElementById('vp'),w=document.getElementById('world'),zl=document.getElementById('zoom');
let s=.2,x=40,y=90,anim=null;
const apply=()=>{w.style.transform=`translate(${x}px,${y}px) scale(${s})`;zl.textContent=Math.round(s*100)+'%';
 vp.style.backgroundSize=`${28*s}px ${28*s}px`;vp.style.backgroundPosition=`${x}px ${y}px`};
const zoomAt=(f,cx,cy)=>{const n=Math.min(2.5,Math.max(.04,s*f));x=cx-(cx-x)*n/s;y=cy-(cy-y)*n/s;s=n;apply()};
const boxOf=el=>{let l=0,t=0,e=el;while(e&&e!==w){l+=e.offsetLeft;t+=e.offsetTop;e=e.offsetParent}return[l,t,el.offsetWidth,el.offsetHeight]};
const bounds=()=>boxOf(w.querySelector('.stack'));
function go([bx,by,bw,bh]){const W=innerWidth,H=innerHeight-70,t=Math.min(1.2,Math.min(W/(bw+120),H/(bh+120)));
 const tx=(W-bw*t)/2-bx*t,ty=70+(H-bh*t)/2-by*t,[s0,x0,y0]=[s,x,y],t0=performance.now();cancelAnimationFrame(anim);
 const step=now=>{const k=Math.min(1,(now-t0)/450),e=1-Math.pow(1-k,3);s=s0+(t-s0)*e;x=x0+(tx-x0)*e;y=y0+(ty-y0)*e;apply();if(k<1)anim=requestAnimationFrame(step)};
 anim=requestAnimationFrame(step)}
let drag=null,moved=false;
const skip=e=>e.target.closest('textarea,input,label,select,details,button,video,pre');
vp.addEventListener('pointerdown',e=>{if(skip(e))return;drag={px:e.clientX,py:e.clientY,x,y};moved=false;vp.classList.add('drag');vp.setPointerCapture(e.pointerId)});
vp.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.px,dy=e.clientY-drag.py;if(Math.abs(dx)+Math.abs(dy)>4)moved=true;x=drag.x+dx;y=drag.y+dy;apply()});
vp.addEventListener('pointerup',e=>{const was=drag;drag=null;vp.classList.remove('drag');
 if(was&&!moved){const im=document.elementsFromPoint(e.clientX,e.clientY).find(el=>el.matches&&el.matches('img[data-full]'));
  if(im){const lb=document.getElementById('lb');lb.querySelector('img').src=im.dataset.full;lb.classList.add('on')}}});
vp.addEventListener('wheel',e=>{const p=e.target.closest('pre');if(e.target.closest('textarea')||(p&&!e.ctrlKey&&!e.metaKey&&p.scrollHeight>p.clientHeight))return;e.preventDefault();
 if(e.ctrlKey||e.metaKey)zoomAt(Math.exp(-e.deltaY*.01),e.clientX,e.clientY);else{x-=e.deltaX;y-=e.deltaY;apply()}},{passive:false});
vp.addEventListener('dblclick',e=>{if(!skip(e))zoomAt(1.8,e.clientX,e.clientY)});
document.getElementById('zin').onclick=()=>zoomAt(1.25,innerWidth/2,innerHeight/2);
document.getElementById('zout').onclick=()=>zoomAt(.8,innerWidth/2,innerHeight/2);
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{const g=b.dataset.go;go(g==='fit'?bounds():boxOf(document.querySelector(g)))});
addEventListener('keydown',e=>{if(e.target.closest('textarea,input,select'))return;if(e.key==='0')go(bounds());
 if(e.key==='='||e.key==='+')zoomAt(1.25,innerWidth/2,innerHeight/2);if(e.key==='-')zoomAt(.8,innerWidth/2,innerHeight/2);
 if(e.key==='Escape'){document.getElementById('lb').classList.remove('on');document.getElementById('out').classList.remove('on')}});
document.getElementById('lb').onclick=()=>document.getElementById('lb').classList.remove('on');
// 意见：存在 localStorage，按镜头号
const KEY={{KEY}};let st=JSON.parse(localStorage.getItem(KEY)||'{}');
const save=()=>{localStorage.setItem(KEY,JSON.stringify(st));paint()};
document.querySelectorAll('.shot').forEach(c=>{const n=c.dataset.n;st[n]=st[n]||{};
 c.querySelectorAll('[data-k]').forEach(el=>{const k=el.dataset.k;
  if(el.type==='checkbox'){el.checked=!!st[n][k];el.onchange=()=>{st[n][k]=el.checked;save()}}
  else{el.value=st[n][k]||'';el.oninput=()=>{st[n][k]=el.value;save()}}})});
function paint(){let p=0,m=0;document.querySelectorAll('.shot').forEach(c=>{const v=st[c.dataset.n]||{},noted=!!(v.note||'').trim();
 c.classList.toggle('passed',!!v.ok&&!noted);c.classList.toggle('noted',noted);if(v.ok)p++;if(noted)m++});
 document.getElementById('cnt').textContent=`已通过 ${p} · 有意见 ${m}`;filt()}
function filt(){const f=document.getElementById('flt').value;document.querySelectorAll('.shot').forEach(c=>{const v=st[c.dataset.n]||{};
 const todo=!!c.querySelector('.todo,.empty');c.style.opacity=(f==='all'||(f==='todo'&&todo)||(f==='open'&&!v.ok)||(f==='noted'&&(v.note||'').trim()))?'':'.12'})}
document.getElementById('flt').onchange=filt;
document.getElementById('exp').onclick=()=>{const o={};Object.entries(st).forEach(([n,v])=>{const t=(v.note||'').trim();if(v.ok||t)o[n]=t||'通过'});
 const b=document.getElementById('out');b.querySelector('textarea').value=JSON.stringify(o,null,1);b.classList.add('on')};
document.getElementById('cp').onclick=()=>{const t=document.querySelector('#out textarea');t.select();navigator.clipboard.writeText(t.value)};
document.getElementById('cl').onclick=()=>document.getElementById('out').classList.remove('on');
document.querySelectorAll('.vid video').forEach(v=>{const c=v.closest('.card');c.addEventListener('mouseenter',()=>v.play().catch(()=>{}));c.addEventListener('mouseleave',()=>v.pause())});
document.querySelectorAll('.cpy').forEach(b=>b.onclick=()=>{navigator.clipboard.writeText(b.closest('.pr').querySelector('pre').textContent);b.textContent='已复制';setTimeout(()=>b.textContent='复制',1200)});
paint();apply();requestAnimationFrame(()=>{const t=location.hash&&document.querySelector(location.hash);go(t?boxOf(t):bounds())});
</script></body></html>'''

if __name__ == "__main__":
    main()
