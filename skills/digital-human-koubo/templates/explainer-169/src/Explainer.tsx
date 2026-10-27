// 通用「文章讲解」16:9 模板：主播小窗 + 左侧内容区 + 全屏场景段 + 章节进度 + 双语字幕 + 片头卡 + 片尾阵容。
// 内容全部来自数据：episode.json（片名、配色、角色、片头卡）+ tl.json（scripts/build_tl.py 生成：口播片段、逐字时间、每段的 visual）。
// 换一篇文章只改数据，不改这份代码；visual 的类型和字段见 references/visuals.md。
import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, random, spring, staticFile, useCurrentFrame } from "remotion";
import tl from "./tl.json";
import ep from "./episode.json";

/* ================= 数据与主题 ================= */
const FPS = 30;
const F = (s: number) => Math.round(s * FPS);
export const TOTAL = Math.max(F(tl.total), 30);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type Theme = { bg: string[]; accent: string; accent2: string; ink: string; mute: string; good: string; bad: string; info: string; extra: string; backdrop?: string; motif?: string };
const E = ep as unknown as {
  series: string; tag?: string; title: string; subtitle?: string; credits?: string; disclosure?: string;
  theme: string | (Partial<Theme> & { preset?: string }); titleCard?: { after?: string; dur?: number; image?: string; kicker?: string };
  cast: Record<string, { name: string; tag?: string; color?: string; avatar?: string }>;
  music?: { src: string; bed?: number; title?: number }; highlight?: string[];
};
/** 配色预设，和 make_score.py 的情绪一一对应；episode.json 里 "theme": "tech"，或 {"preset": "tech", "accent": "#..."} 覆盖个别颜色 */
const THEMES: Record<string, Theme> = {
  magic: { bg: ["#2A2147", "#14122A", "#0A0A16"], accent: "#E8C36A", accent2: "#F6DFA0", ink: "#F4F1EA", mute: "rgba(244,241,234,.62)", good: "#5FD39A", bad: "#FF6B6B", info: "#6FD6E8", extra: "#B79CFF", backdrop: "stars", motif: "moon" },
  tech:  { bg: ["#0E2A3F", "#0A1626", "#050A12"], accent: "#3FE0FF", accent2: "#A6F3FF", ink: "#EAF6FF", mute: "rgba(234,246,255,.6)", good: "#4BE39A", bad: "#FF5C7A", info: "#7C9BFF", extra: "#C08CFF", backdrop: "grid" },
  warm:  { bg: ["#3A2A1E", "#21170F", "#120C07"], accent: "#FFB45E", accent2: "#FFE0B0", ink: "#FFF6EA", mute: "rgba(255,246,234,.62)", good: "#8FD694", bad: "#FF7B6B", info: "#7FC8E8", extra: "#F59AC0", backdrop: "plain" },
  epic:  { bg: ["#3A1412", "#170808", "#080404"], accent: "#E8B04A", accent2: "#FFD98A", ink: "#FBF3E6", mute: "rgba(251,243,230,.6)", good: "#7FD38A", bad: "#FF4B3E", info: "#8CC8FF", extra: "#FF8A5C", backdrop: "stars" },
};
const T: Theme = typeof E.theme === "string" ? THEMES[E.theme] ?? THEMES.magic : { ...(THEMES[E.theme.preset ?? ""] ?? THEMES.magic), ...E.theme } as Theme;
const ZH = '"PingFang SC","Hiragino Sans GB",sans-serif';
const EN = '"Avenir Next","Helvetica Neue",Arial,sans-serif';
const SERIF = '"Didot","Bodoni 72","Songti SC",Georgia,serif';
const MONO = '"SF Mono",Menlo,monospace';
const GLASS = "rgba(255,255,255,.06)", LINE = `${T.accent}48`;
const PALETTE: Record<string, string> = { accent: T.accent, accent2: T.accent2, good: T.good, bad: T.bad, info: T.info, extra: T.extra, ink: T.ink, mute: T.mute };
const col = (c?: string, d = T.ink) => (c ? PALETTE[c] ?? c : d);

type Line = { text: string; zh?: string; start: number; end: number };
type V = Record<string, any>;
type Item = { kind: string; id: string; host?: string; shot?: string; lang?: string; ch?: string; src?: string; start: number; dur: number; text?: string; chars?: Record<string, number>; lines?: Line[]; visual?: V | V[]; img?: Record<string, [number, number]> };
const ITEMS = tl.items as unknown as Item[];
const NAR = ITEMS.filter((i) => i.kind === "nar");
const BY: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
const CHS: string[] = Array.from(new Set(NAR.map((i) => i.ch).filter((c): c is string => !!c && c !== "开场" && c !== "intro")));
const cur = (t: number) => ITEMS.find((i) => t >= i.start && t < i.start + i.dur + 0.13);
/** 段内时间：at 是数字 = 段首后几秒；是字符串 = 这段口播里那个词开始的时刻；["词", 0.6] = 那个词之后 0.6 秒；不写 = 段首 + dflt 秒 */
const AT = (it: Item, at: unknown, dflt = 0.15): number => {
  if (Array.isArray(at)) return AT(it, at[0], dflt) + (Number(at[1]) || 0);
  if (typeof at === "number") return it.start + at;
  if (typeof at === "string" && it.text) {
    const i0 = it.text.indexOf(at);
    if (i0 >= 0) { let i = i0; while (it.chars![String(i)] === undefined && i < it.text.length) i++; return it.chars![String(i)] ?? it.start + dflt; }
  }
  return it.start + dflt;
};
const sp = (f: number, at: number, damping = 14, stiffness = 160, mass = 0.7) => spring({ frame: f - F(at), fps: FPS, config: { damping, stiffness, mass } });
const appear = (p: number, dy = 30): React.CSSProperties => ({ opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * dy}px)` });
const pop = (p: number): React.CSSProperties => ({ opacity: Math.min(1, p * 1.6), transform: `scale(${0.6 + 0.4 * p})` });
/** 「**重点**」用强调色，「\n」换行 */
const Rich: React.FC<{ s?: string; c?: string }> = ({ s = "", c = T.accent }) => (
  <>{s.split("\n").map((ln, k) => <React.Fragment key={k}>{k > 0 && <br />}{ln.split(/\*\*(.+?)\*\*/g).map((x, j) => j % 2 ? <span key={j} style={{ color: c }}>{x}</span> : <React.Fragment key={j}>{x}</React.Fragment>)}</React.Fragment>)}</>
);
const isAscii = (s: string) => /^[\x00-\x7F]+$/.test(s);

/* ================= 背景 ================= */
const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  const stars = React.useMemo(() => new Array(90).fill(0).map((_, i) => ({ x: random(`x${i}`) * 1920, y: random(`y${i}`) * 1080, r: 0.6 + random(`r${i}`) * 1.8, s: 0.2 + random(`s${i}`) * 0.8, ph: random(`p${i}`) * 6.28 })), []);
  const [b0, b1, b2] = T.bg;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1200px 800px at 75% 10%, ${b0} 0%, ${b1} 45%, ${b2} 100%)` }}>
      {T.backdrop !== "plain" && (
        <svg width={1920} height={1080} style={{ position: "absolute" }}>
          {T.backdrop === "grid"
            ? new Array(25).fill(0).map((_, i) => <line key={i} x1={(i * 80 + f * 0.3) % 1920} y1={0} x2={(i * 80 + f * 0.3) % 1920} y2={1080} stroke={T.accent} strokeOpacity={0.05} />)
            : stars.map((s, i) => <circle key={i} cx={(s.x + f * s.s * 0.15) % 1920} cy={s.y} r={s.r} fill={i % 7 === 0 ? T.accent2 : "#fff"} opacity={0.25 + 0.35 * (0.5 + 0.5 * Math.sin(f / 18 + s.ph))} />)}
        </svg>
      )}
      {T.motif === "moon" && <svg width={260} height={260} style={{ position: "absolute", right: -40, bottom: -60, opacity: 0.08 }} viewBox="0 0 100 100"><path d="M60 8a44 44 0 1 0 32 74A36 36 0 1 1 60 8z" fill={T.accent} /></svg>}
    </AbsoluteFill>
  );
};

/* ================= 布局 ================= */
const PIP = { x: 1462, y: 168, w: 396, h: 704 };
const host = (id?: string) => E.cast[id ?? ""] ?? { name: id ?? "", color: T.accent };

const HostBox: React.FC = () => {
  const f = useCurrentFrame(); const t = f / FPS;
  const it = cur(t);
  if (!it || it.kind !== "nar" || it.shot === "scene") return null;
  const h = host(it.host), c = col(h.color, T.accent);
  const prevPip = ITEMS[ITEMS.indexOf(it) - 1]?.shot === "pip";
  const local = f - F(it.start);
  return (
    <div style={{ position: "absolute", left: PIP.x, top: PIP.y, width: PIP.w, height: PIP.h, ...(prevPip ? {} : appear(sp(f, it.start, 16, 170), 60)) }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 30, overflow: "hidden", background: "#000", boxShadow: `0 0 0 3px ${c}, 0 0 40px ${c}55, 0 30px 80px rgba(0,0,0,.6)` }}>
        <Sequence from={F(it.start)} durationInFrames={F(it.dur) + 4} layout="none">
          {/* 视频轨一律静音：人声单独铺一条 Audio，放两遍会 +6 dB 削波 */}
          <OffthreadVideo src={staticFile(it.src!)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </Sequence>
        <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: interpolate(local, [0, 4], [0.35, 0], clamp) }} />
        <div style={{ position: "absolute", right: 12, top: 12, fontFamily: ZH, fontSize: 15, color: "rgba(255,255,255,.85)", background: "rgba(0,0,0,.4)", padding: "3px 9px", borderRadius: 7 }}>{E.disclosure ?? "AI 生成"}</div>
      </div>
      <div style={{ position: "absolute", left: 18, bottom: -26, display: "flex", alignItems: "center", gap: 10, background: T.bg[1], border: `1.5px solid ${c}`, borderRadius: 14, padding: "8px 16px", ...appear(sp(f, it.start + 0.15), 14) }}>
        <span style={{ fontFamily: SERIF, fontSize: 28, color: c, fontWeight: 700 }}>{h.name}</span>
        {h.tag && <span style={{ fontFamily: ZH, fontSize: 17, color: T.mute }}>{h.tag}</span>}
      </div>
    </div>
  );
};

const SceneClip: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <>
      {NAR.filter((i) => i.shot === "scene").map((it) => {
        const h = host(it.host);
        return (
          <Sequence key={it.id} from={F(it.start)} durationInFrames={F(it.dur) + 4}>
            <AbsoluteFill style={{ opacity: interpolate(f - F(it.start), [0, 6], [0, 1], clamp) }}>
              <OffthreadVideo src={staticFile(it.src!)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 70%, rgba(0,0,0,.55) 100%)" }} />
              <div style={{ position: "absolute", left: 54, top: 46, display: "flex", gap: 12, alignItems: "center", ...appear(sp(f, it.start + 0.3), 16) }}>
                <div style={{ width: 10, height: 34, background: col(h.color, T.accent), borderRadius: 4 }} />
                <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 34, color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,.6)" }}>{h.name}</span>
                <span style={{ fontFamily: ZH, fontSize: 18, color: "rgba(255,255,255,.8)", background: "rgba(0,0,0,.35)", padding: "3px 10px", borderRadius: 8 }}>{E.disclosure ?? "AI 生成"}</span>
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </>
  );
};

const TopBar: React.FC = () => {
  const f = useCurrentFrame(); const t = f / FPS;
  const it = cur(t) ?? ITEMS[0];
  if (!it || it.kind === "title" || it.shot === "scene") return null;
  const k = CHS.indexOf(it.ch ?? "");
  return (
    <div style={{ position: "absolute", left: 64, right: 60, top: 42, display: "flex", alignItems: "center", justifyContent: "space-between", opacity: sp(f, 0.2, 16, 120) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {T.motif === "moon" && <svg width={30} height={30} viewBox="0 0 100 100"><path d="M60 8a44 44 0 1 0 32 74A36 36 0 1 1 60 8z" fill={T.accent} /></svg>}
        <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 30, color: T.accent2, letterSpacing: 1 }}>{E.series}</span>
        {E.tag && <span style={{ fontFamily: ZH, fontWeight: 600, fontSize: 20, color: T.bg[1], background: T.accent, padding: "4px 12px", borderRadius: 8 }}>{E.tag}</span>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {CHS.map((c, i) => {
          const on = i === k, done = k > i;
          return <div key={c} style={{ fontFamily: ZH, fontWeight: 600, fontSize: CHS.length > 6 ? 15 : 17, padding: "6px 12px", borderRadius: 999, color: on ? T.bg[1] : done ? T.accent : T.mute,
            background: on ? T.accent : done ? `${T.accent}1f` : "rgba(255,255,255,.06)", transform: `scale(${on ? 1.06 : 1})` }}>{c}</div>;
        })}
      </div>
    </div>
  );
};

/* ================= 字幕（英文段双语） ================= */
const HL = E.highlight ?? [];
const Hi: React.FC<{ text: string }> = ({ text }) => {
  const segs: Array<{ s: string; h: boolean }> = []; let rest = text;
  while (rest) {
    let best = -1, w = "";
    for (const h of HL) { const i = rest.indexOf(h); if (i >= 0 && (best < 0 || i < best || (i === best && h.length > w.length))) { best = i; w = h; } }
    if (best < 0) { segs.push({ s: rest, h: false }); break; }
    if (best) segs.push({ s: rest.slice(0, best), h: false });
    segs.push({ s: w, h: true }); rest = rest.slice(best + w.length);
  }
  return <>{segs.map((x, i) => <span key={i} style={{ color: x.h ? T.accent2 : "#fff" }}>{x.s}</span>)}</>;
};
const Subs: React.FC = () => {
  const f = useCurrentFrame(); const t = f / FPS;
  const it = cur(t);
  if (!it || it.kind !== "nar") return null;
  const ln = it.lines!.find((l) => t >= l.start && t < l.end);
  if (!ln) return null;
  const pip = it.shot !== "scene", en = it.lang !== "zh";
  return (
    <div style={{ position: "absolute", left: pip ? 64 : 0, width: pip ? 1360 : 1920, bottom: 34, display: "flex", justifyContent: "center" }}>
      <div style={{ background: "rgba(8,8,18,.78)", border: `1px solid ${LINE}`, padding: en ? "8px 28px 10px" : "8px 30px", borderRadius: 14, maxWidth: 1340, textAlign: "center" }}>
        <div style={{ fontFamily: en ? EN : ZH, fontWeight: 600, fontSize: en ? 36 : 40, color: "#fff", lineHeight: 1.3 }}><Hi text={ln.text} /></div>
        {en && ln.zh && <div style={{ fontFamily: ZH, fontSize: 26, color: "rgba(255,255,255,.72)", marginTop: 2 }}>{ln.zh}</div>}
      </div>
    </div>
  );
};

/* ================= 基础组件 ================= */
const Card: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode; glow?: string }> = ({ style, children, glow }) => (
  <div style={{ position: "absolute", background: GLASS, borderRadius: 26, border: `1px solid ${glow ?? LINE}`, boxShadow: `0 24px 70px rgba(0,0,0,.45)${glow ? `, 0 0 40px ${glow}33` : ""}`, overflow: "hidden", ...style }}>{children}</div>
);
const Chip: React.FC<{ text: string; color?: string; size?: number; bg?: string }> = ({ text, color, size = 26, bg = "rgba(255,255,255,.08)" }) => {
  const c = col(color);
  return <span style={{ display: "inline-block", fontFamily: isAscii(text) ? EN : ZH, fontWeight: 600, fontSize: size, padding: "7px 16px", borderRadius: 12, background: bg, color: c, border: `1px solid ${c}44` }}>{text}</span>;
};
const Typed: React.FC<{ f: number; at: number; text: string; cps?: number }> = ({ f, at, text, cps = 40 }) => {
  if (f < F(at)) return null;
  const n = Math.max(0, Math.floor(((f - F(at)) / FPS) * cps));
  return <>{text.slice(0, n)}{n < text.length && f % 14 < 8 ? "▍" : ""}</>;
};
const Count: React.FC<{ f: number; at: number; from: number; to: number; dur?: number; dec?: number }> = ({ f, at, from, to, dur = 0.9, dec = 0 }) => {
  const v = interpolate(f, [F(at), F(at + dur)], [from, to], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
  return <>{dec ? v.toFixed(dec) : Math.round(v).toLocaleString()}</>;
};
const Stamp: React.FC<{ f: number; at: number; text: string; x: number; y: number; color?: string }> = ({ f, at, text, x, y, color }) => {
  if (f < F(at)) return null;
  const p = sp(f, at, 9, 260, 0.6), c = col(color, T.bad);
  return <div style={{ position: "absolute", left: x, top: y, transform: `rotate(-10deg) scale(${2.2 - 1.2 * p})`, opacity: Math.min(1, p * 2), fontFamily: ZH, fontWeight: 900, fontSize: 64, color: c, border: `6px solid ${c}`, borderRadius: 16, padding: "4px 22px", background: "rgba(10,10,22,.6)", boxShadow: `0 0 30px ${c}66`, whiteSpace: "nowrap" }}>{text}</div>;
};
const Sparkles: React.FC<{ f: number; at: number; n?: number; x: number; y: number }> = ({ f, at, n = 30, x, y }) => {
  if (f < F(at)) return null;
  const l = f - F(at);
  return <>{new Array(n).fill(0).map((_, i) => {
    const a = random(`a${i}`) * Math.PI * 2, d = l * (6 + random(`v${i}`) * 10);
    return <div key={i} style={{ position: "absolute", left: x + Math.cos(a) * d, top: y + Math.sin(a) * d + 0.075 * l * l, width: 10, height: 10, borderRadius: 5, background: [T.accent, T.extra, T.info, "#fff"][i % 4], opacity: interpolate(l, [0, 40], [1, 0], clamp) }} />;
  })}</>;
};

/** 图片：按真实尺寸（build_tl 量好放在 it.img 里）在框里等比放；crop = 原图像素 [x, y, w, h] 只显示那一块；
 *  marks = 圈重点 [{rect: 原图像素 [x, y, w, h], at, color, text}] */
const Picture: React.FC<{ it: Item; src: string; box: { x: number; y: number; w: number; h: number }; at: number; label?: string; crop?: number[]; glow?: string; align?: "center" | "left"; marks?: V[] }> = ({ it, src, box, at, label, crop, glow, align = "center", marks }) => {
  const f = useCurrentFrame();
  if (f < F(at) - 2) return null;
  const [iw, ih] = it.img?.[src] ?? [1600, 900];
  const [cx, cy, cw, ch] = crop ?? [0, 0, iw, ih];
  const k = Math.min(box.w / cw, box.h / ch), w = cw * k, h = ch * k;
  const x = align === "left" ? box.x : box.x + (box.w - w) / 2, y = box.y + (box.h - h) / 2;
  const kb = interpolate(f - F(at), [0, 240], [1.0, 1.03], clamp);
  return (
    <Card glow={glow} style={{ left: x, top: y, width: w, height: h, background: "#fff", ...appear(sp(f, at, 15, 150), 40) }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <Img src={staticFile(src)} style={{ position: "absolute", width: iw * k, height: ih * k, left: -cx * k, top: -cy * k, transform: `scale(${kb})`, transformOrigin: "center" }} />
      </div>
      {label && <div style={{ position: "absolute", left: 16, top: 14, fontFamily: ZH, fontWeight: 700, fontSize: 22, color: T.bg[1], background: T.accent, padding: "4px 12px", borderRadius: 8 }}>{label}</div>}
      {marks?.map((m, i) => {
        const ma = AT(it, m.at, 1 + i * 0.6), c = col(m.color, T.bad), [rx, ry, rw, rh] = m.rect as number[];
        return f >= F(ma) && (
          <div key={i} style={{ position: "absolute", left: (rx - cx) * k, top: (ry - cy) * k, width: rw * k, height: rh * k, border: `4px dashed ${c}`, borderRadius: 14, boxShadow: `0 0 24px ${c}66`, ...pop(sp(f, ma, 10, 220)) }}>
            {m.text && <span style={{ position: "absolute", left: 10, top: 10, whiteSpace: "nowrap", fontFamily: ZH, fontWeight: 800, fontSize: 26, color: "#fff", background: c, padding: "4px 12px", borderRadius: 8 }}>{m.text}</span>}
          </div>);
      })}
    </Card>
  );
};
const Chips: React.FC<{ it: Item; chips?: V[]; x: number; y: number; size?: number; w?: number }> = ({ it, chips, x, y, size = 28, w = 1300 }) => {
  const f = useCurrentFrame();
  if (!chips?.length) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, display: "flex", flexWrap: "wrap", gap: 14 }}>
      {chips.map((c, i) => { const at = AT(it, c.at, 0.4 + i * 0.4); return f >= F(at) - 1 && <span key={i} style={appear(sp(f, at, 12, 200), 16)}><Chip text={c.text} color={c.color} size={c.size ?? size} /></span>; })}
    </div>
  );
};

/* ================= visual 渲染（pip 段画在左侧内容区，scene 段叠在画面上） ================= */
const AREA = { x: 90, y: 180, w: 1260, h: 600 };
const Visual: React.FC<{ it: Item }> = ({ it }) => {
  const f = useCurrentFrame();
  const v = it.visual as V; if (!v) return null;
  // 数组 = 同一段叠几个组件（比如左边配图、右边数据卡），各自用 box 摆位置
  if (Array.isArray(v)) return <>{v.map((x, k) => <Visual key={k} it={{ ...it, visual: x }} />)}</>;
  const t0 = AT(it, v.at, 0.1);
  const scene = it.shot === "scene";
  const box = { ...AREA, ...(v.box ?? {}) };
  switch (v.type) {
    case "big": {
      const y = v.y ?? (scene ? 150 : 200);
      return (
        <div style={{ position: "absolute", left: scene ? 60 : 90, top: y, width: scene ? 900 : 1260, ...appear(sp(f, t0, 14, 150), 40) }}>
          {v.kicker && <div style={{ fontFamily: isAscii(v.kicker) ? EN : ZH, fontWeight: 600, fontSize: 30, color: T.accent, marginBottom: 14, letterSpacing: 2 }}>{v.kicker}</div>}
          <div style={{ fontFamily: v.serif ? SERIF : ZH, fontStyle: v.serif ? "italic" : "normal", fontWeight: 800, fontSize: v.size ?? 88, lineHeight: 1.2, color: T.ink, textShadow: scene ? "0 4px 20px rgba(0,0,0,.7)" : undefined }}><Rich s={v.title} /></div>
          {v.sub && <div style={{ fontFamily: ZH, fontSize: 32, color: T.mute, marginTop: 20, lineHeight: 1.5 }}><Rich s={v.sub} /></div>}
          {v.cards && <div style={{ display: "flex", gap: 22, marginTop: 44, flexWrap: "wrap" }}>
            {(v.cards as V[]).map((c, i) => { const at = AT(it, c.at, 0.5 + i * 0.5); return (
              <div key={i} style={{ ...appear(sp(f, at, 12, 200)), opacity: f >= F(at) ? 1 : 0, background: GLASS, border: `1px solid ${col(c.color, T.accent)}88`, borderRadius: 22, padding: "22px 28px", width: c.w ?? 560 }}>
                <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 34, color: col(c.color, T.accent) }}><Rich s={c.title} /></div>
                {c.sub && <div style={{ fontFamily: ZH, fontSize: 25, color: T.ink, marginTop: 8, lineHeight: 1.5 }}><Rich s={c.sub} /></div>}
              </div>); })}
          </div>}
          {v.chips && <div style={{ position: "relative", height: 70, marginTop: 34 }}><Chips it={it} chips={v.chips} x={0} y={0} size={32} /></div>}
        </div>
      );
    }
    case "image": {
      const below = !!(v.chips?.length);
      const b = below ? { ...box, h: box.h - 70 } : box;
      return (
        <>
          <Picture it={it} src={v.src} box={b} at={t0} label={v.label} crop={v.crop} marks={v.marks} align={v.align} />
          <Chips it={it} chips={v.chips} x={box.x} y={b.y + b.h + 24} />
          {v.stamp && <Stamp f={f} at={AT(it, v.stamp.at, 1)} text={v.stamp.text} color={v.stamp.color} x={box.x + box.w * (v.stamp.x ?? 0.6)} y={box.y + box.h * (v.stamp.y ?? 0.62)} />}
          {v.shout && <Shout it={it} v={v.shout} y={b.y + b.h - 40} />}
        </>
      );
    }
    case "images": {
      const items = v.items as V[], n = items.length, vertical = v.layout === "rows", gap = 26;
      return <>{items.map((c, i) => {
        const at = AT(it, c.at, 0.2 + i * 0.6), cc = col(c.color, [T.good, T.accent, T.info][i % 3]);
        const cb = vertical ? { x: box.x, y: box.y + i * ((box.h + gap) / n), w: box.w, h: (box.h - gap * (n - 1)) / n }
                            : { x: box.x + i * ((box.w + gap) / n), y: box.y, w: (box.w - gap * (n - 1)) / n, h: box.h - 90 };
        return (
          <React.Fragment key={i}>
            <Picture it={it} src={c.src} box={cb} at={at} crop={c.crop} glow={cc} />
            {f >= F(at) && <div style={{ position: "absolute", left: cb.x + (vertical ? 18 : 0), top: vertical ? cb.y + cb.h - 56 : cb.y + cb.h + 16, width: cb.w, textAlign: vertical ? "left" : "center", ...appear(sp(f, at + 0.1), 14) }}>
              <span style={{ fontFamily: ZH, fontWeight: 800, fontSize: 32, color: cc, background: vertical ? "rgba(10,10,22,.8)" : "transparent", padding: vertical ? "4px 14px" : 0, borderRadius: 10 }}>{c.title}</span>
              {c.sub && <span style={{ fontFamily: ZH, fontSize: 24, color: T.mute, marginLeft: 12, background: vertical ? "rgba(10,10,22,.8)" : "transparent", padding: vertical ? "4px 10px" : 0, borderRadius: 8 }}>{c.sub}</span>}
            </div>}
          </React.Fragment>
        );
      })}</>;
    }
    case "stats": {
      const pos = v.pos ?? (scene ? "bottom" : "center");
      const style: React.CSSProperties = v.box ? { left: box.x, top: box.y } : pos === "bottom" ? { left: 54, bottom: 150 } : { left: 90, top: 300 };
      return (
        <div style={{ position: "absolute", display: "flex", gap: 18, flexWrap: "wrap", flexDirection: v.column ? "column" : "row", width: v.box ? box.w : pos === "bottom" ? 1800 : 1280, ...style }}>
          {(v.items as V[]).map((s, i) => { const at = AT(it, s.at, 0.3 + i * 0.5), c = col(s.color, T.accent2); return (
            <div key={i} style={{ ...appear(sp(f, at, 12, 200), 30), opacity: f >= F(at) - 1 ? 1 : 0, background: "rgba(10,10,22,.72)", border: `1px solid ${s.color ? c : LINE}`, borderRadius: 20, padding: "16px 24px", minWidth: 250 }}>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: pos === "bottom" ? 46 : 64, color: c }}>
                {s.count ? <><Count f={f} at={at} from={s.count[0]} to={s.count[1]} dec={s.dec} />{s.suffix ?? ""}</> : s.value}
              </div>
              <div style={{ fontFamily: ZH, fontSize: 22, color: T.mute, marginTop: 4 }}>{s.label}</div>
            </div>); })}
        </div>
      );
    }
    case "terminal": {
      const lines = v.lines as V[];
      const b = { x: box.x, y: v.y ?? box.y, w: box.w, h: v.h ?? 40 + 46 + lines.length * 42 + 36 };
      return (
        <Card style={{ left: b.x, top: b.y, width: b.w, height: b.h, background: "#0B0B14", ...appear(sp(f, t0)) }}>
          <div style={{ height: 46, display: "flex", alignItems: "center", gap: 9, padding: "0 18px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
            <span style={{ fontFamily: MONO, fontSize: 18, color: "rgba(255,255,255,.5)", marginLeft: 12 }}>{v.title}</span>
          </div>
          <div style={{ padding: "18px 26px", display: "flex", flexDirection: "column", gap: 12 }}>
            {lines.map((l, k) => { const at = AT(it, l.at, 0.2 + k * 0.8); return f >= F(at) && (
              <div key={k} style={{ fontFamily: MONO, fontSize: 24, color: col(l.color, "#EDEBE4"), whiteSpace: "pre" }}>
                {l.prompt !== false && !l.out && <span style={{ color: T.accent }}>{"$ "}</span>}<Typed f={f} at={at} text={l.text} cps={45} />
              </div>); })}
          </div>
        </Card>
      );
    }
    case "list": {
      const items = v.items as V[];
      return (
        <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w }}>
          {v.title && <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 60, color: T.ink, marginBottom: 30, ...appear(sp(f, t0)) }}><Rich s={v.title} /></div>}
          {items.map((c, i) => { const at = AT(it, c.at, 0.5 + i * 0.6); return f >= F(at) - 1 && (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 18, marginBottom: 22, ...appear(sp(f, at, 12, 200), 20) }}>
              <span style={{ fontFamily: SERIF, fontSize: 40, color: col(c.color, T.accent), minWidth: 50 }}>{v.numbered ? `${i + 1}.` : "✓"}</span>
              <span style={{ fontFamily: ZH, fontSize: 40, color: T.ink, lineHeight: 1.4 }}><Rich s={c.text} />{c.sub && <span style={{ fontSize: 26, color: T.mute, marginLeft: 14 }}>{c.sub}</span>}</span>
            </div>); })}
        </div>
      );
    }
    case "quote": return (
      <div style={{ position: "absolute", left: scene ? 60 : box.x, top: v.y ?? (scene ? 160 : 300), width: scene ? 1000 : box.w, ...appear(sp(f, t0, 12, 180)) }}>
        <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: v.size ?? 72, color: T.accent2, lineHeight: 1.3, textShadow: scene ? "0 4px 20px rgba(0,0,0,.7)" : undefined }}>“{v.text}”</div>
        {v.by && <div style={{ fontFamily: ZH, fontSize: 30, color: T.mute, marginTop: 20 }}>—— {v.by}</div>}
      </div>
    );
    case "flow": {
      const steps = v.steps as V[], n = steps.length, gap = 70, w = (box.w - gap * (n - 1)) / n;
      return (
        <>
          {v.title && <div style={{ position: "absolute", left: box.x, top: box.y, fontFamily: ZH, fontWeight: 800, fontSize: 56, color: T.ink, ...appear(sp(f, t0)) }}><Rich s={v.title} /></div>}
          {steps.map((s, i) => { const at = AT(it, s.at, 0.4 + i * 0.7), x = box.x + i * (w + gap), y = box.y + (v.title ? 140 : 60); return (
            <React.Fragment key={i}>
              {i > 0 && f >= F(at) - 6 && <div style={{ position: "absolute", left: x - gap + 12, top: y + 160, fontFamily: SERIF, fontSize: 56, color: T.accent, ...appear(sp(f, at - 0.2)) }}>→</div>}
              <Card glow={s.color ? col(s.color) : undefined} style={{ left: x, top: y, width: w, height: 400, padding: 24, opacity: f >= F(at) - 1 ? 1 : 0, ...appear(sp(f, at), 30) }}>
                {s.img && <Img src={staticFile(s.img)} style={{ width: "100%", height: 220, objectFit: "cover", objectPosition: s.imgPos ?? "center 22%", borderRadius: 14, marginBottom: 16 }} />}
                {s.code && <div style={{ fontFamily: MONO, fontSize: 21, color: T.info, background: "#0B0B14", borderRadius: 12, padding: "14px 16px", whiteSpace: "pre-wrap", marginBottom: 16, lineHeight: 1.5 }}>{s.code}</div>}
                <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 34, color: col(s.color, T.accent2) }}><Rich s={s.title} /></div>
                {s.sub && <div style={{ fontFamily: ZH, fontSize: 24, color: T.mute, marginTop: 8, lineHeight: 1.5 }}><Rich s={s.sub} /></div>}
              </Card>
            </React.Fragment>); })}
        </>
      );
    }
    case "tags": {
      const items = v.items as V[];
      return (
        <div style={{ position: "absolute", left: box.x, top: box.y + 20, width: box.w }}>
          {v.title && <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 72, color: T.ink, marginBottom: 44, ...appear(sp(f, t0)) }}>{v.kicker && <div style={{ fontSize: 30, color: T.accent, marginBottom: 12 }}>{v.kicker}</div>}<Rich s={v.title} /></div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {items.map((c, i) => { const at = AT(it, c.at, 0.5 + i * 0.4), cc = col(c.color, [T.bad, T.info, T.extra, T.good, T.accent][i % 5]); return (
              <div key={i} style={{ ...pop(sp(f, at, 10, 220)), opacity: f >= F(at) - 1 ? 1 : 0, display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontFamily: v.mono === false ? ZH : MONO, fontSize: 30, color: cc, background: `${cc}18`, border: `1.5px solid ${cc}88`, borderRadius: 12, padding: "10px 18px" }}>{c.text}</span>
                {c.label && <span style={{ fontFamily: ZH, fontSize: 22, color: T.mute, textAlign: "center" }}>{c.label}</span>}
              </div>); })}
          </div>
        </div>
      );
    }
    case "bars": {
      const items = v.items as V[], max = v.max ?? Math.max(...items.map((b) => b.value));
      return (
        <Card style={{ left: box.x, top: box.y, width: v.w ?? box.w, padding: "28px 34px", ...appear(sp(f, t0)) }}>
          {v.title && <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 40, color: T.accent }}><Rich s={v.title} /></div>}
          {items.map((b, i) => { const at = AT(it, b.at, 0.4 + i * 0.6); return (
            <div key={i} style={{ marginTop: 26 }}>
              <div style={{ fontFamily: ZH, fontSize: 28, color: T.ink }}>{b.label}{b.text && <span style={{ color: T.mute, marginLeft: 12 }}>{b.text}</span>}</div>
              <div style={{ marginTop: 10, height: 30, borderRadius: 15, background: "rgba(255,255,255,.08)" }}>
                <div style={{ height: 30, borderRadius: 15, background: col(b.color, [T.info, T.accent, T.good][i % 3]), width: `${interpolate(f, [F(at), F(at + 0.8)], [0, (b.value / max) * 100], clamp)}%` }} />
              </div>
            </div>); })}
          {v.note && f >= F(AT(it, v.note.at, 2)) && <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 40, color: col(v.note.color, T.bad), marginTop: 30, ...pop(sp(f, AT(it, v.note.at, 2))) }}>{v.note.text}</div>}
        </Card>
      );
    }
    case "card": {
      const pos = v.pos ?? (scene ? "left" : "center");
      const L = pos === "right" ? 1230 : pos === "center" ? 300 : 50;
      return (
        <Card style={{ left: v.box ? box.x : L, top: v.box ? box.y : v.y ?? 140, width: v.box ? box.w : v.w ?? 640, padding: "24px 30px", background: "rgba(10,10,22,.78)", ...appear(sp(f, t0)) }}>
          {v.title && <div style={{ fontFamily: isAscii(v.title) ? MONO : ZH, fontWeight: 700, fontSize: 28, color: T.accent2 }}>{v.title}</div>}
          {v.code && <div style={{ fontFamily: MONO, fontSize: 24, color: T.ink, marginTop: 12, lineHeight: 1.6 }}>
            {v.code.hi && <span style={{ color: f >= F(AT(it, v.code.hiAt, 1)) ? T.bg[1] : T.ink, background: f >= F(AT(it, v.code.hiAt, 1)) ? T.accent : "transparent", borderRadius: 6, padding: "0 6px" }}>{v.code.hi}</span>}
            <Typed f={f} at={AT(it, v.code.at, 1)} text={v.code.text} cps={34} />
          </div>}
          {(v.lines as V[] | undefined)?.map((l, i) => { const at = AT(it, l.at, 0.5 + i * 0.5); return (
            <div key={i} style={{ fontFamily: ZH, fontSize: 28, color: T.ink, marginTop: 12, opacity: f >= F(at) ? 1 : 0, ...appear(sp(f, at), 14) }}><span style={{ color: T.good }}>{l.mark ?? "✓"} </span><Rich s={l.text} /></div>); })}
        </Card>
      );
    }
    case "shout": return <Shout it={it} v={v} y={v.y ?? (scene ? 860 : 640)} />;
    case "end": {
      const ids = (v.cast as string[] | undefined) ?? Object.keys(E.cast);
      return (
        <div style={{ position: "absolute", left: 90, top: 190, width: 1260, ...appear(sp(f, t0)) }}>
          <div style={{ fontFamily: ZH, fontWeight: 600, fontSize: 30, color: T.accent, letterSpacing: 2 }}>{v.kicker ?? "THE END · 本片角色全部由 AI 生成"}</div>
          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 800, fontSize: 96, color: T.accent2, marginTop: 10 }}>{v.title}</div>
          <div style={{ display: "flex", gap: 26, marginTop: 40 }}>
            {ids.map((id, i) => { const h = host(id), c = col(h.color, T.accent); return (
              <div key={id} style={{ ...appear(sp(f, t0 + 0.3 + i * 0.25, 12, 200)), textAlign: "center" }}>
                {h.avatar && <div style={{ width: 200, height: 200, borderRadius: 100, overflow: "hidden", boxShadow: `0 0 0 4px ${c}, 0 0 30px ${c}66` }}><Img src={staticFile(h.avatar)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 22%" }} /></div>}
                <div style={{ fontFamily: SERIF, fontSize: 30, color: c, marginTop: 14 }}>{h.name}</div>
              </div>); })}
          </div>
          {E.credits && <div style={{ fontFamily: MONO, fontSize: 26, color: T.mute, marginTop: 34 }}>{E.credits}</div>}
        </div>
      );
    }
    default: return null;
  }
};
const Shout: React.FC<{ it: Item; v: V; y: number }> = ({ it, v, y }) => {
  const f = useCurrentFrame(); const at = AT(it, v.at, 0.2), c = col(v.color, T.extra);
  if (f < F(at)) return null;
  const scene = it.shot === "scene";
  return (
    <>
      <div style={{ position: "absolute", left: 0, width: scene ? 1920 : 1424, top: y, textAlign: "center", ...pop(sp(f, at, 8, 220)) }}>
        <span style={{ fontFamily: ZH, fontWeight: 900, fontSize: v.size ?? 92, color: "#fff", WebkitTextStroke: `2px ${c}`, textShadow: `0 0 28px ${c}, 0 6px 0 rgba(0,0,0,.45)` }}>{v.text}</span>
      </div>
      {v.sparkle !== false && <Sparkles f={f} at={at + 0.1} x={scene ? 960 : 712} y={y + 60} n={40} />}
    </>
  );
};

/* ================= 片头标题卡 ================= */
const Title: React.FC<{ at: number; dur: number }> = ({ at, dur }) => {
  const f = useCurrentFrame();
  const l = f - F(at), p = sp(f, at + 0.15, 16, 110);
  const tc = E.titleCard ?? {};
  return (
    <AbsoluteFill style={{ opacity: interpolate(l, [F(dur) - 8, F(dur)], [1, 0], clamp) }}>
      <AbsoluteFill style={{ background: `radial-gradient(900px 600px at 50% 45%, ${T.bg[0]} 0%, ${T.bg[2]} 75%)` }} />
      {tc.image && <Img src={staticFile(tc.image)} style={{ position: "absolute", left: 0, top: 120, width: 1920, height: 768, objectFit: "cover", opacity: 0.32 * p, transform: `scale(${1.08 - 0.06 * p})` }} />}
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <circle cx={960} cy={470} r={300 + 20 * Math.sin(l / 10)} fill="none" stroke={T.accent} strokeWidth={2} strokeDasharray="6 14" opacity={0.6 * p} transform={`rotate(${l * 0.6} 960 470)`} />
        <circle cx={960} cy={470} r={340} fill="none" stroke={T.accent} strokeWidth={1} opacity={0.25 * p} />
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: 330, textAlign: "center", ...appear(p, 40) }}>
        <div style={{ fontFamily: ZH, fontWeight: 600, fontSize: 32, color: T.accent, letterSpacing: 10 }}>{tc.kicker ?? `${E.series}${E.tag ? " · " + E.tag : ""}`}</div>
        <div style={{ fontFamily: ZH, fontWeight: 900, fontSize: E.title.length > 12 ? 96 : 120, color: "#fff", marginTop: 16, textShadow: `0 0 40px ${T.accent}55` }}>{E.title}</div>
        {E.subtitle && <div style={{ fontFamily: ZH, fontSize: 38, color: T.accent2, marginTop: 22 }}>{E.subtitle}</div>}
      </div>
      <Sparkles f={f} at={at + 0.2} x={960} y={470} n={36} />
    </AbsoluteFill>
  );
};

/* ================= 音效 ================= */
const SFX: Array<[string, number, number]> = (() => {
  const out: Array<[string, number, number]> = [];
  ITEMS.forEach((it, i) => {
    if (i === 0 || it.kind !== "nar") return;
    if (it.shot === "scene" || ITEMS[i - 1].shot === "scene") out.push(["sfx/whoosh.wav", it.start - 0.15, 0.35]);
    else if (ITEMS[i - 1].host !== it.host) out.push(["sfx/swish-1.wav", it.start - 0.05, 0.25]);
    for (const v of ([] as V[]).concat(it.visual ?? [])) {
    if (v?.stamp) out.push(["sfx/slam-1.wav", AT(it, v.stamp.at, 1), 0.5]);
    if (v?.type === "shout" || v?.shout) out.push(["sfx/ding.wav", AT(it, (v.shout ?? v).at, 0.2), 0.4]);
    if (v?.type === "stats") (v.items as V[]).forEach((s, k) => s.count && out.push(["sfx/pop.wav", AT(it, s.at, 0.3 + k * 0.5), 0.3]));
    }
  });
  const ttl = ITEMS.find((i) => i.kind === "title");
  if (ttl) out.push(["sfx/riser.wav", ttl.start - 0.4, 0.4], ["sfx/impact.wav", ttl.start + 0.2, 0.45]);
  return out;
})();

export const Explainer: React.FC = () => {
  const f = useCurrentFrame(); const t = f / FPS;
  const ttl = ITEMS.find((i) => i.kind === "title");
  const m = E.music ?? { src: "music/score.mp3" };
  return (
    <AbsoluteFill style={{ background: T.bg[2] }}>
      <Backdrop />
      <SceneClip />
      {/* visual 按整片绝对时间挂（AT() 返回的是绝对秒），不能套 Sequence 改帧号 */}
      {NAR.filter((i) => t >= i.start - 0.07 && t < i.start + i.dur + 0.13).map((i) => <Visual key={`v-${i.id}`} it={i} />)}
      <HostBox />
      <TopBar />
      <Subs />
      {ttl && t >= ttl.start && t < ttl.start + ttl.dur && <Title at={ttl.start} dur={ttl.dur} />}
      {NAR.map((i) => <Sequence key={`a-${i.id}`} from={F(i.start)} durationInFrames={F(i.dur) + 2}><Audio src={staticFile(i.src!)} /></Sequence>)}
      <Audio src={staticFile(m.src)} loop volume={(fr) => {
        const tt = fr / FPS, on = ttl && tt >= ttl.start - 0.3 && tt < ttl.start + ttl.dur;
        return interpolate(fr, [0, 30, TOTAL - 45, TOTAL], [0, 1, 1, 0], clamp) * (on ? m.title ?? 0.6 : m.bed ?? 0.14);
      }} />
      {SFX.map(([s, at, v], k) => <Sequence key={`s${k}`} from={Math.max(0, F(at))} durationInFrames={45}><Audio src={staticFile(s)} volume={v} /></Sequence>)}
    </AbsoluteFill>
  );
};
