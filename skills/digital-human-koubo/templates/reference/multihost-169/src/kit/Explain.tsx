// 知识解说派（Johnny Harris / Vox / Kurzgesagt / 回形针 实测参数，见 packaging-research/reports/3）：
// 句子聚焦荧光笔、打字名牌、主持人跳切推近、复盘板、搜索框打字、指针胶囊、引线双语标注、折线/条形图、砸字 + 年份角标、鬼影大字、撕纸标题条、档案卡快切。
import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, interpolate, random, staticFile } from "remotion";
import { C, F, FONT, clamp, ease, lerp, sp, stroke, useT } from "./core";

const VOX_Y = "#EAF130";
const SERIF_BLACK = '"Songti SC","Noto Serif SC","Times New Roman",serif';

/** 句子聚焦：重建的文档（标题 + 段落），非目标句压到 35%，目标句里的关键词黄块从左往右扫（0.4 秒），整页缓慢推近 1.00→1.05。 */
export const DocFocus: React.FC<{ at: number; until: number; source?: string; title?: string; paras: Array<Array<{ t: string; focus?: boolean; hl?: boolean; hlAt?: number }>>; dark?: boolean }> = ({ at, until, source, title, paras, dark }) => {
  const { f, t, W, H } = useT();
  if (t < at || t > until) return null;
  const dim = lerp(f, at + 0.5, at + 0.9, 1, 0.35);
  const z = lerp(f, at, until, 1, 1.05, (x) => x);
  const fg = dark ? "#EEE" : "#1A1A1A";
  return (
    <AbsoluteFill style={{ background: dark ? "#141414" : "#F4F2EE" }}>
      <div style={{ position: "absolute", left: W * 0.1, right: W * 0.1, top: H * 0.1, transform: `scale(${z})`, transformOrigin: "50% 30%" }}>
        {source && <div style={{ fontFamily: FONT.en, fontWeight: 800, fontSize: H * 0.022, letterSpacing: 3, color: C.red, marginBottom: 14 }}>{source}</div>}
        {title && <div style={{ fontFamily: SERIF_BLACK, fontWeight: 900, fontSize: H * 0.064, color: fg, lineHeight: 1.25, marginBottom: H * 0.035, opacity: dim }}>{title}</div>}
        {paras.map((p, i) => (
          <p key={i} style={{ fontFamily: SERIF_BLACK, fontSize: H * 0.044, lineHeight: 1.7, color: fg, margin: `0 0 ${H * 0.02}px` }}>
            {p.map((s, k) => {
              const ha = s.hlAt ?? at + 1.0;
              const sw = lerp(f, ha, ha + 0.4, 0, 1, ease.inOut);
              return (
                <span key={k} style={{ opacity: s.focus || s.hl ? 1 : dim, position: "relative" }}>
                  {s.hl && <span style={{ position: "absolute", left: -2, right: -2, top: "8%", bottom: "4%", background: VOX_Y, transformOrigin: "0 50%", transform: `scaleX(${sw})`, zIndex: 0 }} />}
                  <span style={{ position: "relative", zIndex: 1, color: s.hl ? "#111" : undefined }}>{s.t}</span>
                </span>
              );
            })}
          </p>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** 打字名牌：手绘黄箭头 0.3 秒画出指向人物 → 粗衬线黄色名字逐字打出（每字 0.12 秒，带光标）→ 白色小字头衔。 */
export const TypedNameTag: React.FC<{ at: number; until: number; name: string; title?: string; x: number; y: number; target?: [number, number]; color?: string; cps?: number }> = ({ at, until, name, title, x, y, target, color = "#EFF01B", cps = 8 }) => {
  const { f, t, H } = useT();
  if (t < at || t > until) return null;
  const ap = lerp(f, at, at + 0.3, 0, 1, ease.inOut);
  const n = Math.max(0, Math.floor((t - at - 0.3) * cps));
  const done = n >= name.length;
  const out = lerp(f, until - 0.25, until, 0, 1);
  let arrow = null;
  if (target) {
    const [ex, ey] = target, sx = x + 40, sy = y + H * 0.1;
    const mx = (sx + ex) / 2 - 60, my = Math.min(sy, ey) - 40;
    const ang = Math.atan2(ey - my, ex - mx);
    arrow = <path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey} M${ex - Math.cos(ang - 0.5) * 30},${ey - Math.sin(ang - 0.5) * 30} L${ex},${ey} L${ex - Math.cos(ang + 0.5) * 30},${ey - Math.sin(ang + 0.5) * 30}`} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ap} />;
  }
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      {arrow && <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible", filter: "drop-shadow(0 3px 6px rgba(0,0,0,.4))" }}>{arrow}</svg>}
      <div style={{ position: "absolute", left: x, top: y, fontFamily: SERIF_BLACK, fontWeight: 900, fontSize: H * 0.085, color, lineHeight: 1.05, textShadow: "0 4px 18px rgba(0,0,0,.55)", whiteSpace: "pre-line" }}>
        {name.slice(0, n)}{!done && f % 14 < 8 ? "▍" : ""}
      </div>
      {title && done && <div style={{ position: "absolute", left: x + 4, top: y + H * 0.1 * (name.split("\n").length) + 6, fontFamily: FONT.zh, fontWeight: 600, fontSize: H * 0.03, color: "#fff", opacity: sp(f, at + 0.3 + name.length / cps, 14, 200), textShadow: "0 2px 10px rgba(0,0,0,.6)" }}>{title}</div>}
    </AbsoluteFill>
  );
};

/** 主持人跳切推近：同一条数字人视频在切点（句子边界）之间硬切景别，不做缓动。
 *  默认 1.0× / 1.3× 交替（Johnny Harris）；levels 可给多档景别 + 左右偏置（MKBHD / 影视飓风：1.0 / 1.18 / 1.32）。 */
export const PunchInHost: React.FC<{ src: string; cuts: number[]; scale?: number; levels?: Array<{ s: number; dx?: number }>; anchor?: [number, number]; offset?: number }> = ({ src, cuts, scale = 1.3, levels, anchor = [0.5, 0.36], offset = 0 }) => {
  const { t, W } = useT();
  const k = cuts.filter((c) => t >= c).length;
  const L = levels ?? [{ s: 1 }, { s: scale }];
  const lv = L[k % L.length];
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translateX(${(lv.dx ?? 0) * W}px) scale(${lv.s})`, transformOrigin: `${anchor[0] * 100}% ${anchor[1] * 100}%` }}>
        <OffthreadVideo src={staticFile(src)} muted startFrom={F(offset)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** 复盘板：两栏（为什么 / 怎么办），每章回来亮一条新的，旧条目暗白；可留「?」吊胃口。 */
export const RecapBoard: React.FC<{ at: number; until: number; columns: Array<{ title: string; color: string; items: string[] }>; reveal: number[]; newAt?: number }> = ({ at, until, columns, reveal, newAt }) => {
  const { f, t, W, H } = useT();
  if (t < at || t > until) return null;
  const na = newAt ?? at + 0.5;
  return (
    <AbsoluteFill style={{ background: "#101010", opacity: lerp(f, at, at + 0.25, 0, 1) * (1 - lerp(f, until - 0.25, until, 0, 1)) }}>
      <div style={{ position: "absolute", left: W / 2, top: H * 0.14, bottom: H * 0.1, width: 2, background: "rgba(255,255,255,.25)" }} />
      {columns.map((c, ci) => (
        <div key={ci} style={{ position: "absolute", left: ci ? W / 2 + W * 0.05 : W * 0.08, width: W * 0.38, top: H * 0.14 }}>
          <div style={{ fontFamily: FONT.zh, fontWeight: 900, fontSize: H * 0.05, color: c.color, borderBottom: `3px solid ${c.color}`, paddingBottom: 10, marginBottom: H * 0.035, letterSpacing: 2 }}>{c.title}</div>
          {c.items.length === 0 || reveal[ci] === 0 ? <div style={{ fontFamily: FONT.en, fontWeight: 900, fontSize: H * 0.14, color: "rgba(255,255,255,.5)" }}>?</div> :
            c.items.slice(0, reveal[ci]).map((it, k) => {
              const isNew = k === reveal[ci] - 1;
              const p = isNew ? sp(f, na + ci * 0.25, 14, 200) : 1;
              return <div key={k} style={{ fontFamily: FONT.zh, fontWeight: isNew ? 800 : 600, fontSize: H * 0.036, lineHeight: 1.65, color: isNew ? "#fff" : "rgba(255,255,255,.45)", opacity: p, transform: `translateX(${(1 - p) * 30}px)` }}>{k + 1}. {it}</div>;
            })}
        </div>
      ))}
    </AbsoluteFill>
  );
};

/** 搜索框打字冷开场：中性搜索框逐字打出（每秒 9 字），打到一半弹联想词，镜头 3 秒推近 1.6 倍。 */
export const SearchTyping: React.FC<{ at: number; until: number; query: string; suggestions?: string[]; cps?: number; zoomTo?: number }> = ({ at, until, query, suggestions = [], cps = 9, zoomTo = 1.6 }) => {
  const { f, t, W, H } = useT();
  if (t < at || t > until) return null;
  const n = Math.min(query.length, Math.max(0, Math.floor((t - at - 0.2) * cps)));
  const z = lerp(f, at, at + 3, 1, zoomTo, ease.inOut);
  const showSug = n >= Math.ceil(query.length / 2);
  const typed = query.slice(0, n);
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <div style={{ position: "absolute", left: W * 0.2, width: W * 0.6, top: H * 0.38, transform: `scale(${z})`, transformOrigin: "50% 20%" }}>
        <div style={{ height: H * 0.085, borderRadius: 999, border: "2px solid #DADCE0", boxShadow: "0 2px 10px rgba(0,0,0,.08)", display: "flex", alignItems: "center", padding: `0 ${H * 0.03}px`, gap: 18 }}>
          <svg width={H * 0.032} height={H * 0.032} viewBox="0 0 24 24"><circle cx={10} cy={10} r={7} fill="none" stroke="#9AA0A6" strokeWidth={2.5} /><path d="M15.5 15.5 L22 22" stroke="#9AA0A6" strokeWidth={2.5} strokeLinecap="round" /></svg>
          <span style={{ fontFamily: FONT.zh, fontSize: H * 0.036, color: "#202124" }}>{typed}<span style={{ opacity: f % 16 < 9 ? 1 : 0, color: "#1A73E8" }}>|</span></span>
        </div>
        {showSug && suggestions.length > 0 && (
          <div style={{ marginTop: 6, borderRadius: 18, background: "#fff", boxShadow: "0 6px 18px rgba(0,0,0,.12)", padding: "10px 0", opacity: sp(f, at + 0.2 + Math.ceil(query.length / 2) / cps, 16, 220) }}>
            {suggestions.map((s, k) => {
              const i = s.indexOf(typed);
              return <div key={k} style={{ display: "flex", gap: 18, alignItems: "center", padding: `${H * 0.008}px ${H * 0.03}px`, fontFamily: FONT.zh, fontSize: H * 0.03, color: "#202124" }}>
                <span style={{ color: "#9AA0A6" }}>⌕</span>
                {i >= 0 ? <span>{s.slice(0, i)}<span>{typed}</span><b>{s.slice(i + typed.length)}</b></span> : <span>{s}</span>}
              </div>;
            })}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** 指针胶囊：实色胶囊 + 小尖指向目标，弹簧 8 帧弹出，可带第二行小字。 */
export const CalloutPill: React.FC<{ at: number; until: number; text: string; sub?: string; x: number; y: number; color?: string; pointer?: "down" | "left" | "up" | "right" }> = ({ at, until, text, sub, x, y, color = "#00C20D", pointer = "down" }) => {
  const { f, t, H } = useT();
  if (t < at || t > until) return null;
  const p = sp(f, at, 12, 260, 0.5) * (1 - lerp(f, until - 0.2, until, 0, 1));
  const tri: Record<string, React.CSSProperties> = {
    down: { left: "50%", bottom: -14, marginLeft: -14, borderLeft: "14px solid transparent", borderRight: "14px solid transparent", borderTop: `16px solid ${color}` },
    up: { left: "50%", top: -14, marginLeft: -14, borderLeft: "14px solid transparent", borderRight: "14px solid transparent", borderBottom: `16px solid ${color}` },
    left: { left: -14, top: "50%", marginTop: -14, borderTop: "14px solid transparent", borderBottom: "14px solid transparent", borderRight: `16px solid ${color}` },
    right: { right: -14, top: "50%", marginTop: -14, borderTop: "14px solid transparent", borderBottom: "14px solid transparent", borderLeft: `16px solid ${color}` },
  };
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) scale(${p})` }}>
      <div style={{ position: "relative", background: color, borderRadius: 999, padding: `${H * 0.012}px ${H * 0.03}px`, textAlign: "center", boxShadow: "0 8px 20px rgba(0,0,0,.25)" }}>
        <div style={{ fontFamily: FONT.zh, fontWeight: 800, fontSize: H * 0.045, color: "#fff", whiteSpace: "nowrap" }}>{text}</div>
        {sub && <div style={{ fontFamily: FONT.zh, fontWeight: 600, fontSize: H * 0.024, color: "rgba(255,255,255,.85)", whiteSpace: "nowrap" }}>{sub}</div>}
        <span style={{ position: "absolute", width: 0, height: 0, ...tri[pointer] }} />
      </div>
    </div>
  );
};

/** 引线双语标注：从物体点拉出细白线，末端中文粗体 + 英文小斜体（回形针式），8 帧画线。 */
export const LeaderLabel: React.FC<{ at: number; until: number; target: [number, number]; zh: string; en?: string; dir?: "r" | "l"; len?: number; tag?: string }> = ({ at, until, target, zh, en, dir = "r", len = 260, tag }) => {
  const { f, t, H } = useT();
  if (t < at || t > until) return null;
  const lp = lerp(f, at, at + 8 / 30, 0, 1, ease.out), tp = lerp(f, at + 0.2, at + 0.5, 0, 1);
  const [x, y] = target; const ex = dir === "r" ? x + len : x - len;
  return (
    <AbsoluteFill>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <circle cx={x} cy={y} r={7} fill="#fff" />
        <line x1={x} y1={y} x2={x + (ex - x) * lp} y2={y} stroke="rgba(255,255,255,.7)" strokeWidth={2} />
      </svg>
      <div style={{ position: "absolute", top: y - H * 0.06, [dir === "r" ? "left" : "right"]: dir === "r" ? ex + 16 : 1920 - ex + 16, opacity: tp, textAlign: dir === "r" ? "left" : "right" }}>
        <div style={{ fontFamily: FONT.zh, fontWeight: 800, fontSize: H * 0.05, color: "#fff" }}>{zh}</div>
        {en && <div style={{ fontFamily: '"Georgia",serif', fontStyle: "italic", fontSize: H * 0.025, color: "rgba(255,255,255,.6)" }}>{en}</div>}
        {tag && <div style={{ display: "inline-block", marginTop: 8, fontFamily: FONT.zh, fontWeight: 700, fontSize: H * 0.022, color: "#fff", background: "#A37B53", padding: "3px 10px", borderRadius: 4 }}>{tag}</div>}
      </div>
    </AbsoluteFill>
  );
};

/** 折线图：多条线从左往右画出，末端挂同色胶囊标签；黑底网格。 */
export const LineDraw: React.FC<{ at: number; until: number; series: Array<{ label: string; color: string; data: number[] }>; title?: string; xLabels?: string[]; drawDur?: number; max?: number; source?: string }> = ({ at, until, series, title, xLabels = [], drawDur = 1.4, max, source }) => {
  const { f, t, W, H } = useT();
  if (t < at || t > until) return null;
  const L = W * 0.1, R = W * 0.86, T = H * 0.22, B = H * 0.8;
  const mx = max ?? Math.max(...series.flatMap((s) => s.data)) * 1.1;
  const p = lerp(f, at + 0.2, at + 0.2 + drawDur, 0, 1, ease.inOut);
  return (
    <AbsoluteFill style={{ background: "#0E0E10" }}>
      {title && <div style={{ position: "absolute", left: L, top: H * 0.08, fontFamily: FONT.zh, fontWeight: 900, fontSize: H * 0.055, color: "#fff" }}>{title}</div>}
      <svg width={W} height={H}>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={L} x2={R} y1={B - (B - T) * g} y2={B - (B - T) * g} stroke="rgba(255,255,255,.08)" />)}
        {series.map((s, i) => {
          const pts = s.data.map((v, k) => [L + ((R - L) * k) / (s.data.length - 1), B - ((B - T) * v) / mx] as [number, number]);
          const d = "M" + pts.map((q) => q.join(",")).join(" L");
          const last = pts[Math.min(pts.length - 1, Math.floor(p * (pts.length - 1)))];
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
              {p > 0.98 && <g transform={`translate(${pts[pts.length - 1][0] + 18},${pts[pts.length - 1][1]})`} opacity={sp(f, at + 0.2 + drawDur, 14, 220)}>
                <rect x={0} y={-22} width={s.label.length * 26 + 30} height={44} rx={22} fill={s.color} />
                <text x={15} y={9} fontFamily={FONT.zh} fontWeight={800} fontSize={26} fill="#111">{s.label}</text></g>}
              {p < 0.98 && last && <circle cx={last[0]} cy={last[1]} r={9} fill={s.color} />}
            </g>
          );
        })}
        {xLabels.map((x, k) => <text key={k} x={L + ((R - L) * k) / Math.max(1, xLabels.length - 1)} y={B + 44} textAnchor="middle" fontFamily={FONT.mono} fontSize={24} fill="rgba(255,255,255,.5)">{x}</text>)}
      </svg>
      {source && <div style={{ position: "absolute", left: L, bottom: H * 0.05, fontFamily: FONT.zh, fontSize: H * 0.018, color: "rgba(255,255,255,.45)" }}><span style={{ color: C.red }}>● </span>{source}</div>}
    </AbsoluteFill>
  );
};

/** 横向对比条：图标/名字 + 长条从左长出 + 数值，背后压鬼影大字。 */
export const BarCompare: React.FC<{ at: number; until: number; rows: Array<{ label: string; value: number; text?: string; color?: string }>; title?: string; ghost?: string; max?: number }> = ({ at, until, rows, title, ghost, max }) => {
  const { f, t, W, H } = useT();
  if (t < at || t > until) return null;
  const mx = max ?? Math.max(...rows.map((r) => r.value));
  return (
    <AbsoluteFill style={{ background: "#3B3A3A" }}>
      {ghost && <GhostWord text={ghost} at={at} until={until} />}
      {title && <div style={{ position: "absolute", left: W * 0.1, top: H * 0.12, fontFamily: FONT.zh, fontWeight: 900, fontSize: H * 0.055, color: "#fff" }}>{title}</div>}
      {rows.map((r, k) => {
        const g = lerp(f, at + 0.3 + k * 0.2, at + 1.1 + k * 0.2, 0, r.value / mx, ease.out);
        return (
          <div key={k} style={{ position: "absolute", left: W * 0.1, top: H * (0.32 + k * 0.15), width: W * 0.8 }}>
            <div style={{ fontFamily: FONT.zh, fontWeight: 800, fontSize: H * 0.035, color: "#fff", marginBottom: 8 }}>{r.label}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ height: H * 0.04, width: `${g * 80}%`, background: r.color ?? "#A37B53", borderRadius: 4 }} />
              <span style={{ fontFamily: FONT.en, fontWeight: 800, fontSize: H * 0.035, color: "#fff", opacity: g > 0.02 ? 1 : 0 }}>{r.text ?? r.value}</span>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** 鬼影大字：背后一个巨大的英文/中文词，6% 不透明或描边，缓慢横移。 */
export const GhostWord: React.FC<{ text: string; at: number; until: number; outline?: boolean; opacity?: number; drift?: number }> = ({ text, at, until, outline, opacity = 0.07, drift = 0.02 }) => {
  const { t, W, H } = useT();
  if (t < at || t > until) return null;
  return (
    <div style={{ position: "absolute", left: W * 0.02 - (t - at) * W * drift, top: H * 0.22, whiteSpace: "nowrap", fontFamily: FONT.en, fontStyle: "italic", fontWeight: 900, fontSize: H * 0.45, lineHeight: 1,
      color: outline ? "transparent" : `rgba(255,255,255,${opacity})`, WebkitTextStroke: outline ? `2px rgba(255,255,255,${opacity * 3})` : undefined, pointerEvents: "none" }}>{text}</div>
  );
};

/** 砸字：两行大字先后砸进主持人画面上下（间隔 0.5 秒），低频 hit；可选年份角标。 */
export const SlamText: React.FC<{ at: number; until: number; lines: string[]; stagger?: number; color?: string; year?: string }> = ({ at, until, lines, stagger = 0.5, color = "#fff", year }) => {
  const { f, t, W, H } = useT();
  if (t < at || t > until) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {lines.map((l, k) => {
        const a = at + k * stagger; if (t < a) return null;
        const p = interpolate(f - F(a), [0, 4, 9], [1.6, 0.96, 1], clamp);
        return <div key={k} style={{ position: "absolute", left: 0, right: 0, top: k === 0 ? H * 0.06 : H * 0.72, textAlign: "center", fontFamily: FONT.zh, fontWeight: 900, fontSize: H * (W > H ? 0.14 : 0.08), color, letterSpacing: 4, transform: `scale(${p})`, textShadow: `${stroke(5, "#000")}, 0 10px 30px rgba(0,0,0,.5)` }}>{l}</div>;
      })}
      {year && <div style={{ position: "absolute", right: W * 0.04, top: H * 0.05, fontFamily: FONT.en, fontWeight: 900, fontSize: H * 0.045, color: "#fff", background: "#ED1682", padding: "4px 16px", opacity: sp(f, at, 14, 220) }}>{year}</div>}
    </AbsoluteFill>
  );
};

/** 撕纸标题条：深灰撕口横条横穿画面，白色宋黑大标题 + 红杠小字期号；背后画面轻微推近。 */
export const TornStrip: React.FC<{ at: number; until: number; title: string; sub?: string; seed?: string }> = ({ at, until, title, sub, seed = "t" }) => {
  const { f, t, W, H } = useT();
  if (t < at || t > until) return null;
  const h = H * 0.25, top = H * 0.375;
  const edge = (y0: number, dir: number) => Array.from({ length: 61 }, (_, i) => `${(i / 60) * W},${y0 + dir * random(`${seed}${y0}${i}`) * 16}`).join(" L");
  const p = lerp(f, at, at + 0.3, 0, 1, ease.out);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, transform: `scaleX(${p})`, transformOrigin: "0 50%" }}>
        <path d={`M${edge(top, -1)} L${W},${top + h} L${edge(top + h, 1).split(" L").reverse().join(" L")} Z`} fill="#3A3A3C" style={{ filter: "drop-shadow(0 10px 20px rgba(0,0,0,.45))" }} />
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: top + h * 0.16, textAlign: "center", opacity: lerp(f, at + 0.2, at + 0.45, 0, 1) }}>
        <div style={{ fontFamily: SERIF_BLACK, fontWeight: 900, fontSize: H * 0.09, color: "#fff" }}>{title}</div>
        {sub && <div style={{ fontFamily: FONT.en, fontWeight: 700, fontSize: H * 0.024, color: "rgba(255,255,255,.75)", letterSpacing: 3, marginTop: 6 }}><span style={{ display: "inline-block", width: 6, height: H * 0.024, background: C.red, marginRight: 12, verticalAlign: "middle" }} />{sub}</div>}
      </div>
    </AbsoluteFill>
  );
};

/** 档案卡快切：黑底暗角，中间米灰圆角卡，每 0.6 秒换一张图，顶部红色大写标签。 */
export const ArchiveCards: React.FC<{ at: number; images: Array<{ src: string; label?: string }>; per?: number }> = ({ at, images, per = 0.6 }) => {
  const { t, W, H } = useT();
  const k = Math.floor((t - at) / per);
  if (t < at || k >= images.length) return null;
  const im = images[k];
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <div style={{ position: "absolute", left: W * 0.15, top: H * 0.12, width: W * 0.7, height: H * 0.76, borderRadius: W * 0.021, background: "#B9BFAA", overflow: "hidden", boxShadow: "inset 0 0 120px rgba(0,0,0,.65)" }}>
        <Img src={staticFile(im.src)} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "sepia(.35) contrast(1.05) saturate(.7)", mixBlendMode: "multiply" }} />
        <AbsoluteFill style={{ boxShadow: "inset 0 0 140px rgba(0,0,0,.7)" }} />
      </div>
      {im.label && <div style={{ position: "absolute", left: 0, right: 0, top: H * 0.05, textAlign: "center", fontFamily: FONT.zh, fontWeight: 900, fontSize: H * 0.04, color: "#D9534F", letterSpacing: 6 }}>{im.label}</div>}
    </AbsoluteFill>
  );
};
