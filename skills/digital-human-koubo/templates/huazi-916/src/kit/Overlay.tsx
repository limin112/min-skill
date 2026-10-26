// 叠加 / 结构类：弹幕、梗图反应贴纸、进度条章节、开场预告闪回、前后对比擦除、纸张拼贴。
import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, staticFile } from "remotion";
import { C, F, FONT, clamp, ease, lerp, sp, stroke, useT } from "./core";
import { NotoEmoji } from "../icons/NotoEmoji";

/** 弹幕：从右往左飘的评论，轨道自动分配；hot=true 的高亮加粗。用来「替观众说出质疑 / 起哄」。 */
export const Danmaku: React.FC<{ items: Array<{ t: string; at: number; hot?: boolean; color?: string }>; top?: number; lanes?: number; laneH?: number; speed?: number; width?: number }> = ({ items, top = 90, lanes = 5, laneH = 64, speed = 420, width = 1920 }) => {
  const { t } = useT();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {items.map((m, k) => {
        const len = m.t.length * 40 + 60; const life = (width + len) / speed;
        if (t < m.at || t > m.at + life) return null;
        const x = width - (t - m.at) * speed;
        return (
          <div key={k} style={{ position: "absolute", left: x, top: top + (k % lanes) * laneH, whiteSpace: "nowrap", fontFamily: FONT.zh, fontWeight: m.hot ? 900 : 600, fontSize: m.hot ? 46 : 38,
            color: m.color ?? (m.hot ? C.yellow : "#fff"), textShadow: stroke(3, "rgba(0,0,0,.85)"), opacity: 0.95 }}>{m.t}</div>
        );
      })}
    </AbsoluteFill>
  );
};

/** 反应贴纸：动态表情 / 原创贴纸图 + 一句吐槽，弹出 → 轻晃 → 缩回。meme 不用影视剧截图，用 Noto 表情或 AI 生成贴纸。 */
export const ReactionPop: React.FC<{ at: number; dur?: number; emoji?: string; img?: string; caption?: string; x?: number; y?: number; size?: number; rot?: number }> = ({ at, dur = 1.6, emoji, img, caption, x = 1350, y = 520, size = 300, rot = 8 }) => {
  const { f } = useT();
  if (f < F(at) - 1 || f > F(at + dur) + 6) return null;
  const p = sp(f, at, 8, 260, 0.55), out = interpolate(f, [F(at + dur) - 2, F(at + dur) + 6], [1, 0], clamp);
  const wob = Math.sin((f - F(at)) / 3.5) * 5 * Math.max(0, 1 - (f - F(at)) / 30);
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `scale(${p * out}) rotate(${rot + wob}deg)`, transformOrigin: "50% 80%", textAlign: "center", filter: "drop-shadow(0 14px 22px rgba(0,0,0,.45))" }}>
      {emoji && <NotoEmoji char={emoji} at={F(at)} size={size} cycles={2} />}
      {img && <Img src={staticFile(img)} style={{ width: size, height: size, objectFit: "contain" }} />}
      {caption && <div style={{ marginTop: -10, fontFamily: FONT.zh, fontWeight: 900, fontSize: size * 0.17, color: "#fff", background: C.ink, padding: "6px 16px", borderRadius: 12, display: "inline-block", transform: "rotate(-4deg)" }}>{caption}</div>}
    </div>
  );
};

/** 进度条章节：顶部细条 + 章节刻度，当前章节名胶囊。整片都挂着，帮观众知道「还剩多少」。 */
export const ProgressChapters: React.FC<{ chapters: Array<{ at: number; t: string }>; total: number; color?: string; y?: number; show?: boolean }> = ({ chapters, total, color = C.orange, y = 0, show = true }) => {
  const { t } = useT();
  if (!show) return null;
  const cur = [...chapters].reverse().find((c) => t >= c.at) ?? chapters[0];
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y }}>
      <div style={{ height: 8, background: "rgba(0,0,0,.35)", position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(t / total) * 100}%`, background: color }} />
        {chapters.slice(1).map((c, k) => <div key={k} style={{ position: "absolute", left: `${(c.at / total) * 100}%`, top: -3, width: 4, height: 14, background: "#fff" }} />)}
      </div>
      <div style={{ position: "absolute", left: `calc(${Math.min(88, (cur.at / total) * 100)}% + 8px)`, top: 16, fontFamily: FONT.zh, fontWeight: 700, fontSize: 24, color: "#fff", background: "rgba(16,16,20,.78)", padding: "3px 12px", borderRadius: 8 }}>{cur.t}</div>
    </div>
  );
};

/** 开场预告闪回：把后面最炸的 3–5 个瞬间各闪 0.4–0.8 秒，配「接下来」角标 + 快门音效，最后定在问题字卡上。 */
export const TeaserColdOpen: React.FC<{ clips: Array<{ src: string; offset?: number; dur?: number; label?: string; img?: boolean }>; question?: string; badge?: string }> = ({ clips, question, badge = "接下来" }) => {
  const { f } = useT();
  let acc = 0;
  const spans = clips.map((c) => { const s = acc; const d = c.dur ?? 0.6; acc += d; return { ...c, s, d }; });
  const qAt = acc;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {spans.map((c, k) => f >= F(c.s) && f < F(c.s + c.d) ? (
        <AbsoluteFill key={k}>
          <Sequence from={F(c.s)} durationInFrames={F(c.d) + 1} layout="none">
            <AbsoluteFill style={{ transform: `scale(${lerp(f, c.s, c.s + c.d, 1.08, 1.0)})` }}>
              {c.img ? <Img src={staticFile(c.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <OffthreadVideo src={staticFile(c.src)} muted startFrom={F(c.offset ?? 0)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </AbsoluteFill>
          </Sequence>
          <AbsoluteFill style={{ background: "#fff", opacity: interpolate(f - F(c.s), [0, 3], [0.6, 0], clamp) }} />
          {c.label && <div style={{ position: "absolute", left: 0, right: 0, bottom: 120, textAlign: "center", fontFamily: FONT.zh, fontWeight: 900, fontSize: 84, color: "#fff", textShadow: stroke(6, C.ink) }}>{c.label}</div>}
        </AbsoluteFill>
      ) : null)}
      {f < F(qAt) && <div style={{ position: "absolute", left: 50, top: 46, display: "flex", alignItems: "center", gap: 10, fontFamily: FONT.zh, fontWeight: 800, fontSize: 32, color: "#fff", background: C.red, padding: "6px 18px", borderRadius: 8 }}>
        <span style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", opacity: f % 20 < 12 ? 1 : 0.3 }} />{badge}</div>}
      {question && f >= F(qAt) && (
        <AbsoluteFill style={{ background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: FONT.zh, fontWeight: 900, fontSize: 104, color: "#fff", textAlign: "center", lineHeight: 1.25, padding: "0 140px", whiteSpace: "pre-line", transform: `scale(${sp(f, qAt, 10, 220)})` }}>{question}</div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

/** 前后对比擦除：左右两张图（或两段视频的定格），竖线从左扫到 split，标签 BEFORE / AFTER。 */
export const CompareWipe: React.FC<{ at: number; a: string; b: string; la?: string; lb?: string; split?: number; dur?: number; box?: { x: number; y: number; w: number; h: number } }> = ({ at, a, b, la = "之前", lb = "之后", split = 0.5, dur = 0.9, box = { x: 0, y: 0, w: 1920, h: 1080 } }) => {
  const { f } = useT();
  const s = lerp(f, at, at + dur, 0, split, ease.inOut);
  const lp = sp(f, at + dur * 0.6, 12, 200);
  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, overflow: "hidden", borderRadius: box.w < 1920 ? 20 : 0 }}>
      <Img src={staticFile(b)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(1 - s) * 100}%`, overflow: "hidden" }}>
        <Img src={staticFile(a)} style={{ position: "absolute", left: 0, top: 0, width: box.w, height: box.h, objectFit: "cover" }} />
      </div>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(1 - s) * 100}%`, width: 6, marginLeft: -3, background: "#fff", boxShadow: "0 0 20px rgba(0,0,0,.5)" }} />
      <div style={{ position: "absolute", left: 30, top: 30, opacity: lp }}><span style={{ fontFamily: FONT.zh, fontWeight: 800, fontSize: 36, color: "#fff", background: "rgba(0,0,0,.6)", padding: "6px 16px", borderRadius: 10 }}>{la}</span></div>
      <div style={{ position: "absolute", right: 30, top: 30, opacity: lp }}><span style={{ fontFamily: FONT.zh, fontWeight: 800, fontSize: 36, color: C.ink, background: C.yellow, padding: "6px 16px", borderRadius: 10 }}>{lb}</span></div>
    </div>
  );
};

/** 纸张拼贴：米色纸底 + 颗粒，照片带白边斜贴、胶带固定，手写批注。知识解说派的招牌质感。 */
export const PaperCollage: React.FC<{ at: number; items: Array<{ src: string; x: number; y: number; w: number; rot?: number; at?: number; caption?: string }>; title?: string; note?: { text: string; x: number; y: number; at?: number } }> = ({ at, items, title, note }) => {
  const { f } = useT();
  const grain = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='${Math.floor(f / 2) % 6}'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .09 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <AbsoluteFill style={{ backgroundImage: grain, opacity: 1 }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(80,60,30,.18))" }} />
      {title && <div style={{ position: "absolute", left: 110, top: 80, fontFamily: FONT.serif, fontWeight: 900, fontSize: 84, color: C.ink, opacity: sp(f, at) }}>{title}</div>}
      {items.map((it, k) => {
        const a = it.at ?? at + 0.2 + k * 0.35; const p = sp(f, a, 11, 190);
        if (f < F(a)) return null;
        return (
          <div key={k} style={{ position: "absolute", left: it.x, top: it.y, width: it.w, transform: `rotate(${it.rot ?? (k % 2 ? 4 : -5)}deg) scale(${1.25 - 0.25 * p})`, opacity: Math.min(1, p * 1.6) }}>
            <div style={{ background: "#fff", padding: 14, paddingBottom: it.caption ? 54 : 14, boxShadow: "0 18px 30px rgba(60,40,10,.28)" }}>
              <Img src={staticFile(it.src)} style={{ width: "100%", display: "block", filter: "saturate(.85) contrast(1.05)" }} />
              {it.caption && <div style={{ position: "absolute", left: 18, bottom: 14, fontFamily: FONT.zh, fontWeight: 700, fontSize: 28, color: C.ink }}>{it.caption}</div>}
            </div>
            <div style={{ position: "absolute", left: "50%", top: -18, width: 150, height: 40, marginLeft: -75, background: "rgba(240,220,150,.78)", transform: `rotate(${k % 2 ? -6 : 5}deg)`, boxShadow: "0 2px 4px rgba(0,0,0,.12)" }} />
          </div>
        );
      })}
      {note && f >= F(note.at ?? at + 1) && (
        <div style={{ position: "absolute", left: note.x, top: note.y, fontFamily: '"Kaiti SC","STKaiti",serif', fontWeight: 700, fontSize: 52, color: C.red, transform: "rotate(-6deg)", clipPath: `inset(0 ${(1 - lerp(f, note.at ?? at + 1, (note.at ?? at + 1) + 0.6, 0, 1)) * 100}% 0 0)` }}>{note.text}</div>
      )}
    </AbsoluteFill>
  );
};
