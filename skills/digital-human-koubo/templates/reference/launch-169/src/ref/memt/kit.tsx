// MemT 1.0 宣传片的共用：配色、字体、旁白时间、背景、玻璃窗、动态字。
import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { clamp01, E, mix, seg } from "../cinematic/motion";
import vo from "../vo.json";

export const FPS = 30;
export const C = {
  bg: "#03050D",
  ink: "#EEF2FF",
  mute: "rgba(226,232,255,0.62)",
  faint: "rgba(226,232,255,0.14)",
  cyan: "#27B9F3",
  blue: "#3D6BF5",
  violet: "#6A3BF0",
  red: "#FF5B62",
  green: "#3EDC9B",
};
export const GRAD = `linear-gradient(95deg, ${C.cyan} 0%, ${C.blue} 52%, ${C.violet} 100%)`;
export const CN = '"PingFang SC", "SF Pro Display", -apple-system, sans-serif';
export const EN = '"SF Pro Display", "PingFang SC", -apple-system, sans-serif';
export const MONO = '"SF Mono", Menlo, Monaco, monospace';

// ── 旁白时间（vo.json 来自 narrate_mimo.py；vo.wav 从第 0 帧开始播） ──
export type BeatId = keyof typeof vo;
export const T = (id: BeatId) => Math.round(vo[id].start * FPS);
export const TE = (id: BeatId) => Math.round(vo[id].end * FPS);
export const Wd = (id: BeatId, w: string) => {
  const i = vo[id].text.indexOf(w);
  if (i < 0) throw new Error(`旁白 ${id} 里找不到「${w}」`);
  return Math.round(vo[id].chars[i] * FPS);
};
export const SPEECH: [number, number][] = (Object.keys(vo) as BeatId[]).map((k) => [vo[k].start * FPS, vo[k].end * FPS]);

/** 0→1 入场（expo out）。 */
export const ap = (f: number, at: number, dur = 12) => seg(f, at, dur);
/** 1→0 离场。 */
export const out = (f: number, at: number, dur = 10) => 1 - seg(f, at, dur, E.in2);

export const GradText: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{ background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", ...style }}>{children}</span>
);

/** 深色底：径向光 + 点阵 + 一团缓慢漂移的品牌色光。 */
export const Backdrop: React.FC<{ f: number; glow?: number; gx?: number; gy?: number }> = ({ f, glow = 1, gx = 960, gy = 540 }) => (
  <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(900px 620px at ${gx + Math.sin(f / 90) * 60}px ${gy + Math.cos(f / 110) * 40}px, rgba(61,107,245,${0.2 * glow}), transparent 70%), radial-gradient(700px 500px at ${gx + 380}px ${gy + 260}px, rgba(106,59,240,${0.12 * glow}), transparent 70%)`,
      }}
    />
    <AbsoluteFill
      style={{
        backgroundImage: "radial-gradient(rgba(200,215,255,0.09) 1.2px, transparent 1.4px)",
        backgroundSize: "36px 36px",
        maskImage: "radial-gradient(1100px 700px at 50% 50%, black 30%, transparent 85%)",
      }}
    />
  </AbsoluteFill>
);

/** 逐字升起的标题；parts 里 accent 的字用品牌渐变。 */
export const Rise: React.FC<{ f: number; at: number; parts: { t: string; accent?: boolean; color?: string }[]; size: number; weight?: number; font?: string; step?: number; align?: "center" | "left" }> = ({
  f,
  at,
  parts,
  size,
  weight = 800,
  font = CN,
  step = 1.2,
  align = "center",
}) => {
  let k = 0;
  return (
    <div style={{ display: "flex", justifyContent: align === "center" ? "center" : "flex-start", flexWrap: "nowrap", fontFamily: font, fontWeight: weight, fontSize: size, lineHeight: 1.18, color: C.ink, whiteSpace: "pre" }}>
      {parts.map((p, pi) =>
        Array.from(p.t).map((ch, ci) => {
          const i = k++;
          const q = seg(f, at + i * step, 14);
          const style: React.CSSProperties = {
            display: "inline-block",
            transform: `translateY(${(1 - q) * 0.55 * size}px)`,
            opacity: clamp01(q * 1.6),
            filter: q < 1 ? `blur(${(1 - q) * 10}px)` : undefined,
            color: p.color,
          };
          return p.accent ? (
            <span key={`${pi}-${ci}`} style={style}>
              <GradText>{ch}</GradText>
            </span>
          ) : (
            <span key={`${pi}-${ci}`} style={style}>
              {ch}
            </span>
          );
        }),
      )}
    </div>
  );
};

/** 砸入：1.6→1 缩放 + 模糊 + 一圈光晕。 */
export const slamStyle = (f: number, at: number): React.CSSProperties => {
  const q = seg(f, at, 10, E.out);
  return { opacity: f < at ? 0 : clamp01(q * 2), transform: `scale(${mix(1.6, 1, q)})`, filter: q < 1 ? `blur(${(1 - q) * 14}px)` : undefined };
};

/** 玻璃窗口（macOS 风交通灯 + 标题）。 */
export const Win: React.FC<{ x: number; y: number; w: number; h: number; title?: string; children?: React.ReactNode; style?: React.CSSProperties }> = ({ x, y, w, h, title, children, style }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      height: h,
      borderRadius: 22,
      background: "linear-gradient(180deg, rgba(22,28,52,0.92), rgba(10,13,28,0.94))",
      border: "1px solid rgba(160,180,255,0.16)",
      boxShadow: "0 40px 120px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)",
      overflow: "hidden",
      ...style,
    }}
  >
    <div style={{ height: 52, display: "flex", alignItems: "center", gap: 10, padding: "0 20px", borderBottom: "1px solid rgba(160,180,255,0.1)" }}>
      {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
        <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c, opacity: 0.85 }} />
      ))}
      <div style={{ flex: 1, textAlign: "center", fontFamily: EN, fontSize: 19, color: C.mute, marginRight: 60 }}>{title}</div>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, top: 52, bottom: 0 }}>{children}</div>
  </div>
);

export const Mark: React.FC<{ w: number; style?: React.CSSProperties }> = ({ w, style }) => (
  <Img src={staticFile("brand/mark.png")} style={{ width: w, height: w * (834 / 1233), display: "block", ...style }} />
);

/** 碎片化：把一个矩形炸成小方块飘散（点击「新对话」时用）。 */
export const Shatter: React.FC<{ f: number; at: number; x: number; y: number; w: number; h: number; color: string; seed: string }> = ({ f, at, x, y, w, h, color, seed }) => {
  const t = f - at;
  if (t < 0 || t > 26) return null;
  const nx = 14;
  const ny = 3;
  const cw = w / nx;
  const ch = h / ny;
  const cells = [];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const r1 = random(`${seed}${i}-${j}a`);
      const r2 = random(`${seed}${i}-${j}b`);
      const vx = (i / nx - 0.5) * 22 + (r1 - 0.5) * 16;
      const vy = -8 - r2 * 14;
      const p = t / 26;
      cells.push(
        <div
          key={`${i}-${j}`}
          style={{
            position: "absolute",
            left: x + i * cw + vx * t,
            top: y + j * ch + vy * t + 0.6 * t * t,
            width: cw - 2,
            height: ch - 2,
            borderRadius: 3,
            background: color,
            opacity: 1 - p,
            transform: `rotate(${(r1 - 0.5) * 220 * p}deg) scale(${1 - p * 0.6})`,
          }}
        />,
      );
    }
  return <>{cells}</>;
};

export const Kicker: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontFamily: EN, fontSize: 22, letterSpacing: "0.22em", fontWeight: 600, color: C.cyan, textTransform: "uppercase", ...style }}>{children}</div>
);
