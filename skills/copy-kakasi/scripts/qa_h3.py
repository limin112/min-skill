"""H3 出片质检：中间有没有凭空多出人、有没有跳成别的场景（首尾帧钉住了，但中间 H3 会自己编）。

  python3 qa_h3.py [--only 02,03]      → 打印每段结论，写 gen/NN.qa.json（确认页和 finish.py cut 会读）
判定：
  多人：抽 16 帧，某帧检测到的脸数 > 首尾帧里较多的那个，且至少 2 帧这样 → 失败
  跳场景：脸宽、饱和色占比、亮度相对首尾突变 → 失败
  陌生人：中间帧的大脸和首尾帧所有脸的相似度都很低，至少 2 帧 → 失败
  自编字幕：下半部分读得出字（只有 macOS 能查）→ 失败
阈值来自实测样片，不是普适值；误报、漏报都可能有，以人眼为准。
"""
import json, sys
from pathlib import Path
import cv2
import numpy as np
from common import ROOT, face_model, shots, only, edl, nn
import qa_paste

SCALE = 1.7     # 中间帧脸宽中位数 / 首尾脸宽：跳成近景时约 3 倍，正常推拉 ≤1.15
SAT = 0.25      # 饱和色像素占比上升：背景被换时约 0.5，正常镜头起伏 <0.1


BRIGHT = 45     # 中间帧平均亮度离首尾都差这么多（至少 2 帧）：换场景、插进陌生人时 80 以上，正常 ≤28
STRANGER = 0.2  # SFace 余弦相似度：中间帧里 ≥80px 的脸和首尾帧所有脸都低于这个（至少 2 帧）= 凭空换了个人；此时约 0.10–0.17，正常 ≥0.22
_REC = _DET = None


def face_feats(f, minw=0):
    global _REC, _DET
    if _REC is None:
        _DET = cv2.FaceDetectorYN.create(str(qa_paste.model()), "", (1536, 864), 0.7, 0.3, 50)
        _REC = cv2.FaceRecognizerSF.create(str(face_model("face_recognition_sface_2021dec.onnx")), "")
    f = cv2.resize(f, (1536, 864)); _, d = _DET.detect(f)
    return [_REC.feature(_REC.alignCrop(f, r)).flatten() for r in (d if d is not None else []) if r[2] >= minw]


def cos(a, b): return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


def sat_frac(f):
    hsv = cv2.cvtColor(cv2.resize(f, (256, 144)), cv2.COLOR_BGR2HSV)
    return float(((hsv[..., 1] > 70) & (hsv[..., 2] > 50)).mean())


def hist(f):
    h = cv2.calcHist([cv2.cvtColor(cv2.resize(f, (256, 144)), cv2.COLOR_BGR2HSV)], [0, 1], None, [24, 16], [0, 180, 0, 256])
    return cv2.normalize(h, h).flatten()


def nfaces(f):
    return len(qa_paste.faces(cv2.resize(f, (1536, 864)), 0.7))


def check(n):
    p = ROOT / f"gen/{n}.mp4"
    cap = cv2.VideoCapture(str(p)); N = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); fr = []
    s = shots().get(n, {})
    if s.get("take") == "head" or s.get("first_only"):      # 成片只取前 N 帧：只检查这一段（后面 H3 自己编的不会进成片）
        N = min(N, next(e["frames"] for e in edl() if nn(e) == n) + 2)
    for i in np.linspace(0, N - 1, min(16, N)).astype(int):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(i)); ok, f = cap.read()
        if ok: fr.append(f)
    if len(fr) < 4: return {"n": n, "ok": False, "issues": ["读不出视频"]}
    # 只数"大脸"：≥ 首尾帧里最大那张脸的 45%（背景里冒出来的小脸不算）
    FW = [[b[2] - b[0] for b in qa_paste.faces(cv2.resize(f, (1536, 864)), 0.7)] for f in fr]
    thr = max(40, 0.45 * max(FW[0] + FW[-1], default=0))
    cnt = [sum(w >= thr for w in x) for x in FW]
    # 基准人数 = 首尾两帧合起来有几个不同的人（首帧背对、尾帧转过来的人也算上）
    fa, fb = face_feats(fr[0]), face_feats(fr[-1])
    base = max(cnt[0], cnt[-1], len(fa) + sum(1 for x in fb if max([cos(x, y) for y in fa], default=-1) < 0.3))
    extra = [i for i, c in enumerate(cnt[1:-1], 1) if c > base]
    W = [max([b[2] - b[0] for b in qa_paste.faces(cv2.resize(f, (1536, 864)), 0.7)], default=0) for f in fr]
    S = [sat_frac(f) for f in fr]
    issues = []
    if len(extra) >= 2: issues.append(f"中间凭空多了人（首尾 {base} 张脸，中间最多 {max(cnt)} 张，{len(extra)}/14 帧）")
    ends_w = max(W[0], W[-1]); mid_w = sorted(W[1:-1])[len(W[1:-1]) // 2]
    if ends_w > 0 and mid_w > SCALE * ends_w: issues.append(f"中间镜头推成了近景（脸宽 {ends_w}→{mid_w}px）")
    dsat = max(S[1:-1]) - max(S[0], S[-1])
    if dsat > SAT: issues.append(f"中间画面变色（饱和色占比 {max(S[0], S[-1]):.2f}→{max(S[1:-1]):.2f}，背景屏多半换了）")
    V = [float(cv2.cvtColor(cv2.resize(f, (128, 72)), cv2.COLOR_BGR2GRAY).mean()) for f in fr]
    dev = [min(abs(v - V[0]), abs(v - V[-1])) for v in V[1:-1]]
    if sum(d > BRIGHT for d in dev) >= 2: issues.append(f"中间画面明暗突变（亮度 {V[0]:.0f}/{V[-1]:.0f} → 中间偏离最多 {max(dev):.0f}，背景或场景换了）")
    ref = face_feats(fr[0]) + face_feats(fr[-1]); strange = 0; low = 1.0
    for f in fr[1:-1]:
        sims = [max([cos(x, r) for r in ref], default=-1) for x in face_feats(f, 80)]
        if sims and min(sims) < STRANGER: strange += 1
        if sims: low = min(low, min(sims))
    if ref and strange >= 2: issues.append(f"中间出现了首尾帧里没有的人（{strange} 帧，最低相似度 {low:.2f}）")
    # H3 会自己编字幕（学了原片的字幕条）：抽 6 帧 OCR 下半部分，读出 ≥2 字、框够大的就算
    txt = []
    for f in fr[1:-1:max(1, (len(fr) - 2) // 6)]:
        sm = cv2.resize(f, (1536, 864))
        for b in qa_paste.full_text(sm, zoned=False):
            if b[1] > 430 and (b[2] - b[0]) * (b[3] - b[1]) > 2500: txt.append(b)
    if txt: issues.append(f"画面里冒出了字幕/文字（{len(txt)} 处，H3 自己编的）")
    r = {"n": n, "ok": not issues, "issues": issues, "faces": cnt, "face_w": W, "sat": [round(x, 2) for x in S], "bright": [round(v) for v in V], "min_sim": round(low, 2)}
    (ROOT / f"gen/{n}.qa.json").write_text(json.dumps(r, ensure_ascii=False))
    return r


if __name__ == "__main__":
    O = only()
    for e in edl():
        n = nn(e)
        if (O and n not in O) or not (ROOT / f"gen/{n}.mp4").exists(): continue
        r = check(n); print(f"{n} {'✓' if r['ok'] else '✗ ' + '；'.join(r['issues'])}  脸数{r.get('faces')}", flush=True)
