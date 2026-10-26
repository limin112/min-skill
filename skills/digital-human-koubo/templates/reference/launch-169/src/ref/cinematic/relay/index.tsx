// 风格扩展包 02 · 一镜到底接力（references/style-pack-02.md）
// 规则：每个画面都由上一个画面里的物体变来；全片一个强调色 + 一条贯穿线索；用产品自己的界面讲功能。
// 所有组件只收整片绝对帧 f 和各自的触发帧，不依赖 Sequence；颜色走 theme。
import React from "react";
import { getLength, getPointAtLength } from "@remotion/paths";
import { AbsoluteFill, Img, random } from "remotion";
import { clamp01, E, mix } from "../motion";
import { step } from "../spring";

export type RelayTheme = { ink: string; accent: string; accent2: string; mint: string; heavy: string; mono: string };
export const RELAY_GREEN: RelayTheme = {
  ink: "#050B09", accent: "#12C9A0", accent2: "#7BDB6E", mint: "#C8FFE9",
  heavy: '"PingFang SC", "Lantinghei SC", -apple-system, sans-serif', mono: '"SF Mono", Menlo, monospace',
};
const hz = (x: number) => 2 * Math.PI * x;
export const SLAM = { w: hz(4.2), z: 0.6 };
export const SILK = { w: hz(2.5), z: 0.86 };
export const sp = (f: number, t: number, c = SILK) => (f < t ? 0 : step((f - t) / 30, c));
export const ex = (f: number, t: number, d: number) => E.out(clamp01((f - t) / d));
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
export const grad = (t: RelayTheme) => `linear-gradient(120deg, ${t.mint} 0%, ${t.accent} 45%, ${t.accent2} 100%)`;
export const Grad: React.FC<{ t?: RelayTheme; children: React.ReactNode }> = ({ t = RELAY_GREEN, children }) => (
  <span style={{ backgroundImage: grad(t), WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{children}</span>
);

/** 玻璃材质：深色实底（背景字不会透进来）+ 顶部高光 + 强调色边缘光。不用 backdrop-filter。 */
export const glass = (t: RelayTheme = RELAY_GREEN, rim = 0.6, solid = true): React.CSSProperties => ({
  background: solid ? `linear-gradient(180deg, ${rgba(t.accent, 0.1)}, rgba(8,14,12,0.94))` : "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))",
  border: `1.5px solid ${rgba(t.mint, 0.22)}`,
  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 0 0 1px ${rgba(t.accent, rim * 0.5)}, 0 0 40px ${rgba(t.accent, rim * 0.45)}, 0 30px 80px rgba(0,0,0,0.6)`,
});

/* ── 地面网格 + 贯穿线索的光（开场流光） ── */
export const Floor: React.FC<{ f: number; t?: RelayTheme; speed?: number; o?: number; horizon?: number }> = ({ f, t = RELAY_GREEN, speed = 6, o = 1, horizon = 560 }) => (
  <AbsoluteFill style={{ perspective: 700, opacity: o }}>
    <div
      style={{
        position: "absolute", left: -1000, right: -1000, top: horizon, height: 1400, transformOrigin: "50% 0%", transform: "rotateX(76deg)",
        backgroundImage: `linear-gradient(${rgba(t.mint, 0.09)} 2px, transparent 2px), linear-gradient(90deg, ${rgba(t.mint, 0.09)} 2px, transparent 2px)`,
        backgroundSize: "120px 120px", backgroundPositionY: `${f * speed}px`,
        maskImage: "linear-gradient(to bottom, transparent 0%, black 40%)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 40%)",
      }}
    />
    <div style={{ position: "absolute", left: 0, right: 0, top: horizon - 120, height: 260, background: `radial-gradient(ellipse 45% 50% at 50% 50%, ${rgba(t.accent, 0.22)}, transparent 70%)` }} />
  </AbsoluteFill>
);

/** 流光从画外冲到目标矩形左端，再描出矩形边框。rect 是接下来要出现的物体（输入框、卡片）。 */
export const Streak: React.FC<{ f: number; at?: number; rect: { x: number; y: number; w: number; h: number; r?: number }; t?: RelayTheme; fade?: number }> = ({ f, at = 0, rect, t = RELAY_GREEN, fade = 0 }) => {
  const s = ex(f, at, 26);
  const d = ex(f, at + 20, 16);
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <linearGradient id="relay-st" x1="0" x2="1">
          <stop offset="0" stopColor={t.accent} stopOpacity="0" />
          <stop offset="1" stopColor={t.mint} />
        </linearGradient>
      </defs>
      {s < 1 && <path d={`M -100 860 C 500 760, 800 ${rect.y + rect.h / 2 + 80}, ${rect.x} ${rect.y + rect.h / 2}`} fill="none" stroke="url(#relay-st)" strokeWidth={9} pathLength={1} strokeDasharray="0.4 1" strokeDashoffset={-s * 1.1 + 0.4} style={{ filter: `drop-shadow(0 0 10px ${t.accent})` }} />}
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={rect.r ?? rect.h / 2} fill="none" stroke={t.mint} strokeWidth={3} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - d} opacity={1 - fade} style={{ filter: `drop-shadow(0 0 12px ${t.accent})` }} />
    </svg>
  );
};

/** 背景里流动的「待办卡片墙」：交代痛点（重复的活）。words 换成客户场景里的琐事。 */
export const ChoreWall: React.FC<{ f: number; words: string[]; o?: number; t?: RelayTheme }> = ({ f, words, o = 1, t = RELAY_GREEN }) => (
  <AbsoluteFill style={{ opacity: o, filter: "blur(1.5px)" }}>
    {Array.from({ length: 5 }, (_, r) => (
      <div key={r} style={{ position: "absolute", top: 70 + r * 190, left: 0, display: "flex", gap: 22, transform: `translateX(${-((f * (4 + r * 1.3) + r * 300) % 1600)}px)` }}>
        {Array.from({ length: 22 }, (_, i) => (
          <div key={i} style={{ width: 230, height: 150, borderRadius: 16, background: rgba(t.mint, 0.05), border: `1px solid ${rgba(t.mint, 0.1)}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: t.heavy, fontWeight: 700, fontSize: 30, color: rgba(t.mint, 0.35) }}>
            {words[(i * 5 + r * 3) % words.length]}
          </div>
        ))}
      </div>
    ))}
  </AbsoluteFill>
);

/* ── 玻璃输入框：占位语 → 打字 → 发送；dims 让被「拆走」的那段字变暗 ── */
export const GlassBar: React.FC<{
  f: number; x: number; y: number; w: number; h: number; text: string; typeFrom: number; typeTo: number;
  inAt?: number; placeholder?: string; logo?: string; send?: React.ReactNode; dims?: { from: number; to: number; at: number }[]; t?: RelayTheme; fontSize?: number;
}> = ({ f, x, y, w, h, text, typeFrom, typeTo, inAt = 0, placeholder, logo, send, dims = [], t = RELAY_GREEN, fontSize = 42 }) => {
  const n = Math.round(text.length * clamp01((f - typeFrom) / Math.max(1, typeTo - typeFrom)));
  const sent = f >= typeTo + 2;
  const op = (i: number) => (dims.some((d) => i >= d.from && i < d.to && f >= d.at) ? 0.25 : 1);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: h / 2, ...glass(t, 0.7), opacity: ex(f, inAt, 12), display: "flex", alignItems: "center", gap: 20, padding: "0 28px", boxSizing: "border-box" }}>
      {logo && <Img src={logo} style={{ width: h * 0.5, height: h * 0.5 }} />}
      <div style={{ flex: 1, fontFamily: t.heavy, fontWeight: 600, fontSize, color: "#fff", whiteSpace: "nowrap", overflow: "hidden" }}>
        {Array.from(text.slice(0, n)).map((c, i) => (
          <span key={i} style={{ opacity: op(i) }}>{c}</span>
        ))}
        {n < text.length && f >= typeFrom - 10 && Math.floor(f / 5) % 2 === 0 && <span style={{ display: "inline-block", width: 3, height: fontSize * 1.05, background: t.accent, verticalAlign: -8, marginLeft: 3 }} />}
        {f < typeFrom && placeholder && <span style={{ color: "rgba(255,255,255,0.35)" }}>{placeholder}</span>}
      </div>
      <div style={{ width: h * 0.62, height: h * 0.62, borderRadius: h, background: sent ? grad(t) : rgba(t.mint, 0.12), display: "flex", alignItems: "center", justifyContent: "center", boxShadow: sent ? `0 0 30px ${rgba(t.accent, 0.7)}` : undefined }}>
        {send}
      </div>
    </div>
  );
};

/** 句子被拆成参数标签：每个标签在旁白念到它的那一帧，从句子里的位置飞到四周。 */
export const ChipBurst: React.FC<{ f: number; chips: { label: string; value: string; at: number; from: [number, number]; to: [number, number] }[]; t?: RelayTheme }> = ({ f, chips, t = RELAY_GREEN }) => (
  <>
    {chips.map((c) => {
      if (f < c.at) return null;
      const k = sp(f, c.at, SLAM);
      const kk = Math.min(1.03, k);
      return (
        <div key={c.label} style={{ position: "absolute", left: mix(c.from[0], c.to[0], kk), top: mix(c.from[1], c.to[1], kk), transform: `translate(-50%,-50%) scale(${mix(0.4, 1, Math.min(1.05, k))}) rotateX(${mix(40, 8, Math.min(1, k))}deg)`, display: "flex", alignItems: "center", gap: 14, padding: "14px 26px", borderRadius: 999, ...glass(t, 0.6), whiteSpace: "nowrap" }}>
          <span style={{ fontFamily: t.mono, fontSize: 22, letterSpacing: "0.12em", color: t.accent }}>{c.label}</span>
          <span style={{ width: 1.5, height: 26, background: rgba(t.mint, 0.3) }} />
          <span style={{ fontFamily: t.heavy, fontWeight: 800, fontSize: 32, color: "#fff" }}>{c.value}</span>
        </div>
      );
    })}
  </>
);

/* ── 钻进物体：物体内部的裁切区从物体的矩形扩张到全屏，里面放下一个场景 ── */
export const diveP = (f: number, at: number, dur = 16) => E.inOut(clamp01((f - at) / dur));
/** 外层（旧场景）用 diveScale 往物体中心推镜；内层用 DivePortal 放新场景。 */
export const diveScale = (p: number, k = 2.2) => 1 + p * k;
export const DivePortal: React.FC<{ f: number; at: number; dur?: number; rect: { x: number; y: number; w: number; h: number; r?: number }; children: React.ReactNode }> = ({ f, at, dur = 16, rect, children }) => {
  if (f < at - 2) return null;
  const p = diveP(f, at, dur);
  const L = mix(rect.x, 0, p), R = mix(rect.x + rect.w, 1920, p), T = mix(rect.y, 0, p), B = mix(rect.y + rect.h, 1080, p);
  return (
    <div style={{ position: "absolute", left: L, top: T, width: R - L, height: B - T, borderRadius: mix(rect.r ?? rect.h / 2, 0, p), overflow: "hidden", opacity: clamp01((f - at + 2) / 4) }}>
      <div style={{ position: "absolute", left: -L, top: -T, width: 1920, height: 1080 }}>{children}</div>
    </div>
  );
};

/* ── 卡片隧道：素材贴满两壁，镜头一直往前冲；关键词从深处迎面飞来 ── */
export const CardTunnel: React.FC<{ f: number; start: number; images: string[]; words?: { text: string; at: number; y: number }[]; slowAt?: number; t?: RelayTheme }> = ({ f, start, images, words = [], slowAt = 1e9, t = RELAY_GREEN }) => {
  const u = f - start;
  const camZ = u * 70 + Math.max(0, u - 30) * 10;
  const slow = clamp01((f - slowAt) / 20);
  return (
    <AbsoluteFill style={{ background: t.ink, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 48%, ${rgba(t.accent, 0.35)} 0%, transparent 30%)` }} />
      <AbsoluteFill style={{ perspective: 800, perspectiveOrigin: "50% 48%", opacity: 1 - slow * 0.55, filter: slow > 0 ? `blur(${slow * 6}px)` : undefined }}>
        <div style={{ position: "absolute", left: 960, top: 520, transformStyle: "preserve-3d" }}>
          {Array.from({ length: 64 }, (_, i) => {
            const side = i % 2 ? 1 : -1;
            const row = Math.floor(i / 2) % 2;
            const z0 = 200 + Math.floor(i / 4) * 300 - (camZ % 4800);
            const z = z0 < 60 ? z0 + 4800 : z0;
            return (
              <div key={i} style={{ position: "absolute", left: side * 520 - 180, top: row ? 40 : -260, width: 360, height: 210, borderRadius: 12, overflow: "hidden", transform: `translateZ(${-z}px) rotateY(${-side * 72}deg)`, boxShadow: `0 0 0 1px ${rgba(t.mint, 0.25)}`, opacity: clamp01((4800 - z) / 1500) }}>
                <Img src={images[(i * 7) % images.length]} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, background: "rgba(5,11,9,0.35)" }} />
              </div>
            );
          })}
        </div>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          {Array.from({ length: 14 }, (_, i) => {
            const a = -0.9 + (i / 13) * 1.8;
            return <line key={i} x1={960} y1={520} x2={960 + Math.sin(a) * 1800} y2={520 + Math.cos(a) * 900} stroke={rgba(t.mint, 0.08)} strokeWidth={2} />;
          })}
          {Array.from({ length: 8 }, (_, i) => {
            const q = ((u * 0.06 + i / 8) % 1) ** 2.2;
            return <line key={`d${i}`} x1={960 - q * 40} y1={520 + q * 560} x2={960 - q * 60} y2={520 + q * 620} stroke={t.accent} strokeWidth={4} opacity={q} />;
          })}
        </svg>
        <div style={{ position: "absolute", left: 951, top: 751, width: 18, height: 18, borderRadius: 9, background: t.mint, boxShadow: `0 0 30px 10px ${rgba(t.accent, 0.8)}` }} />
      </AbsoluteFill>
      {words.map((w) => {
        const q = clamp01((f - w.at) / 26);
        if (f < w.at || q >= 1) return null;
        return (
          <div key={w.text} style={{ position: "absolute", left: 960, top: 520 + w.y * q, transform: `translate(-50%,-50%) scale(${0.3 + q ** 2 * 2.6})`, opacity: q < 0.8 ? clamp01(q * 4) : (1 - q) * 5, fontFamily: t.mono, fontSize: 30, letterSpacing: "0.2em", color: t.mint, whiteSpace: "nowrap", textShadow: `0 0 20px ${t.accent}` }}>
            // {w.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ── 卡片层叠：新来的卡在最前，旧卡平滑往后退一层；第一张可以从隧道深处飞来 ── */
export type FanCard = { src: string; label: string; sub?: string; at: number };
export const CascadeFan: React.FC<{
  f: number; cards: FanCard[]; w?: number; h?: number; x0?: number; step?: number; y?: number; flyFirst?: boolean;
  orbit?: [number, number, number, number]; stamp?: { at: number; node: React.ReactNode }; t?: RelayTheme;
}> = ({ f, cards, w = 680, h = 425, x0 = -560, step: dx = 240, y = 560, flyFirst = true, orbit, stamp, t = RELAY_GREEN }) => {
  const rot = orbit ? mix(orbit[0], orbit[1], E.inOut(clamp01((f - orbit[2]) / (orbit[3] - orbit[2])))) : 0;
  const spread = cards.length > 1 ? ex(f, cards[1].at - 4, 16) : 1;
  return (
    <AbsoluteFill style={{ perspective: 1800, perspectiveOrigin: "50% 45%" }}>
      <div style={{ position: "absolute", left: 960, top: y, transformStyle: "preserve-3d", transform: `rotateY(${rot}deg)` }}>
        {cards.map((c, i) => {
          if (f < c.at) return null;
          const k = sp(f, c.at, SLAM);
          const newer = cards.reduce((a, cc, j) => a + (j > i ? Math.min(1, sp(f, cc.at, SILK)) : 0), 0);
          let x = x0 + i * dx;
          let z = 120 - newer * 190;
          let ry = -24;
          let sc = 1;
          if (i === 0 && flyFirst) {
            x = mix(0, x, spread);
            z = mix(-3000, z, Math.min(1.02, k));
            ry = mix(0, -24, spread);
            sc = mix(1.35, 1, spread);
          } else {
            z = mix(z - 900, z, Math.min(1.02, k));
          }
          return (
            <div key={i} style={{ position: "absolute", left: x - w / 2, top: -h / 2, transformStyle: "preserve-3d", transform: `translateZ(${z}px) rotateY(${ry}deg) scale(${sc})`, opacity: clamp01(k * 2) }}>
              <div style={{ width: w, height: h, borderRadius: 18, overflow: "hidden", background: "#fff", boxShadow: `0 0 0 2px ${rgba(t.accent, newer < 0.5 ? 0.9 : 0.35)}, 0 0 50px ${rgba(t.accent, 0.35)}, 0 40px 100px rgba(0,0,0,0.7)` }}>
                <Img src={c.src} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#fff" }} />
              </div>
              <div style={{ marginTop: 20, fontFamily: t.mono, fontSize: 28, letterSpacing: "0.06em", color: t.mint, whiteSpace: "nowrap", opacity: clamp01(1 - newer * 1.5) }}>
                // {c.label}
                {c.sub && <span style={{ color: "rgba(255,255,255,0.55)", marginLeft: 12 }}>{c.sub}</span>}
              </div>
              {stamp && i === cards.length - 1 && f >= stamp.at && (
                <div style={{ position: "absolute", right: -30, top: -34, display: "flex", alignItems: "center", gap: 10, padding: "12px 24px", borderRadius: 999, background: grad(t), boxShadow: `0 10px 40px ${rgba(t.accent, 0.6)}`, transform: `scale(${mix(1.8, 1, Math.min(1.04, sp(f, stamp.at, SLAM)))}) rotate(-5deg)`, fontFamily: t.heavy, fontWeight: 900, fontSize: 30, color: t.ink }}>
                  {stamp.node}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ── 3D 日历：格子按随机顺序填满缩略图，最后一张卡掉进「今天」 ── */
export const CalendarDrop: React.FC<{ f: number; start: number; thumbs: string[]; drop: string; today?: number; days?: number; blurAt?: number; t?: RelayTheme }> = ({ f, start, thumbs, drop, today = 17, days = 35, blurAt = 1e9, t = RELAY_GREEN }) => {
  const d0 = sp(f, start + 4, SLAM);
  const back = E.inOut(clamp01((f - blurAt) / 14));
  const cell = 150, gap = 14;
  const W = 7 * (cell + gap), H = Math.ceil(days / 7) * (cell + gap);
  return (
    <AbsoluteFill style={{ perspective: 1600, filter: back > 0 ? `blur(${back * 7}px)` : undefined, opacity: 1 - back * 0.55 }}>
      <div style={{ position: "absolute", left: 960, top: 560, transformStyle: "preserve-3d", transform: `rotateX(${mix(62, 52, ex(f, start, 40))}deg) rotateZ(${mix(-34, -26, ex(f, start, 60))}deg) scale(${mix(1.35, 1.05, ex(f, start, 30)) + back * 0.15})` }}>
        <div style={{ position: "absolute", left: -W / 2, top: -H / 2, width: W, display: "flex", flexWrap: "wrap", gap }}>
          {Array.from({ length: days }, (_, d) => {
            const fillAt = start + 6 + Math.round(random(`cal${d}`) * 26);
            const filled = d < today && f >= fillAt;
            const isToday = d === today;
            return (
              <div key={d} style={{ position: "relative", width: cell, height: cell, borderRadius: 14, background: rgba(t.mint, 0.04), border: `1.5px solid ${isToday ? t.accent : rgba(t.mint, 0.12)}`, overflow: "hidden", boxShadow: isToday ? `0 0 40px ${rgba(t.accent, 0.6)}` : undefined }}>
                {filled && <Img src={thumbs[d % thumbs.length]} style={{ position: "absolute", inset: 6, width: cell - 12, height: cell - 12, objectFit: "cover", borderRadius: 8, opacity: ex(f, fillAt, 6) }} />}
                <span style={{ position: "absolute", left: 10, top: 6, fontFamily: t.mono, fontSize: 18, color: isToday ? t.accent : rgba(t.mint, 0.45) }}>{d + 1}</span>
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: -W / 2 + (today % 7) * (cell + gap) + 6, top: -H / 2 + Math.floor(today / 7) * (cell + gap) + 6, width: cell - 12, height: cell - 12, borderRadius: 8, overflow: "hidden", transform: `translateZ(${mix(900, 2, Math.min(1, d0))}px) rotateX(${mix(-50, 0, Math.min(1, d0))}deg)`, boxShadow: `0 0 0 2px ${t.accent}` }}>
          <Img src={drop} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ── 通知堆叠：新通知从上方落下压住旧的 ── */
export const NotifyStack: React.FC<{ f: number; start: number; gap?: number; icon?: string; app?: string; items: { title: string; sub?: string; time?: string }[]; x?: number; y?: number; t?: RelayTheme }> = ({ f, start, gap = 7, icon, app = "", items, x = 580, y = 330, t = RELAY_GREEN }) => (
  <>
    {items.map((n, i) => {
      const at = start + i * gap;
      if (f < at) return null;
      const k = sp(f, at, SLAM);
      const rank = items.filter((_, j) => j > i && f >= start + j * gap).length;
      return (
        <div key={n.title} style={{ position: "absolute", left: x, top: y + rank * 150, width: 760, height: 124, borderRadius: 30, ...glass(t, rank === 0 ? 0.8 : 0.35), display: "flex", alignItems: "center", gap: 22, padding: "0 30px", boxSizing: "border-box", transform: `translateY(${mix(-80, 0, Math.min(1.03, k))}px) scale(${mix(1.1, 1, Math.min(1, k)) - rank * 0.04})`, opacity: clamp01(k * 2) * (1 - rank * 0.2), zIndex: 10 - rank }}>
          {icon && <Img src={icon} style={{ width: 64, height: 64 }} />}
          <div style={{ flex: 1 }}>
            {app && <div style={{ fontFamily: t.mono, fontSize: 18, letterSpacing: "0.15em", color: rgba(t.mint, 0.6) }}>{app}</div>}
            <div style={{ fontFamily: t.heavy, fontWeight: 900, fontSize: 36, color: "#fff", marginTop: 2 }}>{n.title}</div>
            {n.sub && <div style={{ fontFamily: t.heavy, fontWeight: 600, fontSize: 22, color: t.mint, marginTop: 2 }}>{n.sub}</div>}
          </div>
          {n.time && <span style={{ fontFamily: t.mono, fontSize: 24, color: t.accent }}>{n.time}</span>}
        </div>
      );
    })}
  </>
);

/* ── 点阵数字（5×7） ── */
const DIGITS: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"], "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"], "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"], "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"], "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"], "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};
export const DotNumber: React.FC<{ value: string; dot?: number; t?: RelayTheme }> = ({ value, dot = 26, t = RELAY_GREEN }) => (
  <div style={{ display: "flex", gap: dot * 1.2 }}>
    {Array.from(value).map((ch, k) =>
      DIGITS[ch] ? (
        <div key={k} style={{ display: "grid", gridTemplateColumns: `repeat(5, ${dot}px)`, gap: dot * 0.28 }}>
          {DIGITS[ch].flatMap((row, r) => Array.from(row).map((b, c) => <div key={`${r}-${c}`} style={{ width: dot, height: dot, borderRadius: dot / 2, background: b === "1" ? "#fff" : rgba(t.mint, 0.07), boxShadow: b === "1" ? `0 0 14px ${rgba(t.mint, 0.6)}` : undefined }} />))}
        </div>
      ) : (
        <div key={k} style={{ width: dot, alignSelf: "flex-end" }}><div style={{ width: dot, height: dot, borderRadius: dot / 2, background: t.accent, boxShadow: `0 0 16px ${t.accent}` }} /></div>
      ),
    )}
  </div>
);

/* ── 圆形擦除（黑白大反差转场，全片最多一次） ── */
export const CircleWipe: React.FC<{ f: number; at: number; dur?: number; color?: string; cx?: number; cy?: number }> = ({ f, at, dur = 12, color = "#F4F5F2", cx = 960, cy = 540 }) => {
  const w = E.in2(clamp01((f - at) / dur));
  if (w <= 0) return null;
  return <div style={{ position: "absolute", left: cx - 1200 * w, top: cy - 1200 * w, width: 2400 * w, height: 2400 * w, borderRadius: "50%", background: color }} />;
};

/* ── 闭环跑道：流程画成一圈，光点跑一圈；可以最后收成 Logo ── */
export const LOOP_PATH = "M 330 450 C 330 290, 1300 150, 1540 230 C 1740 300, 1720 520, 1520 640 C 1320 760, 560 880, 340 790 C 150 710, 330 600, 330 450 Z";
export const LoopTrack: React.FC<{
  f: number; start: number; path?: string; labels: { text: string; x: number; y: number }[]; rounds?: { text: string; at: number; ok?: boolean }[];
  roundsAt?: [number, number]; lapFrames?: number; ink?: string; t?: RelayTheme;
}> = ({ f, start, path = LOOP_PATH, labels, rounds = [], roundsAt = [1250, 300], lapFrames = 34, ink = "#0A0F0D", t = RELAY_GREEN }) => {
  const len = getLength(path);
  const draw = E.inOut(clamp01((f - start) / 18));
  const lap = clamp01((f - (start + 10)) / lapFrames);
  const p = getPointAtLength(path, ((lap + 0.02) % 1) * len);
  return (
    <>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <path d={path} fill="none" stroke={ink} strokeWidth={30} strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
        <path d={path} fill="none" stroke="#F4F5F2" strokeWidth={6} pathLength={1} strokeDasharray="0.02 0.02" opacity={draw} />
        {lap > 0 && lap < 1 && <circle cx={p.x} cy={p.y} r={14} fill={t.accent} style={{ filter: `drop-shadow(0 0 12px ${t.accent})` }} />}
      </svg>
      {labels.map((l, i) => (
        <div key={l.text} style={{ position: "absolute", left: l.x, top: l.y, transform: "translate(-50%,-50%) rotate(-8deg)", fontFamily: t.heavy, fontWeight: 900, fontSize: 56, color: ink, opacity: ex(f, start + 6 + i * 5, 8) }}>{l.text}</div>
      ))}
      <div style={{ position: "absolute", left: roundsAt[0], top: roundsAt[1], fontFamily: t.mono, fontSize: 22, lineHeight: 1.6, color: "rgba(10,15,13,0.55)" }}>
        {rounds.map((r) => (
          <div key={r.text} style={{ opacity: ex(f, r.at, 6), color: r.ok ? t.accent : undefined }}>{r.text}</div>
        ))}
      </div>
    </>
  );
};
