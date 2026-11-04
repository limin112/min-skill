#!/usr/bin/env python3
"""首尾帧换人。出图通道看用户配置（默认 Codex CLI）。在工程根目录跑。

  python3 faces.py swap    [--only 03,22] [--jobs 4] [--dry] [--wait 60]   直接换脸 → keys/swap/NN_a|b.png
  python3 faces.py repaint [--only 03,22] [--jobs 4] [--dry] [--wait 60]   先打码原脸再按身份照重画 → keys/repaint/NN_a|b.png
  python3 faces.py joint   [--only 03,22] [--jobs 4] [--dry] [--wait 60] [--tries 3]   同一帧所有人一起打码、一次调用一起重画，只把头贴回原帧并质检 → keys/repaint/NN_a|b.png

--wait N：出图满载时，每 3 分钟补一轮没出的，最多等 N 分钟。失败原因直接打印出来。

三种方式：
  swap     原片整帧 + 身份图直接换。快，适合 AI 虚构角色；缺点是脸型骨相会被原演员带着走。shots.json 的 swap 里列了谁，这个镜头就直接换谁（远景小脸、背影没法打码，只能直接换）。
  repaint  先把原演员的脸打成马赛克（只留头发、轮廓、角度、光线），再照身份照片把整张脸画进去。像本人的程度明显更高；代价是表情和朝向看不到了，要在 pose 里写清楚。
           同一帧多个 repaint 角色一个接一个，上一个的结果当下一个的底图。底图优先用 swap 的结果。
  joint    所有角色统一处理：两人同框从 4 次调用降到 2 次；模型重画整张图也不怕，只取头部贴回原帧（qa_paste.py），并自动质检，不过就换种子重出，还不过就标 qa_fail。需要 doctor.py --fetch-models。
           一次最多 5 张图：打码帧 1 张 +（尾帧）首帧 1 张，剩下的按角色轮流分身份照，本人优先。
每个镜头先做首帧 a，再把做好的 a 当作一致性参考去做尾帧 b，首尾两张脸才对得上。
所有结果先写到 keys/repaint/raw/，成功才替换正式文件：中途失败不会丢掉已有成果。
"""
import sys, time
from concurrent.futures import ThreadPoolExecutor
import cv2
import numpy as np
from common import ROOT, KEY_W, KEY_H, CONSENT_TXT, MAX_IMAGES, cast, ocr_ready, project, shots, edit_image, image_why, opt, only

_CASC = None
def cascades():
    """用到自动检脸才加载；OpenCV 版本不对时说清楚，别让整个脚本一启动就崩"""
    global _CASC
    if _CASC is None:
        if not hasattr(cv2, "CascadeClassifier"):
            sys.exit(f"OpenCV {cv2.__version__} 没有 CascadeClassifier：pip3 install 'opencv-python-headless>=4.8,<5'，或在 shots.json 的 box 里手标人脸")
        _CASC = [cv2.CascadeClassifier(cv2.data.haarcascades + f"haarcascade_{n}.xml") for n in ("frontalface_default", "profileface")]
    return _CASC
NOOIL = "Skin looks natural and matte with fine pores: no oily shine, no sweat, no glossy highlights, no plastic or waxy skin, no beauty filter."
DRY = "--dry" in sys.argv


def acc(r):
    return f" {r['name'].capitalize()} wears {r['accessory']}, fitted to the head angle, with natural subtle reflections." if r.get("accessory") else ""


# ---------- swap ----------
def swap_prompt(n, tag, s, C, roles):
    lines = [f"Image {i + 2} is the identity reference for {C[r]['name']} ({CONSENT_TXT[C[r]['consent']]})."
             for i, r in enumerate(roles)]
    if tag == "b": lines.append(f"Image {len(roles) + 2} is the already-edited first frame of this same shot: the faces must match it exactly.")
    who = " and ".join(s["swap"][r] for r in roles)
    return ("Use your image generation tool to EDIT the first attached image, a still frame from a film. " + " ".join(lines) + " "
            f"Replace ONLY the faces of {who} so each face becomes exactly the face of the matching identity reference "
            "(same face shape, eyes, eyebrows, nose, lips, skin tone and facial hair). Keep EVERYTHING else identical to image 1: "
            "exact composition and framing, camera angle, head angle and pose, the facial expression and emotion, eye direction, mouth shape, "
            "hairstyle and hair position, costume, any makeup, props, background, lighting direction and colour, depth of field, motion blur and film grain."
            + "".join(acc(C[r]) for r in roles) + f" {NOOIL}")


def swap_one(n, tag, s, C):
    out = ROOT / f"keys/swap/{n}_{tag}.png"
    if out.exists(): return f"{n}_{tag} 已有"
    roles = list(s["swap"])      # 镜头表里列了谁就直接换谁；repaint 角色在远景小脸、背影这类没法打码的镜头里也走这里
    imgs = [ROOT / f"keys/src/{n}_{tag}.png"] + [ROOT / C[r]["refs"][0] for r in roles] + ([ROOT / f"keys/swap/{n}_a.png"] if tag == "b" else [])
    p = swap_prompt(n, tag, s, C, roles)
    if DRY: return f"--- {n}_{tag}  图：{[str(i.relative_to(ROOT)) for i in imgs]}\n{p}"
    lg = ROOT / f"keys/swap/{n}_{tag}.log"
    return f"{n}_{tag} ✓" if edit_image(imgs, p, out, lg) else f"{n}_{tag} ✗ {image_why(lg)}"


# ---------- repaint ----------
def find_face(img, hint=None):
    CASC, PROF = cascades()
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    fs = list(CASC.detectMultiScale(g, 1.08, 5, minSize=(80, 80)))
    if not fs:
        fs = list(PROF.detectMultiScale(g, 1.08, 4, minSize=(80, 80)))
        fs += [(img.shape[1] - x - w, y, w, h) for (x, y, w, h) in PROF.detectMultiScale(cv2.flip(g, 1), 1.08, 4, minSize=(80, 80))]
    if hint: fs = [f for f in fs if hint[0] <= f[0] + f[2] / 2 <= hint[1]] or fs   # 同框多人：按水平位置挑
    return max(fs, key=lambda f: f[2]) if fs else None


def mosaic(src, dst, hint=None, box=None):
    """脸部椭圆马赛克（像素块 + 模糊，边缘羽化）：五官彻底看不见，头型、发际线、光的方向还在。返回打码框，没找到脸返回 None"""
    img = cv2.imread(str(src))
    if box: x0, y0, x1, y1 = box
    else:
        f = find_face(img, hint)
        if f is None: return None
        x, y, w, h = f
        x0, x1 = max(0, int(x - 0.15 * w)), min(img.shape[1], int(x + 1.15 * w))
        y0, y1 = max(0, int(y - 0.05 * h)), min(img.shape[0], int(y + 1.18 * h))
    roi = img[y0:y1, x0:x1]; bw = max(1, (x1 - x0) // 7)
    small = cv2.resize(roi, (max(1, (x1 - x0) // bw), max(1, (y1 - y0) // bw)), interpolation=cv2.INTER_AREA)
    mos = cv2.GaussianBlur(cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST), (0, 0), bw * 0.6)
    m = np.zeros((y1 - y0, x1 - x0), np.float32)
    cv2.ellipse(m, ((x1 - x0) // 2, (y1 - y0) // 2), ((x1 - x0) // 2, (y1 - y0) // 2), 0, 0, 360, 1, -1)
    m = cv2.GaussianBlur(m, (0, 0), bw * 0.5)[..., None]
    img[y0:y1, x0:x1] = (mos * m + roi * (1 - m)).astype(np.uint8)
    cv2.imwrite(str(dst), img); return [int(x0), int(y0), int(x1), int(y1)]


def repaint_prompt(n, tag, s, r, R, has_first, refs):
    k = len(refs) + 2
    extra = f" Image {k} is the already-finished first frame of this same shot: the face{' and ' + R['accessory'] if R.get('accessory') else ''} must match it exactly." if has_first else ""
    who = R["name"]
    return ("Use your image generation tool to EDIT the first attached image, a still frame from a film in which "
            f"{who}'s face has been blurred out on purpose. Images 2 to {len(refs) + 1} are identity references of the same person, "
            f"{CONSENT_TXT[R['consent']]}." + extra + f" Paint the complete face inside the blurred area so it is unmistakably this person: {R['identity']} "
            "— do NOT invent or keep any other person's facial structure." + acc(R) +
            f" Pose and expression: {s['pose'][f'{r}_{tag}']} Match the head size, head angle, perspective, lighting direction, colour, "
            "softness and film grain of image 1 so the face blends in seamlessly. Keep everything outside the blurred area identical to image 1: "
            f"hair, costume, background, composition, any other person. {NOOIL}")


def repaint_one(n, tag, s, C):
    out = ROOT / f"keys/repaint/{n}_{tag}.png"
    roles = [r for r in C if C[r].get("method") == "repaint" and f"{r}_{tag}" in s.get("pose", {})]   # 脸被挡住的帧不写 pose，就不重画
    if not roles: return None
    log = []
    for r in roles:   # 同一帧有多个 repaint 角色：一个接一个，上一个的结果当下一个的底图
        mark = ROOT / f"keys/repaint/{n}_{tag}.{r}.ok"
        if mark.exists() and out.exists(): log.append(f"{n}_{tag}/{r} 已有"); continue
        base = next((p for p in (out, ROOT / f"keys/swap/{n}_{tag}.png") if p.exists()), ROOT / f"keys/src/{n}_{tag}.png")
        masked = ROOT / f"keys/masked/{n}_{tag}_{r}.png"
        if not DRY and not mosaic(base, masked, s.get("hint", {}).get(r), s.get("box", {}).get(f"{r}_{tag}")):
            log.append(f"{n}_{tag}/{r} ✗ 没找到脸（在 shots.json 的 box 里手标 {r}_{tag}）"); break
        first = ROOT / f"keys/repaint/{n}_a.png"
        has_first = tag == "b" and first.exists()
        refs = C[r]["refs"][:3] if has_first else C[r]["refs"]   # Codex 一次最多看 5 张图：尾帧多带一张首帧，身份照就少一张
        imgs = [masked] + [ROOT / f for f in refs] + ([first] if has_first else [])
        p = repaint_prompt(n, tag, s, r, C[r], has_first, refs)
        if DRY: log.append(f"--- {n}_{tag}/{r}  底图 {base.relative_to(ROOT)}  图：{[str(i.relative_to(ROOT)) for i in imgs]}\n{p}"); continue
        lg = ROOT / f"keys/repaint/{n}_{tag}_{r}.log"; tmp = ROOT / f"keys/repaint/raw/{n}_{tag}.{r}.png"
        if edit_image(imgs, p, tmp, lg): tmp.replace(out); mark.touch(); log.append(f"{n}_{tag}/{r} ✓")     # 成功才替换：失败时已画好的角色还在
        else: log.append(f"{n}_{tag}/{r} ✗ {image_why(lg)}"); break
    return " · ".join(log)


# ---------- joint：同一帧里所有要换的人一起打码，一次 Codex 调用一起重画 ----------
def joint_roles(s, C, tag):
    return [r for r in C if f"{r}_{tag}" in s.get("pose", {})]      # 脸被挡住、看不到的帧不写 pose，就不重画


def joint_refs(roles, C, slots):
    """Codex 一次最多看 5 张图：身份照按角色轮流分，每人至少 1 张，本人（self）排在前面多拿"""
    order = sorted(roles, key=lambda r: C[r]["consent"] != "self")
    got = {r: [] for r in roles}; i = 0
    while slots > 0 and any(len(got[r]) < len(C[r]["refs"]) for r in order):
        r = order[i % len(order)]; i += 1
        if len(got[r]) < len(C[r]["refs"]): got[r].append(C[r]["refs"][len(got[r])]); slots -= 1
    return got


def joint_prompt(n, tag, s, C, roles, got, has_first):
    k, lines = 2, []
    for r in roles:
        m = len(got[r]); rng = f"Image {k} is an identity reference" if m == 1 else f"Images {k} to {k + m - 1} are identity references"
        lines.append(f"{rng} of {C[r]['name']} ({C[r].get('where', C[r]['name'])} in image 1), {CONSENT_TXT[C[r]['consent']]}."); k += m
    if has_first: lines.append(f"Image {k} is the already-finished first frame of this same shot: every face" +
                                ("" if not any(C[r].get("accessory") for r in roles) else " and accessory") + " must match it exactly.")
    many = len(roles) > 1
    per = " ".join(f"{C[r]['name'].capitalize()}: {C[r].get('identity', 'the same face shape, eyes, eyebrows, nose, lips and skin tone as the reference')}."
                   f"{acc(C[r])} Pose and expression: {s['pose'][f'{r}_{tag}']}" for r in roles)
    clean = (" Also remove every burned-in subtitle, caption and lyric line, filling those areas with the background that "
             "would naturally be there." if project().get("clean_text") else "")
    return ("Use your image generation tool to EDIT the first attached image, a still frame from a video in which "
            + (f"the faces of {len(roles)} people have" if many else f"{C[roles[0]]['name']}'s face has") + " been blurred out on purpose. "
            + " ".join(lines) + " "
            + ("Paint a complete face inside EACH blurred area so that each one is unmistakably the matching person: never swap the two identities, "
               "never blend them, and do NOT keep or invent any other person's facial structure. " if many else
               "Paint the complete face inside the blurred area so it is unmistakably this person — do NOT invent or keep any other person's facial structure. ")
            + per + " Match each head's size, angle, perspective, lighting direction, colour, softness, motion blur and grain of image 1 so the faces blend in "
            "seamlessly. Keep everything outside the blurred areas identical to image 1: hair, costumes, background, composition, and any other "
            f"people (leave their faces untouched).{clean} {NOOIL}")


def joint_inputs(n, tag, s, C):
    roles = joint_roles(s, C, tag)
    first = ROOT / f"keys/repaint/{n}_a.png"
    has_first = tag == "b" and bool(joint_roles(s, C, "a")) and first.exists()
    got = joint_refs(roles, C, MAX_IMAGES - 1 - has_first)
    imgs = [ROOT / f"keys/masked/{n}_{tag}.png"] + [ROOT / f for r in roles for f in got[r]] + ([first] if has_first else [])
    return roles, got, has_first, imgs


SMALL = 110     # 要换的脸里最大的那张宽度 < 这个像素（1536 宽），就走裁切放大


def crop_rect(boxes):
    """两人（或一人）脸框外扩 ~3 倍的 16:9 区域，限制在画面内；脸够大就返回 None"""
    if not boxes or max(b[2] - b[0] for b in boxes) >= SMALL: return None
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes); x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    fw = max(b[2] - b[0] for b in boxes); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + 0.8 * fw
    w = max((x1 - x0) + 4 * fw, ((y1 - y0) + 5 * fw) * 16 / 9, 420); w = min(w, KEY_W); h = w * 9 / 16
    X0 = int(min(max(0, cx - w / 2), KEY_W - w)); Y0 = int(min(max(0, cy - h / 2), KEY_H - h))
    return [X0, Y0, int(X0 + w), int(Y0 + h)]


def crop_to(src_png, R, out_png):
    im = cv2.imread(str(src_png)); x0, y0, x1, y1 = R
    cv2.imwrite(str(out_png), cv2.resize(im[y0:y1, x0:x1], (KEY_W, KEY_H), interpolation=cv2.INTER_CUBIC)); return out_png


PAD = 0.75


def pad_to(src_png, out_png):
    im = cv2.imread(str(src_png)); h, w = im.shape[:2]
    bg = cv2.GaussianBlur(cv2.resize(im, (w, h)), (0, 0), 25)
    sw, sh = int(w * PAD), int(h * PAD); x0, y0 = (w - sw) // 2, (h - sh) // 2
    bg[y0:y0 + sh, x0:x0 + sw] = cv2.resize(im, (sw, sh), interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(out_png), bg); return out_png


def unpad(pad_png, out_png):
    im = cv2.imread(str(pad_png)); h, w = im.shape[:2]; sw, sh = int(w * PAD), int(h * PAD); x0, y0 = (w - sw) // 2, (h - sh) // 2
    cv2.imwrite(str(out_png), cv2.resize(im[y0:y0 + sh, x0:x0 + sw], (w, h), interpolation=cv2.INTER_CUBIC))


def uncrop(crop_png, R, out_png, base_png):
    """模型出的放大块缩回 R 的大小，贴回原帧（羽化边，四周仍是原片）"""
    x0, y0, x1, y1 = R; base = cv2.imread(str(base_png)).astype(np.float32)
    c = cv2.resize(cv2.imread(str(crop_png)), (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA).astype(np.float32)
    m = np.zeros((y1 - y0, x1 - x0), np.float32); pad = max(4, (x1 - x0) // 40); m[pad:-pad, pad:-pad] = 1; m = cv2.GaussianBlur(m, (0, 0), pad / 2)[..., None]
    base[y0:y1, x0:x1] = c * m + base[y0:y1, x0:x1] * (1 - m)
    cv2.imwrite(str(out_png), base.clip(0, 255).astype(np.uint8))


def joint_one(n, tag, s, C):
    roles, got, has_first, imgs = joint_inputs(n, tag, s, C)
    if not roles: return None
    if all((ROOT / f"keys/repaint/{n}_{tag}.{r}.ok").exists() for r in roles): return f"{n}_{tag} 已有"
    if tag == "b" and joint_roles(s, C, "a") and not (ROOT / f"keys/repaint/{n}_a.png").exists() and not DRY:
        return f"{n}_b 等首帧（首帧还没做好，尾帧要拿它当参考）"
    p = joint_prompt(n, tag, s, C, roles, got, has_first)
    if DRY: return f"--- {n}_{tag}  图：{[str(i.relative_to(ROOT)) for i in imgs]}\n{p}"
    masked = imgs[0]; base = ROOT / f"keys/src/{n}_{tag}.png"
    masked.parent.mkdir(parents=True, exist_ok=True); boxes = dict(s.get("box", {})); found = {}
    for i, r in enumerate(roles):     # 所有人的脸打在同一张图上。手标优先，没手标就用自动检测到的框
        b = mosaic(base if i == 0 else masked, masked, s.get("hint", {}).get(r), boxes.get(f"{r}_{tag}"))
        if not b: return f"{n}_{tag} ✗ {r} 没找到脸（在 shots.json 的 box 里手标 {r}_{tag}）"
        found[f"{r}_{tag}"] = b
    boxes.update(found); s = {**s, "box": boxes}
    (ROOT / f"keys/masked/{n}_{tag}.boxes.json").write_text(__import__("json").dumps(found))
    R = crop_rect([s["box"][f"{r}_{tag}"] for r in roles if f"{r}_{tag}" in s.get("box", {})])
    cimgs = imgs
    if R is None and (s.get("pad") or opt("--pad")) and any(b[0] < 24 or b[1] < 24 or b[2] > KEY_W - 24 or b[3] > KEY_H - 24
                                                            for b in [s["box"][f"{r}_{tag}"] for r in roles if f"{r}_{tag}" in s.get("box", {})]):
        R = "pad"          # 脸被画面边缘切掉：缩小放进带模糊延展边的画布，模型看到整个头就不会自己"补全构图"
        cd = ROOT / "keys/masked/crop"; cd.mkdir(parents=True, exist_ok=True)
        cimgs = [pad_to(masked, cd / f"{n}_{tag}_pad.png")] + imgs[1:-1] + ([pad_to(imgs[-1], cd / f"{n}_{tag}_first_pad.png")] if has_first else imgs[-1:])
    elif R:
        cd = ROOT / "keys/masked/crop"; cd.mkdir(parents=True, exist_ok=True)
        cimgs = [crop_to(masked, R, cd / f"{n}_{tag}.png")] + imgs[1:-1] + ([crop_to(imgs[-1], R, cd / f"{n}_{tag}_first.png")] if has_first else imgs[-1:])
    out = ROOT / f"keys/repaint/{n}_{tag}.png"; rawd = ROOT / "keys/repaint/raw"; rawd.mkdir(parents=True, exist_ok=True)
    import qa_paste
    best = None
    for k in range(int(opt("--tries", "3"))):            # 质检不过就重出
        tmp = rawd / f"{n}_{tag}.try{k}.png"; lg = ROOT / f"keys/repaint/{n}_{tag}_joint.try{k}.log"
        if R:      # 小脸远景：裁出两人那一块放大给模型，出图再缩回原位（整帧给它会被重新构图成中景）
            tc = rawd / f"{n}_{tag}.try{k}.crop.png"
            if not edit_image(cimgs, p, tc, lg): last = image_why(lg); continue
            if R == "pad": unpad(tc, tmp)
            else: uncrop(tc, R, tmp, ROOT / f"keys/src/{n}_{tag}.png")
        elif not edit_image(imgs, p, tmp, lg): last = image_why(lg); continue
        q = qa_paste.finish_frame(n, tag, s, tmp, rawd / f"{n}_{tag}.comp{k}.png")
        score = len(q["issues"]) * 1000 + sum(q.get("seam", {}).values())
        if best is None or score < best[0]: best = (score, k, q)
        if q["ok"]: break
    if best is None: return f"{n}_{tag} ✗ {last}"
    _, k, q = best
    if not q["ok"]:      # 最后留下的这版：接缝没过也要去字，再质检一次
        q = qa_paste.finish_frame(n, tag, s, rawd / f"{n}_{tag}.try{k}.png", rawd / f"{n}_{tag}.comp{k}.png", final=True)
    (rawd / f"{n}_{tag}.try{k}.png").replace(rawd / f"{n}_{tag}.png"); (rawd / f"{n}_{tag}.comp{k}.png").replace(out)
    (ROOT / f"keys/repaint/{n}_{tag}.qa.json").write_text(__import__("json").dumps(q, ensure_ascii=False, indent=1))
    for r in roles: (ROOT / f"keys/repaint/{n}_{tag}.{r}.ok").touch()
    (ROOT / f"keys/repaint/{n}_{tag}.joint.ok").touch()
    flag = ROOT / f"keys/repaint/{n}_{tag}.qa_fail"
    if q["ok"]: flag.unlink(missing_ok=True)
    else: flag.write_text("；".join(q["issues"]))
    return (f"{n}_{tag} ✓ QA 通过（第 {k + 1} 次）" if q["ok"] else f"{n}_{tag} ⚠ QA 没过，留最好的一版待人工看：{'；'.join(q['issues'])}") + \
           (f"  [{'；'.join(q['notes'])}]" if q["notes"] else "")


def clean_one(n, tag, s, C):
    """这一帧没有要换的脸、H3 又要用它：只去字幕"""
    if joint_roles(s, C, tag) or s.get("keep_orig"): return None
    if DRY: return f"--- {n}_{tag} 只去字（keys/clean）"
    import qa_paste
    return f"{n}_{tag} 去字：{qa_paste.clean_src(n, tag, s)}"


def missing(n, s, C, mode):
    if mode == "swap": return bool(s.get("swap")) and not all((ROOT / f"keys/swap/{n}_{t}.png").exists() for t in tags(s))
    return any(not (ROOT / f"keys/repaint/{n}_{k[-1]}.{k[:-2]}.ok").exists()
               for k in s.get("pose", {}) if mode == "joint" or C.get(k[:-2], {}).get("method") == "repaint")


def tags(s): return "a" if s.get("first_only") else "ab"


def shot(job):
    n, s, C, mode = job
    if mode == "swap":
        if not s.get("swap"): return
        r = [swap_one(n, "a", s, C)]
        if not s.get("first_only") and (DRY or (ROOT / f"keys/swap/{n}_a.png").exists()): r.append(swap_one(n, "b", s, C))
    elif mode == "joint":
        r = [x for x in (joint_one(n, t, s, C) for t in "ab") if x]
        if project().get("clean_text"): r += [x for x in (clean_one(n, t, s, C) for t in "ab") if x]
    else:
        r = [x for x in (repaint_one(n, t, s, C) for t in "ab") if x]
    if r: print(("\n" if DRY else "  ").join(r), flush=True)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode not in ("swap", "repaint", "joint"): sys.exit(__doc__)
    C, S, O = cast(), shots(), only()
    if mode == "joint" and not DRY:
        import qa_paste; qa_paste.model()      # 质检模型缺了，开工前就说，别等出完图
        if project().get("clean_text") and not ocr_ready(): sys.exit("clean_text 依赖 macOS Vision OCR，这台机器用不了：关掉它，或用 src_crop 把字幕裁掉")
    for d in ("keys/swap", "keys/repaint", "keys/masked"): (ROOT / d).mkdir(parents=True, exist_ok=True)
    jobs = [(n, s, C, mode) for n, s in sorted(S.items()) if not O or n in O]
    wait = 0 if DRY else float(opt("--wait", "0")) * 60; t0 = time.time()
    while True:
        with ThreadPoolExecutor(1 if DRY else int(opt("--jobs", "4"))) as ex: list(ex.map(shot, jobs))
        jobs = [j for j in jobs if missing(*j)]
        if DRY or not jobs: break
        if time.time() - t0 + 180 > wait:
            print(f"还缺 {len(jobs)} 个镜头：{','.join(j[0] for j in jobs)}" + ("（加 --wait 60 会每 3 分钟补一轮）" if not wait else "（等到时间了）")); break
        print(f"还缺 {','.join(j[0] for j in jobs)}，3 分钟后再补 {time.strftime('%H:%M')}", flush=True); time.sleep(180)
