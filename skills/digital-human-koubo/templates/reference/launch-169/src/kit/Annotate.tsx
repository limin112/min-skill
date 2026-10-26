// 标注类：手绘圈 / 箭头 / 下划线（SVG 描边生长）、荧光笔、放大聚焦（屏幕录制 / 截图）、定格标注。
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import { C, F, FONT, clamp, ease, lerp, sp, stroke, useT } from "./core";

/** 手绘描边：圈（ellipse）、箭头（arrow）、下划线（underline）、打叉（cross）。x,y,w,h 是目标框（像素）。 */
export const HandDraw: React.FC<{ kind: "circle" | "arrow" | "underline" | "cross"; at: number; x: number; y: number; w: number; h: number; color?: string; width?: number; dur?: number; from?: [number, number] }> = ({ kind, at, x, y, w, h, color = C.red, width = 9, dur = 0.45, from }) => {
  const { f } = useT();
  if (f < F(at)) return null;
  const p = lerp(f, at, at + dur, 0, 1, ease.inOut);
  const jitter = (k: number) => Math.sin(k * 12.9898) * 0.03;
  let d = "";
  if (kind === "circle") {
    // 不闭合的手绘椭圆：起点偏一点、多绕 1.08 圈
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2 + 14, ry = h / 2 + 12;
    const pts = Array.from({ length: 60 }, (_, i) => { const a = -2.2 + (i / 59) * Math.PI * 2 * 1.08; const r = 1 + jitter(i) ; return `${(cx + Math.cos(a) * rx * r).toFixed(1)},${(cy + Math.sin(a) * ry * r).toFixed(1)}`; });
    d = "M" + pts.join(" L");
  } else if (kind === "underline") {
    d = `M${x - 6},${y + h + 8} Q${x + w * 0.5},${y + h + 18} ${x + w + 8},${y + h + 4}`;
  } else if (kind === "cross") {
    d = `M${x},${y} L${x + w},${y + h} M${x + w},${y} L${x},${y + h}`;
  } else {
    const [sx, sy] = from ?? [x + w + 180, y - 140];
    const ex = x + w / 2, ey = y + h / 2;
    const mx = (sx + ex) / 2 + (sy - ey) * 0.25, my = (sy + ey) / 2 - (sx - ex) * 0.1;
    const ang = Math.atan2(ey - my, ex - mx), L = 34;
    d = `M${sx},${sy} Q${mx},${my} ${ex},${ey} M${ex - Math.cos(ang - 0.5) * L},${ey - Math.sin(ang - 0.5) * L} L${ex},${ey} L${ex - Math.cos(ang + 0.5) * L},${ey - Math.sin(ang + 0.5) * L}`;
  }
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,.35))" }} />
      </svg>
    </AbsoluteFill>
  );
};

/** 荧光笔：在一段文字下面从左往右刷黄（文字本身由调用方排版，这个只画底色条） */
export const Highlight: React.FC<{ at: number; dur?: number; color?: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, dur = 0.4, color = C.hl, children, style }) => {
  const { f } = useT();
  const p = lerp(f, at, at + dur, 0, 1, ease.inOut);
  return (
    <span style={{ position: "relative", display: "inline-block", ...style }}>
      <span style={{ position: "absolute", left: -4, right: -4, top: "18%", bottom: "6%", background: color, transformOrigin: "0 50%", transform: `scaleX(${p}) skewX(-8deg)`, borderRadius: 4, zIndex: 0 }} />
      <span style={{ position: "relative", zIndex: 1 }}>{children}</span>
    </span>
  );
};

/** 放大聚焦：一张截图 / 一帧录屏，镜头推到 focus 框，四周压暗 + 圆角高亮框 + 可选标签。 */
export const ZoomFocus: React.FC<{ src: string; at: number; until: number; focus: { x: number; y: number; w: number; h: number }; iw: number; ih: number; label?: string; zoom?: number; box?: { x: number; y: number; w: number; h: number } }> = ({ src, at, until, focus, iw, ih, label, zoom = 2.2, box = { x: 0, y: 0, w: 1920, h: 1080 } }) => {
  const { f } = useT();
  const k = lerp(f, at, at + 0.7, 0, 1, ease.inOut) - lerp(f, until - 0.5, until, 0, 1, ease.inOut);
  const base = Math.min(box.w / iw, box.h / ih);              // 整图放进框的缩放
  const S = base * (1 + (zoom - 1) * k);                      // 当前缩放
  const ux = focus.x + focus.w / 2, uy = focus.y + focus.h / 2; // 焦点（原图坐标）
  const ox0 = (box.w - iw * base) / 2, oy0 = (box.h - ih * base) / 2;                 // 起始：整图居中
  const S1 = base * zoom, cl = (v: number, lo: number) => Math.min(0, Math.max(lo, v));
  const ox1 = cl(box.w / 2 - ux * S1, box.w - iw * S1), oy1 = cl(box.h / 2 - uy * S1, box.h - ih * S1);   // 结束：焦点尽量居中，但画面不越过原图边缘
  const ox = ox0 + (ox1 - ox0) * k, oy = oy0 + (oy1 - oy0) * k;
  const fw = focus.w * S, fh = focus.h * S, fx = ox + focus.x * S, fy = oy + focus.y * S;
  const ring = sp(f, at + 0.6, 12, 200);
  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, overflow: "hidden", borderRadius: 18, background: "#111" }}>
      <Img src={staticFile(src)} style={{ position: "absolute", left: ox, top: oy, width: iw * S, height: ih * S }} />
      <div style={{ position: "absolute", left: fx - 12, top: fy - 12, width: fw + 24, height: fh + 24, borderRadius: 16, border: `5px solid ${C.yellow}`,
        boxShadow: `0 0 0 4000px rgba(0,0,0,${0.5 * k})`, opacity: k * Math.min(1, ring * 1.4), transform: `scale(${1.15 - 0.15 * ring})` }} />
      {label && k > 0.5 && <div style={{ position: "absolute", left: fx + fw / 2 - 400, width: 800, top: fy + fh + 30, textAlign: "center", opacity: ring }}>
        <span style={{ fontFamily: FONT.zh, fontWeight: 800, fontSize: 40, color: C.ink, background: C.yellow, padding: "8px 22px", borderRadius: 12 }}>{label}</span></div>}
    </div>
  );
};

/** 定格标注：画面定住（调用方在 at 处放一张定格图）+ 闪白 + 去色 + 标签「等等」+ 圈注。 */
export const FreezeFrame: React.FC<{ src: string; at: number; until: number; label?: string; note?: string; mark?: { x: number; y: number; w: number; h: number } }> = ({ src, at, until, label = "等等！", note, mark }) => {
  const { f } = useT();
  if (f < F(at) || f > F(until)) return null;
  const flash = interpolate(f, [F(at), F(at) + 4], [0.9, 0], clamp);
  const z = lerp(f, at, until, 1.0, 1.06, ease.out);
  const lp = sp(f, at + 0.12, 9, 240);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${z})`, filter: "saturate(.35) contrast(1.1)" }}><Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.55))" }} />
      <div style={{ position: "absolute", left: 80, top: 80, transform: `rotate(-4deg) scale(${lp})`, transformOrigin: "0 0", fontFamily: FONT.zh, fontWeight: 900, fontSize: 110, color: C.yellow, textShadow: stroke(7, C.ink) }}>{label}</div>
      {note && <div style={{ position: "absolute", left: 90, top: 230, opacity: sp(f, at + 0.4), fontFamily: FONT.zh, fontWeight: 700, fontSize: 48, color: "#fff", textShadow: stroke(4, C.ink) }}>{note}</div>}
      {mark && <HandDraw kind="circle" at={at + 0.3} {...mark} color={C.yellow} />}
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
};
