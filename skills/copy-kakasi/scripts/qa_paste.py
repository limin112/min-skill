"""joint 模式出图后的贴回 + 质检（faces.py joint 自动调用；也可单独跑：python3 qa_paste.py [--only 05,40]）。

为什么要贴回：图像模型可能重画整张图——手臂没了、别人也被换成主角的脸、甚至多出一个人。
所以只取"头"那一块（按 box 放大、羽化），其余全部用原片像素。
质检（QA）：
  1. 模型原图里的人脸数 > 原帧 → 记"多人"（贴回后已被挡掉，但记下来）
  2. 成片每个要换的位置必须正好检测到 1 张脸（没画出来 / 崩了 / 画成两张都算失败）
  3. 成片整帧人脸数不能比原帧多
  4. 打码马赛克残留：脸区域里块状纹理过强 → 失败
  5. project.json 开了 clean_text 时：字幕区还读得出字 → 失败
失败的帧由 faces.py 重出（默认最多 3 次），还不行就标 qa_fail：确认页会显示，h3_fl.py 默认不把它送去生成。

clean_text 只处理字幕：只看 subtitle_zone 范围（默认画面下方），不处理台标和水印。需要 macOS Vision。
"""
import json, subprocess, sys
from pathlib import Path
import cv2
import numpy as np
from common import KEY_H, KEY_W, ROOT, SKILL, face_model, ocr_ready, project, shots, only

_DET = None
SUB_ZONE = [0, 600, KEY_W, KEY_H]     # 默认字幕区：画面下方（1536×864 坐标）


def model(): return face_model("face_detection_yunet_2023mar.onnx")
def zone(): return project().get("subtitle_zone", SUB_ZONE)


def in_zone(b):
    z = zone(); cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    return z[0] <= cx <= z[2] and z[1] <= cy <= z[3]


def swift(script, path):
    """跑 macOS Vision OCR；别的系统返回空"""
    if not ocr_ready(): return ""
    return subprocess.run(["swift", str(SKILL / "scripts" / script), str(path)], capture_output=True, text=True).stdout


def with_detected(n, tag, s):
    """把 faces.py 自动检测到的打码框合进镜头配置（手标的优先）"""
    p = ROOT / f"keys/masked/{n}_{tag}.boxes.json"
    return {**s, "box": {**(json.loads(p.read_text()) if p.exists() else {}), **s.get("box", {})}}


def faces(img, thr=0.6):
    global _DET
    if _DET is None: _DET = cv2.FaceDetectorYN.create(str(model()), "", (img.shape[1], img.shape[0]), thr, 0.3, 50)
    _DET.setInputSize((img.shape[1], img.shape[0])); _, f = _DET.detect(img)
    return [] if f is None else [(float(r[0]), float(r[1]), float(r[0] + r[2]), float(r[1] + r[3]), float(r[-1])) for r in f if r[2] >= 24]


def text_boxes(src_png):
    """Vision OCR 找字幕区里的字（缓存到 qc/ocr/）"""
    cache = ROOT / "qc/ocr" / (Path(src_png).stem + ".json")
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        out = swift("ocr_boxes.swift", src_png)
        cache.write_text(out.strip().splitlines()[-1] if out.strip() else '{"boxes":[]}')
    bs = []
    for x0, y0, x1, y1, t in json.loads(cache.read_text())["boxes"]:
        if in_zone((x0, y0, x1, y1)): bs.append([max(0, x0 - 10), max(0, y0 - 8), min(KEY_W, x1 + 10), min(KEY_H, y1 + 8)])
    return bs + ko_boxes(cv2.imread(str(src_png)))   # 韩文单独再认一遍


def head_mask(shape, box, kx=2.0, ky=2.2, up=0.12):
    """整个头（脸 + 头发 + 脖子）用模型图的：模型会把头的大小、位置改一点，只贴一小块脸会在下巴、发际线出接缝；
    接缝落在头发和背景上就不明显"""
    x0, y0, x1, y1 = box; w, h = x1 - x0, y1 - y0
    m = np.zeros(shape[:2], np.float32)
    cv2.ellipse(m, (int((x0 + x1) / 2), int((y0 + y1) / 2 - up * h)), (int(0.5 * w * kx), int(0.5 * h * ky)), 0, 0, 360, 1, -1)
    return cv2.GaussianBlur(m, (0, 0), max(3, 0.16 * w))


_LM = None
def landmark_M(src, raw, box):
    """同一个角色：原帧里的脸和模型图里的脸各取 5 个关键点（双眼、鼻尖、两嘴角），求相似变换（缩放 0.7–1.45 以内才用）"""
    global _LM
    if _LM is None: _LM = cv2.FaceDetectorYN.create(str(model()), "", (KEY_W, KEY_H), 0.5, 0.3, 50)
    def pick(img):
        _LM.setInputSize((img.shape[1], img.shape[0])); _, f = _LM.detect(img)
        if f is None: return None
        cx, cy, w = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2, box[2] - box[0]
        c = [(np.hypot(r[0] + r[2] / 2 - cx, r[1] + r[3] / 2 - cy), r) for r in f]
        c = [x for x in c if x[0] < 0.9 * w]
        return min(c, key=lambda x: x[0])[1][4:14].reshape(5, 2).astype(np.float32) if c else None
    a, b = pick(src), pick(raw)
    if a is None or b is None: return None
    M, _ = cv2.estimateAffinePartial2D(b, a)
    if M is None: return None
    sc = float(np.sqrt(abs(np.linalg.det(M[:, :2]))))
    return M.astype(np.float32) if 0.7 < sc < 1.45 else None


def local_shift(src, raw, box):
    """模型出图会整体挪几个像素：在脸周围（2.4 倍框）用相位相关估计偏移，贴回前先对齐"""
    x0, y0, x1, y1 = box; w, h = x1 - x0, y1 - y0; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    X0, X1 = int(max(0, cx - 1.2 * w)), int(min(src.shape[1], cx + 1.2 * w)); Y0, Y1 = int(max(0, cy - 1.2 * h)), int(min(src.shape[0], cy + 1.2 * h))
    a = cv2.cvtColor(src[Y0:Y1, X0:X1], cv2.COLOR_BGR2GRAY).astype(np.float32); b = cv2.cvtColor(raw[Y0:Y1, X0:X1], cv2.COLOR_BGR2GRAY).astype(np.float32)
    if min(a.shape) < 16: return 0.0, 0.0, 0.0
    (dx, dy), r = cv2.phaseCorrelate(a, b, cv2.createHanningWindow(a.shape[::-1], cv2.CV_32F))
    return (dx, dy, r) if r > 0.12 and abs(dx) < 25 and abs(dy) < 25 else (0.0, 0.0, r)


def mosaic_left(img, box):
    """马赛克残留：脸区域里 7 像素网格的块边缘能量 / 整体梯度能量"""
    x0, y0, x1, y1 = [int(v) for v in box]; g = cv2.cvtColor(img[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY).astype(np.float32)
    if g.size < 400: return 0.0
    gx = np.abs(np.diff(g, axis=1)); bw = max(1, (x1 - x0) // 7)
    cols = gx[:, bw - 1::bw].mean() if gx.shape[1] > bw else 0
    return float(cols / (gx.mean() + 1e-6))


def iou_center_in(f, box):
    cx, cy = (f[0] + f[2]) / 2, (f[1] + f[3]) / 2
    return box[0] <= cx <= box[2] and box[1] <= cy <= box[3]


SEAM_MAX = 55      # 头部过渡带里模型图和原片的平均差；明显的光晕在 60 以上，45–50 肉眼基本看不出


def paste(n, tag, s, raw_png, out_png):
    """模型整张图 → 只把每个角色的头贴回原帧；返回 (成片, 信息)"""
    src = cv2.imread(str(ROOT / f"keys/src/{n}_{tag}.png")); raw = cv2.imread(str(raw_png))
    if raw.shape != src.shape: raw = cv2.resize(raw, (src.shape[1], src.shape[0]), interpolation=cv2.INTER_LANCZOS4)
    roles = [k[:-2] for k in s.get("pose", {}) if k.endswith("_" + tag)]
    comp = src.astype(np.float32); info = {"shift": {}, "seam": {}}
    for r in roles:
        box = s["box"][f"{r}_{tag}"]; m = head_mask(src.shape, box); band = (m > 0.15) & (m < 0.85)
        cands = []
        dx, dy, resp = local_shift(src, raw, box); cands.append(("平移", np.float32([[1, 0, -dx], [0, 1, -dy]])))
        L = landmark_M(src, raw, box)                   # 模型把头放大/缩小了：用五官关键点做相似变换对齐
        if L is not None: cands.append(("关键点", L))
        best = None
        for how, M in cands:
            al = cv2.warpAffine(raw, M, (raw.shape[1], raw.shape[0]), borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
            valid = cv2.warpAffine(np.ones(src.shape[:2], np.float32), M, (raw.shape[1], raw.shape[0]), borderValue=0)   # 变换后从画外拉进来的像素不用
            mm = m * cv2.erode(valid, np.ones((9, 9), np.uint8))
            d = cv2.GaussianBlur(np.abs(al - src.astype(np.float32)).mean(2), (0, 0), 2)
            seam = float(d[band].mean()) if band.any() else 0.0
            if best is None or seam < best[0]: best = (seam, how, al, mm, M)
        seam, how, al, mm, M = best
        comp = al * mm[..., None] + comp * (1 - mm[..., None])
        info["seam"][r] = round(seam, 1); info["shift"][r] = [round(float(-M[0, 2]), 1), round(float(-M[1, 2]), 1), how]
    comp = comp.clip(0, 255).astype(np.uint8)
    cv2.imwrite(str(out_png), comp)
    return comp, raw, roles, info


DETEXT = ("Edit image1: remove every burned-in subtitle, caption and lyric line "
          "and fill each spot with the background, clothing or body that would naturally be behind it. Change nothing "
          "else: keep the same people, faces, glasses, hair, poses, hands, clothing, lighting, colours and framing exactly as in image1.")


def detext(n, tag, img_png, out_png, tries=3):
    """去字幕：模型整张去字 → 每个字框局部对齐后只贴字框那一块 → Vision 复查；还有字就再来一次，最后兜底本地擦"""
    from common import edit_image
    img = cv2.imread(str(img_png)); boxes = text_boxes(ROOT / f"keys/src/{n}_{tag}.png")
    if not boxes: cv2.imwrite(str(out_png), img); return {"text": "无字"}
    work = img.copy(); left = boxes; note = []
    for k in range(tries):
        tmp = ROOT / f"keys/repaint/raw/{n}_{tag}.detext{k}.png"
        if not edit_image([img_png], DETEXT, tmp, ROOT / f"keys/repaint/raw/{n}_{tag}.detext{k}.log"): note.append("模型去字失败"); break
        clean = cv2.imread(str(tmp))
        if clean.shape != img.shape: clean = cv2.resize(clean, (img.shape[1], img.shape[0]))
        nxt = []
        for x0, y0, x1, y1 in left:
            pb = [max(0, x0 - 30), max(0, y0 - 30), min(img.shape[1], x1 + 30), min(img.shape[0], y1 + 30)]
            dx, dy, _ = local_shift(img, clean, pb)
            al = cv2.warpAffine(clean, np.float32([[1, 0, -dx], [0, 1, -dy]]), (img.shape[1], img.shape[0]), borderMode=cv2.BORDER_REPLICATE)
            mm = np.zeros(img.shape[:2], np.float32); cv2.rectangle(mm, (x0 - 4, y0 - 4), (x1 + 4, y1 + 4), 1, -1); mm = cv2.GaussianBlur(mm, (0, 0), 4)[..., None]
            work = (al.astype(np.float32) * mm + work.astype(np.float32) * (1 - mm)).clip(0, 255).astype(np.uint8)
            if text_boxes_in(work, [x0, y0, x1, y1]): nxt.append([x0, y0, x1, y1])
        left = nxt + [b for b in full_text(work) if not any(overlap(b, c) for c in nxt)]   # 第一次没读出来的字再找一遍，一起处理
        if not left: break
        cv2.imwrite(str(ROOT / f"keys/repaint/raw/{n}_{tag}.detext_work.png"), work); img_png = ROOT / f"keys/repaint/raw/{n}_{tag}.detext_work.png"
    if left:     # 两次都没去干净：本地擦（很少走到）
        tm = np.zeros(img.shape[:2], np.uint8)
        for x0, y0, x1, y1 in left: cv2.rectangle(tm, (x0, y0), (x1, y1), 255, -1)
        work = cv2.inpaint(work, cv2.dilate(tm, np.ones((5, 5), np.uint8)), 9, cv2.INPAINT_TELEA); note.append(f"{len(left)} 处本地擦")
    cv2.imwrite(str(out_png), work)
    return {"text": "模型去字" + ("；" + "；".join(note) if note else "")}


def ko_boxes(img):
    """韩文专用：字幕区裁出来放大 2 倍、只认韩文——混合语言模型常把小字漏掉或认成乱码"""
    if not ocr_ready(): return []
    x0, y0, x1, y1 = [int(v) for v in zone()]; crop = cv2.resize(img[y0:y1, x0:x1], None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    p = ROOT / "qc/ocr/_ko.png"; p.parent.mkdir(parents=True, exist_ok=True); cv2.imwrite(str(p), crop)
    try: bs = json.loads(swift("ocr_ko.swift", p).strip().splitlines()[-1])["boxes"]
    except Exception: return []
    return [[x0 + b[0] // 2 - 10, y0 + b[1] // 2 - 8, x0 + b[2] // 2 + 10, y0 + b[3] // 2 + 8] for b in bs if any("가" <= c <= "힣" for c in str(b[4]))]


def full_text(img, zoned=True):
    """OCR：返回还读得出字的框（放大一点），至少 2 个字符才算。zoned=False 看整帧（查 H3 自己编的字）"""
    if not ocr_ready(): return []
    p = ROOT / "qc/ocr/_full.png"; p.parent.mkdir(parents=True, exist_ok=True); cv2.imwrite(str(p), img)
    try: bs = json.loads(swift("ocr_boxes.swift", p).strip().splitlines()[-1])["boxes"]
    except Exception: return []
    H, W = img.shape[:2]
    return [[max(0, b[0] - 10), max(0, b[1] - 8), min(W, b[2] + 10), min(H, b[3] + 8)] for b in bs if len(str(b[4]).strip()) >= 2 and (not zoned or in_zone(b))] + ko_boxes(img)


def overlap(a, b):
    return not (a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1])


def text_boxes_in(img, box):
    """这一块还有没有字（Vision 再读一次）"""
    x0, y0, x1, y1 = box; crop = img[max(0, y0):y1, max(0, x0):x1]
    if crop.size == 0: return False
    p = ROOT / "qc/ocr/_crop.png"; cv2.imwrite(str(p), crop)
    try: return bool(json.loads(swift("ocr_boxes.swift", p).strip().splitlines()[-1])["boxes"])
    except Exception: return False


def qa(n, tag, s, src, raw, comp, roles, info):
    fs, fr, fc = faces(src), faces(raw), faces(comp)
    issues, notes = [], []
    if len(fr) > len(fs): notes.append(f"模型原图多了 {len(fr) - len(fs)} 张脸（贴回后已挡掉）")
    hidden = sum(1 for r in roles if not any(iou_center_in(f, s["box"][f"{r}_{tag}"]) for f in fs))   # 手标的脸（原帧侧脸/低头检测不到）也算原帧里有
    if len(fc) > len(fs) + hidden: issues.append(f"成片比原帧多 {len(fc) - len(fs) - hidden} 张脸")
    for r in roles:
        box = s["box"][f"{r}_{tag}"]
        src_has = any(iou_center_in(f, box) for f in fs); got = [f for f in fc if iou_center_in(f, box)]
        if src_has and not got: issues.append(f"{r} 的位置没检测到脸（没画出来或崩了）")
        if len(got) > 1: issues.append(f"{r} 的位置检测到 {len(got)} 张脸")
        mz = mosaic_left(comp, box)
        if mz > 2.2: issues.append(f"{r} 的位置还有马赛克残留（{mz:.1f}）")
        if info.get("seam", {}).get(r, 0) > SEAM_MAX: issues.append(f"{r} 头部接缝 {info['seam'][r]}（>{SEAM_MAX}，会看出光晕）")
        sh = info["shift"].get(r, [0, 0, ""])
        if abs(sh[0]) > 12 or abs(sh[1]) > 12 or sh[2] == "关键点": notes.append(f"{r} 模型挪了/缩放了头（{sh[2]}对齐）")
    if project().get("clean_text"):
        left = [b for b in text_boxes(ROOT / f"keys/src/{n}_{tag}.png") if text_boxes_in(comp, b)]
        if left: issues.append(f"还有 {len(left)} 处字幕没去掉")
        rest = full_text(comp)      # 字幕区再读一遍（含韩文专用识别）：第一次没检测到的字也要抓出来
        if rest and not left: issues.append(f"字幕区复查还有 {len(rest)} 处字")
    res = dict(n=n, tag=tag, ok=not issues, issues=issues, notes=notes, faces=dict(src=len(fs), raw=len(fr), comp=len(fc)), **info)
    (ROOT / f"keys/repaint/{n}_{tag}.qa.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
    return res


def finish_frame(n, tag, s, raw_png, out_png, final=False):
    """faces.joint 出图成功后调：贴回头部 → 去字 → 质检。返回 qa 结果"""
    s = with_detected(n, tag, s)
    comp, raw, roles, info = paste(n, tag, s, raw_png, out_png)
    if s.get("box") and any(info["seam"].get(r, 0) > SEAM_MAX for r in roles) and not final:   # 接缝不过关：先不花时间去字，让上层换种子
        return qa(n, tag, s, cv2.imread(str(ROOT / f"keys/src/{n}_{tag}.png")), raw, comp, roles, info)
    if project().get("clean_text"): info.update(detext(n, tag, out_png, out_png))
    return qa(n, tag, s, cv2.imread(str(ROOT / f"keys/src/{n}_{tag}.png")), raw, cv2.imread(str(out_png)), roles, info)


def clean_src(n, tag, s):
    """没有要换的脸、但 H3 要用的原帧：只去字幕 → keys/clean/NN_t.png"""
    out = ROOT / f"keys/clean/{n}_{tag}.png"; out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists(): return "已有"
    (ROOT / "keys/repaint/raw").mkdir(parents=True, exist_ok=True)
    r = detext(n, tag, ROOT / f"keys/src/{n}_{tag}.png", out)
    return r["text"]


if __name__ == "__main__":
    S, O = shots(), only()
    for n, s in sorted(S.items()):
        if O and n not in O: continue
        for tag in "ab":
            raw = ROOT / f"keys/repaint/raw/{n}_{tag}.png"; out = ROOT / f"keys/repaint/{n}_{tag}.png"
            if not raw.exists() and out.exists():
                raw.parent.mkdir(parents=True, exist_ok=True); out.rename(raw)
            if raw.exists():
                r = finish_frame(n, tag, s, raw, out)
                print(f"{n}_{tag} {'✓' if r['ok'] else '✗'} {'；'.join(r['issues'] + r['notes'])} 脸数 原{r['faces']['src']}/模型{r['faces']['raw']}/成片{r['faces']['comp']} {r.get('text', '')}", flush=True)
