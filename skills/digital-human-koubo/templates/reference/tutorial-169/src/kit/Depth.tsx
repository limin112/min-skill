// 景深字：文字 / 数字在人身后（原视频 → 大字 → 抠出来的人，三层叠）。
// 抠像视频用 scripts/cutout_video.py 生成（Vision 人像分割，VP9 透明 webm），和原视频逐帧对齐。
import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, staticFile } from "remotion";
import { C, F, FONT, clamp, ease, lerp, sp, useT } from "./core";

type Line = { t: string; color?: string; size?: number; font?: "zh" | "en" | "serif"; weight?: number; outline?: boolean };
/**
 * src：原口播视频；cutout：同一条视频的抠像（透明 webm）；两条都按整片时间播放（offset = 视频在整片里的起点偏移）。
 * mode：rise（从人身后升起）/ slam（放大砸入）/ count（数字从 0 滚到 to）/ slide（左右滑入）。
 * y：文字中线在画面高度的比例（默认 0.36，正好在头肩后面）；crop/zoom 用来和模板里主播的取景对齐。
 */
export const TextBehind: React.FC<{
  src: string; cutout: string; at: number; until: number; lines: Line[]; mode?: "rise" | "slam" | "count" | "slide";
  y?: number; offset?: number; crop?: number; zoom?: number; count?: { to: number; from?: number; prefix?: string; unit?: string; dur?: number };
  bgDim?: number; gradient?: [string, string]; letterSpacing?: number; showHostOutside?: boolean;
  /** 抠像只抠了一段时：这段在原视频里的起点（= cutout_video.py --from） */ cutoutFrom?: number;
}> = ({ src, cutout, at, until, lines, mode = "rise", y = 0.36, offset = 0, crop = 0, zoom = 1, count, bgDim = 0, gradient, letterSpacing, showHostOutside = false, cutoutFrom = 0 }) => {
  const { f, t, W, H } = useT();
  if (!showHostOutside && (t < at - 0.05 || t > until)) return null;
  const vstyle: React.CSSProperties = { position: "absolute", left: 0, top: -crop * (W / 1080), width: W, height: H + 2 * crop * (W / 1080), objectFit: "cover", transform: `scale(${zoom})`, transformOrigin: "50% 30%" };
  const p = mode === "slam" ? interpolate(f - F(at), [0, 5, 10], [1.7, 0.96, 1], clamp) : sp(f, at, 14, 120, 0.9);
  const out = lerp(f, until - 0.35, until, 0, 1, ease.inOut);
  const total = lines.reduce((a, l) => a + (l.size ?? (W > H ? 0.3 : 0.2)) * H * 0.92, 0);
  let acc = 0;
  return (
    <AbsoluteFill>
      <OffthreadVideo src={staticFile(src)} muted startFrom={F(offset)} style={vstyle} />
      {bgDim > 0 && <AbsoluteFill style={{ background: `rgba(0,0,0,${bgDim * (1 - out) * Math.min(1, p)})` }} />}
      {t >= at - 0.05 && t <= until && (
        <div style={{ position: "absolute", left: 0, right: 0, top: H * y - total / 2, height: total, opacity: 1 - out, filter: "drop-shadow(0 12px 30px rgba(0,0,0,.28))" }}>
          {lines.map((l, k) => {
            const sz = (l.size ?? (W > H ? 0.3 : 0.2)) * H;
            const top = acc; acc += sz * 0.92;
            const la = at + k * 0.18;
            const lp = mode === "slam" ? interpolate(f - F(la), [0, 5, 10], [1.7, 0.96, 1], clamp) : sp(f, la, 14, 120, 0.9);
            const tf = mode === "rise" ? `translateY(${(1 - lp) * sz * 0.9}px)` : mode === "slide" ? `translateX(${(1 - lp) * (k % 2 ? 1 : -1) * W * 0.4}px)` : `scale(${lp})`;
            let txt = l.t;
            if (mode === "count" && count && k === 0) {
              const done = t >= at + (count.dur ?? 1.2);   // 动画结束必须落在精确值（expo 缓动只到 99.9%，四舍五入会多 1）
              const v = done ? count.to : lerp(f, at, at + (count.dur ?? 1.2), count.from ?? 0, count.to, ease.expo);
              txt = `${count.prefix ?? ""}${Math.round(v).toLocaleString("en-US")}${count.unit ?? ""}`;
            }
            const fam = l.font === "en" ? FONT.en : l.font === "serif" ? '"Songti SC","Times New Roman",serif' : FONT.zh;
            return (
              <div key={k} style={{ position: "absolute", left: 0, right: 0, top, height: sz, overflow: mode === "rise" ? "hidden" : "visible", display: "flex", justifyContent: "center" }}>
                <div style={{ transform: tf, opacity: mode === "rise" ? 1 : Math.min(1, lp * 1.5), fontFamily: fam, fontWeight: l.weight ?? 900, fontSize: sz, lineHeight: `${sz}px`, whiteSpace: "nowrap", letterSpacing: letterSpacing ?? (l.font === "en" ? -sz * 0.03 : sz * 0.02),
                  color: l.outline ? "transparent" : gradient ? "transparent" : l.color ?? "#fff", WebkitTextStroke: l.outline ? `${Math.max(3, sz * 0.012)}px ${l.color ?? "#fff"}` : undefined,
                  backgroundImage: gradient && !l.outline ? `linear-gradient(180deg, ${gradient[0]}, ${gradient[1]})` : undefined, WebkitBackgroundClip: gradient && !l.outline ? "text" : undefined, backgroundClip: gradient && !l.outline ? "text" : undefined,
                  fontVariantNumeric: "tabular-nums" }}>{txt}</div>
              </div>
            );
          })}
        </div>
      )}
      {cutoutFrom > 0 ? (
        <Sequence from={F(cutoutFrom - offset)} layout="none"><OffthreadVideo src={staticFile(cutout)} transparent muted style={vstyle} /></Sequence>
      ) : <OffthreadVideo src={staticFile(cutout)} transparent muted startFrom={F(offset)} style={vstyle} />}
    </AbsoluteFill>
  );
};
export const DEPTH_DEFAULT_GRADIENT: [string, string] = ["#FFFFFF", "#C9D2E0"];
export const DEPTH_ACCENT = C.yellow;
