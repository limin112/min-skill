// 中文口播网感派（半佛 / 差评 / 毕导实测参数，见 packaging-research/reports/4）：
// 梗图窗、冷开场定格片名卡、证据截图飞入、投票弹窗、故障插屏、人物名牌 + 语录气泡、主播旁悬浮窗、括号旁白、倾斜金句。
import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, random, staticFile } from "remotion";
import { C, F, FONT, clamp, ease, lerp, sp, stroke, useT } from "./core";

const MINT = "#3CF0A0", MINT_D = "#0E3B2A";
const media = (src: string, style: React.CSSProperties, offset = 0) =>
  /\.(jpe?g|png|webp|gif)$/i.test(src) ? <Img src={staticFile(src)} style={style} /> : <OffthreadVideo src={staticFile(src)} muted startFrom={F(offset)} style={style} />;

/** 黑底梗图窗：一句一图，硬切，图上自带梗字（白粗体黑描边）。items: [{src, at, caption?, pos?}]，每张到下一张为止。 */
export const MemeWindow: React.FC<{ items: Array<{ src: string; at: number; caption?: string; pos?: "top" | "bottom" }>; until: number; watermark?: string }> = ({ items, until, watermark }) => {
  const { t, W, H } = useT();
  const k = items.findIndex((m, i) => t >= m.at && t < (items[i + 1]?.at ?? until));
  if (k < 0) return null;
  const m = items[k];
  const vert = H > W; const w = vert ? W * 0.86 : W * 0.46, h = vert ? H * 0.42 : H * 0.78;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <div style={{ position: "absolute", left: (W - w) / 2, top: vert ? H * 0.2 : H * 0.05, width: w, height: h }}>
        {media(m.src, { width: "100%", height: "100%", objectFit: "contain" })}
        {m.caption && <div style={{ position: "absolute", left: 0, right: 0, [m.pos === "bottom" ? "bottom" : "top"]: h * 0.03, textAlign: "center", fontFamily: FONT.zh, fontWeight: 900, fontSize: H * (vert ? 0.04 : 0.07), color: "#fff", textShadow: stroke(5, "#000"), padding: "0 20px" }}>{m.caption}</div>}
      </div>
      {watermark && <div style={{ position: "absolute", right: 40, top: 30, fontFamily: FONT.zh, fontWeight: 900, fontSize: 26, color: "#fff", textShadow: stroke(3, "#000") }}>{watermark}</div>}
    </AbsoluteFill>
  );
};

/** 冷开场定格片名卡：动作片段播到 freezeAt → 0.2 秒去色定格 → 手绘「未完待续」箭头 → 半透明圆角片名框 → 雪花噪点转场。 */
export const ColdOpenFreeze: React.FC<{ src: string; freezeAt: number; until: number; title: [string, string?]; vol?: string; arrow?: string; offset?: number }> = ({ src, freezeAt, until, title, vol, arrow = "未完待续", offset = 0 }) => {
  const { f, t, W, H } = useT();
  if (t > until) return null;
  const gray = lerp(f, freezeAt, freezeAt + 0.2, 0, 1);
  const frozen = t >= freezeAt;
  const ap = sp(f, freezeAt + 0.15, 12, 220), tp = lerp(f, freezeAt + 0.3, freezeAt + 0.5, 0, 1);
  const noise = t > until - 0.5;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ filter: `grayscale(${gray}) contrast(${1 + 0.1 * gray})` }}>
        {/* 定格：视频停在 freezeAt 那一帧（startFrom 固定 + 只播 1 帧之后就用同一帧） */}
        {!frozen ? <Sequence from={0} durationInFrames={F(freezeAt) + 1} layout="none">{media(src, { width: "100%", height: "100%", objectFit: "cover" }, offset)}</Sequence>
          : media(src, { width: "100%", height: "100%", objectFit: "cover" }, offset + freezeAt - 0.03)}
      </AbsoluteFill>
      {frozen && (
        <>
          <div style={{ position: "absolute", left: W * 0.05, bottom: H * 0.16, transform: `translateX(${(1 - ap) * -500}px)` }}>
            <svg width={460} height={120} viewBox="0 0 460 120"><path d="M8,26 L330,26 L330,6 L452,60 L330,114 L330,94 L8,94 Z" fill="#fff" stroke="#111" strokeWidth={6} strokeLinejoin="round" /></svg>
            <span style={{ position: "absolute", left: 34, top: 28, fontFamily: '"Kaiti SC","STKaiti",serif', fontWeight: 900, fontSize: 54, color: "#111" }}>{arrow}</span>
          </div>
          <div style={{ position: "absolute", left: W * 0.17, width: W * 0.66, top: H * 0.3, padding: `${H * 0.04}px 0`, borderRadius: 16, background: "rgba(40,40,40,.72)", textAlign: "center", opacity: tp }}>
            <div style={{ fontFamily: FONT.zh, fontWeight: 900, fontSize: H * 0.09, color: "#fff", lineHeight: 1.2 }}>{title[0]}</div>
            {title[1] && <div style={{ fontFamily: FONT.zh, fontWeight: 900, fontSize: H * 0.09, color: "#fff", lineHeight: 1.2 }}>{title[1]}</div>}
            {vol && <div style={{ fontFamily: FONT.en, fontWeight: 700, fontSize: H * 0.028, color: "rgba(255,255,255,.7)", marginTop: 10, letterSpacing: 4 }}>{vol}</div>}
          </div>
        </>
      )}
      {noise && <AbsoluteFill style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.6' seed='${f % 9}'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`, backgroundSize: "300px 300px", filter: "grayscale(1) contrast(2.2)", opacity: interpolate(t, [until - 0.5, until - 0.3, until], [0, 0.95, 1], clamp) }} />}
    </AbsoluteFill>
  );
};

/** 证据截图飞入：截图从中心小尺寸飞到大，品牌色描边 + 鼠标指针 + 推近数据点弹数值签 + 可选 3D 倾斜。 */
export const EvidenceCard: React.FC<{ src: string; at: number; until: number; iw: number; ih: number; color?: string; focus?: { x: number; y: number }; label?: string; labelAt?: number; tilt?: number; width?: number; source?: string }> = ({ src, at, until, iw, ih, color = MINT, focus, label, labelAt, tilt = 0, width, source }) => {
  const { f, t, W, H } = useT();
  if (t < at || t > until) return null;
  const fly = sp(f, at, 18, 160);
  const out = lerp(f, until - 0.25, until, 0, 1, ease.inOut);
  const w = width ?? W * 0.55, h = (w * ih) / iw;
  const la = labelAt ?? at + 0.9;
  const push = focus ? lerp(f, la - 0.4, la + 0.2, 0, 1, ease.inOut) : 0;
  const z = 1 + 0.45 * push;
  const fx = focus ? (focus.x / iw - 0.5) * w : 0, fy = focus ? (focus.y / ih - 0.5) * h : 0;
  const lp = sp(f, la, 14, 220);
  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg,#2a2a2a,#1a1a1a)", opacity: 1 - out }}>
      <div style={{ position: "absolute", left: W / 2 - w / 2, top: H / 2 - h / 2, width: w, height: h, perspective: 1600,
        transform: `translate(${-fx * push * 0.9}px, ${-fy * push * 0.9}px) scale(${(0.2 + 0.8 * fly) * z})` }}>
        <div style={{ width: "100%", height: "100%", transform: `rotateY(${tilt}deg) rotateX(${tilt ? 8 : 0}deg)`, boxShadow: `0 0 0 4px ${color}, 0 30px 80px rgba(0,0,0,.6)`, borderRadius: 6, overflow: "hidden", background: "#fff" }}>
          <Img src={staticFile(src)} style={{ width: "100%", height: "100%" }} />
        </div>
        {/* 鼠标指针：飞到焦点 */}
        <svg width={44} height={56} viewBox="0 0 44 56" style={{ position: "absolute", left: (focus ? focus.x / iw : 0.9) * w - 6 + (1 - lerp(f, at + 0.3, la - 0.2, 0, 1, ease.inOut)) * 120, top: (focus ? focus.y / ih : 0.85) * h - 4 + (1 - lerp(f, at + 0.3, la - 0.2, 0, 1, ease.inOut)) * 80, filter: "drop-shadow(0 3px 4px rgba(0,0,0,.5))" }}>
          <path d="M4,4 L4,44 L14,34 L21,52 L29,48 L22,31 L37,31 Z" fill="#fff" stroke="#111" strokeWidth={3} strokeLinejoin="round" />
        </svg>
        {label && t >= la && <div style={{ position: "absolute", left: (focus ? focus.x / iw : 0.5) * w + 40, top: (focus ? focus.y / ih : 0.5) * h - 40, transform: `scale(${(0.6 + 0.4 * lp) / z})`, transformOrigin: "0 50%", fontFamily: FONT.zh, fontWeight: 800, fontSize: H * 0.04, color: "#fff", background: "#1E3A5F", padding: "6px 18px", borderRadius: 10, whiteSpace: "nowrap", boxShadow: `0 0 0 3px ${color}` }}>{label}</div>}
      </div>
      {source && <div style={{ position: "absolute", right: 40, bottom: 30, fontFamily: FONT.zh, fontSize: 22, color: "rgba(255,255,255,.6)" }}>{source}</div>}
    </AbsoluteFill>
  );
};

/** 投票弹窗：「评论区打 1 还是 2？」两个选项，说到哪个哪个巨大数字弹出。 */
export const PollPop: React.FC<{ at: number; until: number; question?: string; qy?: number; options: Array<{ n: string; t: string; at: number; color?: string }> }> = ({ at, until, question = "评论区打 1 还是 2？", qy, options }) => {
  const { f, t, W, H } = useT();
  if (t < at || t > until) return null;
  const qp = sp(f, at, 12, 200);
  const cur = [...options].reverse().find((o) => t >= o.at);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 40, right: 40, top: qy ?? H * 0.08, textAlign: "center", transform: `scale(${qp})` }}>
        <span style={{ fontFamily: FONT.zh, fontWeight: 900, fontSize: H * 0.055, color: "#fff", background: "rgba(16,16,20,.82)", padding: "10px 30px", borderRadius: 16 }}>{question}</span>
      </div>
      {options.map((o, k) => {
        if (t < o.at) return null;
        const p = interpolate(f - F(o.at), [0, 6, 11], [0, 1.15, 1], clamp);
        const active = cur === o;
        return (
          <div key={k} style={{ position: "absolute", [k === 0 ? "left" : "right"]: W * 0.08, top: H * 0.28, textAlign: "center", opacity: active ? 1 : 0.45, transform: `scale(${p * (active ? 1 : 0.8)}) rotate(${k ? 6 : -6}deg)` }}>
            <div style={{ fontFamily: FONT.en, fontWeight: 900, fontSize: H * 0.19, color: o.color ?? (k ? C.orange : "#3BD16F"), textShadow: stroke(8, "#fff"), lineHeight: 1 }}>{o.n}</div>
            <div style={{ fontFamily: FONT.zh, fontWeight: 900, fontSize: H * 0.045, color: "#fff", textShadow: stroke(4, "#000"), marginTop: 10 }}>{o.t}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** 故障插屏：0.4–0.6 秒电视测试卡色条 + RGB 错位 + 中间圆形主播 + 一句话（点赞关注）。 */
export const GlitchInterstitial: React.FC<{ at: number; dur?: number; text?: string; host?: string }> = ({ at, dur = 0.5, text = "点赞关注", host }) => {
  const { f, t, W, H } = useT();
  if (t < at || t > at + dur) return null;
  const bars = ["#C0C0C0", "#C0C000", "#00C0C0", "#00C000", "#C000C0", "#C00000", "#0000C0"];
  const jx = (random(`gx${f}`) - 0.5) * 40, rgb = 8 + random(`gr${f}`) * 10;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ display: "flex", transform: `translateX(${jx}px)` }}>{bars.map((c) => <div key={c} style={{ flex: 1, background: c }} />)}</AbsoluteFill>
      {Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ position: "absolute", left: 0, right: 0, top: random(`gl${f}${i}`) * H, height: 6 + random(`gh${f}${i}`) * 30, background: "rgba(255,255,255,.35)", transform: `translateX(${(random(`gs${f}${i}`) - 0.5) * 200}px)` }} />)}
      {host && <div style={{ position: "absolute", left: W / 2 - H * 0.2, top: H * 0.18, width: H * 0.4, height: H * 0.4, borderRadius: "50%", overflow: "hidden", border: "8px solid #fff" }}>{media(host, { width: "100%", height: "100%", objectFit: "cover" })}</div>}
      <div style={{ position: "absolute", left: 0, right: 0, top: H * 0.66, textAlign: "center", fontFamily: FONT.zh, fontWeight: 900, fontSize: H * 0.11, color: "#fff", textShadow: `${rgb}px 0 0 rgba(255,0,60,.85), ${-rgb}px 0 0 rgba(0,220,255,.85), ${stroke(5, "#000")}` }}>{text}</div>
    </AbsoluteFill>
  );
};

/** 人物名牌 + 语录气泡：双层错位名牌（名字 + 职务）+ 药丸气泡逐条弹出。人物用无脸剪影 / AI 形象，不用真实肖像。 */
export const NamePlate: React.FC<{ at: number; until: number; name: string; title?: string; x?: number; y?: number; color?: string; quotes?: Array<{ t: string; at: number }>; qx?: number; qy?: number }> = ({ at, until, name, title, x = 120, y = 640, color = MINT, quotes = [], qx = 980, qy = 260 }) => {
  const { f, t } = useT();
  if (t < at || t > until) return null;
  const w1 = lerp(f, at, at + 0.25, 0, 1, ease.out), w2 = lerp(f, at + 0.1, at + 0.35, 0, 1, ease.out);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: x, top: y, clipPath: `inset(0 ${(1 - w1) * 100}% 0 0)` }}>
        <span style={{ display: "inline-block", fontFamily: FONT.zh, fontWeight: 900, fontSize: 64, color, background: MINT_D, border: `3px solid ${color}`, padding: "4px 22px" }}>{name}</span>
      </div>
      {title && <div style={{ position: "absolute", left: x + 20, top: y + 92, clipPath: `inset(0 ${(1 - w2) * 100}% 0 0)` }}>
        <span style={{ display: "inline-block", fontFamily: FONT.zh, fontWeight: 700, fontSize: 36, color: "#0B1A12", background: color, padding: "4px 18px" }}>{title}</span></div>}
      {quotes.map((q, k) => {
        if (t < q.at) return null;
        const p = sp(f, q.at, 11, 230);
        return <div key={k} style={{ position: "absolute", left: qx + (k % 2) * 60, top: qy + k * 96, transform: `scale(${0.6 + 0.4 * p}) rotate(${(random(`q${k}`) - 0.5) * 6}deg)`, opacity: Math.min(1, p * 1.6), transformOrigin: "0 50%",
          fontFamily: FONT.zh, fontWeight: 700, fontSize: 36, color: "#08140E", background: color, padding: "12px 28px", borderRadius: 999, boxShadow: `0 0 18px ${color}88`, whiteSpace: "nowrap" }}>{q.t}</div>;
      })}
    </AbsoluteFill>
  );
};

/** 主播旁悬浮窗：主播画面上方左右各漂一个浏览器窗口 + 黑底小标签（带红叉/对勾图标）。 */
export const HostFloaters: React.FC<{ at: number; until: number; windows?: Array<{ src: string; pos: "tl" | "tr"; title?: string; at?: number }>; chips?: Array<{ t: string; icon?: "x" | "ok"; at: number; x: number; y: number }> }> = ({ at, until, windows = [], chips = [] }) => {
  const { f, t, W } = useT();
  if (t < at || t > until) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {windows.map((w, k) => {
        const a = w.at ?? at + k * 0.25; const p = sp(f, a, 13, 170);
        const bob = Math.sin((f - F(a)) / 22 + k) * 3;
        const left = w.pos === "tl" ? 60 : W - 60 - W * 0.27;
        return (
          <div key={k} style={{ position: "absolute", left, top: 70 + bob, width: W * 0.27, borderRadius: 12, overflow: "hidden", background: "#fff", boxShadow: "0 24px 50px rgba(0,0,0,.4)", opacity: Math.min(1, p * 1.5),
            transform: `perspective(1200px) rotateY(${w.pos === "tl" ? 8 : -8}deg) translateY(${(1 - p) * 40}px)` }}>
            <div style={{ height: 30, background: "#ECECEC", display: "flex", alignItems: "center", gap: 7, padding: "0 12px" }}>{["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <i key={c} style={{ width: 10, height: 10, borderRadius: 5, background: c }} />)}<span style={{ fontFamily: FONT.zh, fontSize: 16, color: "#777", marginLeft: 8 }}>{w.title}</span></div>
            <Img src={staticFile(w.src)} style={{ width: "100%", display: "block" }} />
          </div>
        );
      })}
      {chips.map((c, k) => t >= c.at && (
        <div key={k} style={{ position: "absolute", left: c.x, top: c.y, display: "flex", alignItems: "center", gap: 10, padding: "8px 18px 8px 10px", borderRadius: 999, background: "rgba(10,10,12,.88)", transform: `scale(${sp(f, c.at, 11, 240)})`, transformOrigin: "0 50%" }}>
          <span style={{ width: 30, height: 30, borderRadius: 7, background: c.icon === "ok" ? C.green : C.red, display: "grid", placeItems: "center", fontFamily: FONT.en, fontWeight: 900, fontSize: 22, color: "#fff" }}>{c.icon === "ok" ? "✓" : "✕"}</span>
          <span style={{ fontFamily: FONT.zh, fontWeight: 700, fontSize: 30, color: "#fff" }}>{c.t}</span>
        </div>
      ))}
    </AbsoluteFill>
  );
};

/** 括号旁白：剪辑师画外吐槽，字幕 80% 字号、楷体、0.85 透明度。 */
export const Aside: React.FC<{ items: Array<{ t: string; at: number; until?: number; x?: number; y?: number }> }> = ({ items }) => {
  const { t, W, H } = useT();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {items.map((a, k) => {
        const end = a.until ?? a.at + 2;
        if (t < a.at || t > end) return null;
        const o = interpolate(t, [a.at, a.at + 0.15, end - 0.15, end], [0, 0.88, 0.88, 0], clamp);
        return <div key={k} style={{ position: "absolute", left: a.x ?? 0, right: a.x === undefined ? 0 : undefined, top: a.y ?? H * 0.82, textAlign: a.x === undefined ? "center" : "left", opacity: o, fontFamily: '"Kaiti SC","STKaiti",serif', fontWeight: 700, fontSize: W > H ? 40 : 46, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,.8)" }}>（{a.t}）</div>;
      })}
    </AbsoluteFill>
  );
};

/** 倾斜金句：整句 −12° 逐字弹出（40 ms 一个字），关键词亮黄。 */
export const TiltLine: React.FC<{ at: number; until: number; text: string; keys?: string[]; size?: number; y?: number; tilt?: number }> = ({ at, until, text, keys = [], size, y, tilt = -12 }) => {
  const { f, t, W, H } = useT();
  if (t < at || t > until) return null;
  const sz = size ?? (W > H ? 88 : 96);
  const hl = new Array(text.length).fill(false);
  keys.forEach((k) => { let i = text.indexOf(k); while (i >= 0) { for (let j = i; j < i + k.length; j++) hl[j] = true; i = text.indexOf(k, i + 1); } });
  const out = lerp(f, until - 0.2, until, 0, 1);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y ?? H * 0.58, display: "flex", justifyContent: "center", transform: `rotate(${tilt}deg)`, opacity: 1 - out }}>
      {Array.from(text).map((c, k) => {
        const a = at + k * 0.04; const p = sp(f, a, 9, 300, 0.45);
        return <span key={k} style={{ display: "inline-block", fontFamily: FONT.zh, fontWeight: 900, fontSize: sz, color: hl[k] ? "#FFE21A" : "#fff", textShadow: stroke(4, "#000"), opacity: f >= F(a) ? 1 : 0, transform: `translateY(${(1 - p) * 24}px) scale(${0.6 + 0.4 * p})` }}>{c}</span>;
      })}
    </div>
  );
};
