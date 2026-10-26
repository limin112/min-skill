// MOSS 魔法学院 · 第一课：你的专属「女友马尔福」—— MOSS-Image 人物 LoRA × 本地数字人口播（16:9）
// 时间轴来自 tl.json（tools/build_tl.py 生成：H3 口播片段 + 逐字时间 + 片头标题卡）
import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, random } from "remotion";
import tl from "./tl.json";

const FPS = 30;
const F = (s: number) => Math.round(s * FPS);
export const TOTAL = F(tl.total);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ZH = '"PingFang SC","Hiragino Sans GB",sans-serif';
const EN = '"Avenir Next","Helvetica Neue",Arial,sans-serif';
const SERIF = '"Didot","Bodoni 72","Songti SC",Georgia,serif';
const MONO = '"SF Mono",Menlo,monospace';
const GOLD = "#E8C36A", GOLD2 = "#F6DFA0", INK = "#F4F1EA", MUTE = "rgba(244,241,234,.62)", GREEN = "#5FD39A", RED = "#FF6B6B", TEAL = "#6FD6E8", PURPLE = "#B79CFF";
const GLASS = "rgba(255,255,255,.06)", LINE = "rgba(232,195,106,.28)";

type Line = { text: string; zh?: string; start: number; end: number };
type Item = { kind: string; id: string; host?: string; shot?: string; lang?: string; ch: string; src?: string; start: number; dur: number; text?: string; chars?: Record<string, number>; lines?: Line[] };
const ITEMS = tl.items as unknown as Item[];
const BY: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
const has = (id: string) => !!BY[id];
const ST = (id: string) => (BY[id] ? BY[id].start : 0);
const EN_ = (id: string) => (BY[id] ? BY[id].start + BY[id].dur : 0);
/** 某段口播里某个词开始的绝对秒数（找不到就退回段首，免得一处改稿全片崩） */
const W = (id: string, word: string, off = 0) => {
  const it = BY[id]; if (!it) return 0;
  const i0 = it.text!.indexOf(word);
  if (i0 < 0) return it.start + off;
  let i = i0; while (it.chars![String(i)] === undefined && i < it.text!.length) i++;
  return (it.chars![String(i)] ?? it.start) + off;
};
const sp = (f: number, at: number, damping = 14, stiffness = 160, mass = 0.7) => spring({ frame: f - F(at), fps: FPS, config: { damping, stiffness, mass } });
const appear = (p: number, dy = 30): React.CSSProperties => ({ opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * dy}px)` });
const pop = (p: number): React.CSSProperties => ({ opacity: Math.min(1, p * 1.6), transform: `scale(${0.6 + 0.4 * p})` });
const cur = (t: number) => ITEMS.find((i) => t >= i.start && t < i.start + i.dur + 0.13);

const HOSTS: Record<string, { name: string; tag: string; color: string }> = {
  moss: { name: "Moss", tag: "主讲 · moss01 LoRA", color: GOLD },
  oliver: { name: "Oliver", tag: "搭档 · 黑框眼镜", color: TEAL },
  hoot: { name: "Hoot 教授", tag: "猫头鹰助教", color: GREEN },
  chibi: { name: "Q 版 Moss", tag: "二次元分身", color: PURPLE },
};

/* ================= 背景：深夜学院 + 星尘 ================= */
const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  const stars = React.useMemo(() => new Array(90).fill(0).map((_, i) => ({ x: random(`x${i}`) * 1920, y: random(`y${i}`) * 1080, r: 0.6 + random(`r${i}`) * 1.8, s: 0.2 + random(`s${i}`) * 0.8, ph: random(`p${i}`) * 6.28 })), []);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(1200px 800px at 75% 10%, #2A2147 0%, #14122A 45%, #0A0A16 100%)" }}>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        {stars.map((s, i) => <circle key={i} cx={(s.x + f * s.s * 0.15) % 1920} cy={s.y} r={s.r} fill={i % 7 === 0 ? GOLD2 : "#fff"} opacity={0.25 + 0.35 * (0.5 + 0.5 * Math.sin(f / 18 + s.ph))} />)}
      </svg>
      {/* 月牙：呼应 Moss 胸口的纹身 */}
      <svg width={260} height={260} style={{ position: "absolute", right: -40, bottom: -60, opacity: 0.08 }} viewBox="0 0 100 100"><path d="M60 8a44 44 0 1 0 32 74A36 36 0 1 1 60 8z" fill={GOLD} /></svg>
    </AbsoluteFill>
  );
};

/* ================= 布局 ================= */
const PIP = { x: 1462, y: 168, w: 396, h: 704 };
const PANEL = { x: 64, y: 150, w: 1360, h: 760 };

const HostBox: React.FC = () => {
  const f = useCurrentFrame(); const t = f / FPS;
  const it = cur(t);
  if (!it || it.kind !== "nar" || it.shot !== "pip") return null;
  const h = HOSTS[it.host ?? "moss"];
  const p = sp(f, it.start, 16, 170);
  const prevSame = ITEMS[ITEMS.indexOf(it) - 1]?.shot === "pip";
  const local = f - F(it.start);
  return (
    <div style={{ position: "absolute", left: PIP.x, top: PIP.y, width: PIP.w, height: PIP.h, ...(prevSame ? {} : appear(p, 60)) }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 30, overflow: "hidden", background: "#000", boxShadow: `0 0 0 3px ${h.color}, 0 0 40px ${h.color}55, 0 30px 80px rgba(0,0,0,.6)` }}>
        <Sequence from={F(it.start)} durationInFrames={F(it.dur) + 4} layout="none">
          <OffthreadVideo src={staticFile(it.src!)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </Sequence>
        {/* 换人时闪一下白，像切机位 */}
        <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: interpolate(local, [0, 4], [0.35, 0], clamp) }} />
        <div style={{ position: "absolute", right: 12, top: 12, fontFamily: ZH, fontSize: 15, color: "rgba(255,255,255,.85)", background: "rgba(0,0,0,.4)", padding: "3px 9px", borderRadius: 7 }}>AI 生成</div>
      </div>
      <div style={{ position: "absolute", left: 18, bottom: -26, display: "flex", alignItems: "center", gap: 10, background: "#14122A", border: `1.5px solid ${h.color}`, borderRadius: 14, padding: "8px 16px", ...appear(sp(f, it.start + 0.15), 14) }}>
        <span style={{ fontFamily: SERIF, fontSize: 28, color: h.color, fontWeight: 700 }}>{h.name}</span>
        <span style={{ fontFamily: ZH, fontSize: 17, color: MUTE }}>{h.tag}</span>
      </div>
    </div>
  );
};

/** 全屏场景段：片段铺满，左下角挂名牌 */
const SceneClip: React.FC = () => {
  const f = useCurrentFrame(); const t = f / FPS;
  return (
    <>
      {ITEMS.filter((i) => i.kind === "nar" && i.shot === "scene").map((it) => (
        <Sequence key={it.id} from={F(it.start)} durationInFrames={F(it.dur) + 4}>
          <AbsoluteFill style={{ opacity: interpolate(f - F(it.start), [0, 6], [0, 1], clamp) }}>
            <OffthreadVideo src={staticFile(it.src!)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 70%, rgba(0,0,0,.55) 100%)" }} />
            <div style={{ position: "absolute", left: 54, top: 46, display: "flex", gap: 12, alignItems: "center", ...appear(sp(f, it.start + 0.3), 16) }}>
              <div style={{ width: 10, height: 34, background: HOSTS[it.host ?? "moss"].color, borderRadius: 4 }} />
              <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 34, color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,.6)" }}>{HOSTS[it.host ?? "moss"].name}</span>
              <span style={{ fontFamily: ZH, fontSize: 18, color: "rgba(255,255,255,.8)", background: "rgba(0,0,0,.35)", padding: "3px 10px", borderRadius: 8 }}>AI 生成</span>
            </div>
          </AbsoluteFill>
        </Sequence>
      ))}
      {t < 0 ? null : null}
    </>
  );
};

/* ================= 顶部：系列标题 + 章节进度 ================= */
const CHS = ["① 为什么要 LoRA", "② 准备数据", "③ 训练", "④ 验收", "⑤ 让她开口", "⑥ 全部开源"];
const TopBar: React.FC = () => {
  const f = useCurrentFrame(); const t = f / FPS;
  const it = cur(t) ?? ITEMS[0];
  if (it.kind === "nar" && it.shot === "scene") return null;
  if (it.kind === "title") return null;
  const k = CHS.indexOf(it.ch);
  return (
    <div style={{ position: "absolute", left: 64, right: 60, top: 42, display: "flex", alignItems: "center", justifyContent: "space-between", opacity: sp(f, 0.2, 16, 120) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg width={30} height={30} viewBox="0 0 100 100"><path d="M60 8a44 44 0 1 0 32 74A36 36 0 1 1 60 8z" fill={GOLD} /></svg>
        <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 30, color: GOLD2, letterSpacing: 1 }}>MOSS 魔法学院</span>
        <span style={{ fontFamily: ZH, fontWeight: 600, fontSize: 20, color: "#14122A", background: GOLD, padding: "4px 12px", borderRadius: 8 }}>第一课 · 人物 LoRA × 数字人口播</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {CHS.map((c, i) => {
          const on = i === k, done = k > i;
          return <div key={c} style={{ fontFamily: ZH, fontWeight: 600, fontSize: 17, padding: "6px 12px", borderRadius: 999, color: on ? "#14122A" : done ? GOLD : MUTE,
            background: on ? GOLD : done ? "rgba(232,195,106,.12)" : "rgba(255,255,255,.06)", transform: `scale(${on ? 1.06 : 1})` }}>{c}</div>;
        })}
      </div>
    </div>
  );
};

/* ================= 字幕（英文段双语） ================= */
const HL = ["LoRA", "caption", "moss01", "GPT Image 2", "4090", "MiniMax H3", "H3", "whisper", "Remotion", "ComfyUI", "GitHub", "skill", "Loss", "正则图", "触发词", "第三百步", "第九百步", "Moss"];
const Hi: React.FC<{ text: string }> = ({ text }) => {
  const segs: Array<{ s: string; h: boolean }> = []; let rest = text;
  while (rest) {
    let best = -1, w = "";
    for (const h of HL) { const i = rest.indexOf(h); if (i >= 0 && (best < 0 || i < best || (i === best && h.length > w.length))) { best = i; w = h; } }
    if (best < 0) { segs.push({ s: rest, h: false }); break; }
    if (best) segs.push({ s: rest.slice(0, best), h: false });
    segs.push({ s: w, h: true }); rest = rest.slice(best + w.length);
  }
  return <>{segs.map((x, i) => <span key={i} style={{ color: x.h ? GOLD2 : "#fff" }}>{x.s}</span>)}</>;
};
const Subs: React.FC = () => {
  const f = useCurrentFrame(); const t = f / FPS;
  const it = cur(t);
  if (!it || it.kind !== "nar") return null;
  const ln = it.lines!.find((l) => t >= l.start && t < l.end) ?? (t < it.start + it.dur ? undefined : undefined);
  if (!ln) return null;
  const pip = it.shot === "pip", en = it.lang !== "zh";
  return (
    <div style={{ position: "absolute", left: pip ? PANEL.x : 0, width: pip ? PANEL.w : 1920, bottom: 34, display: "flex", justifyContent: "center" }}>
      <div style={{ background: "rgba(8,8,18,.78)", border: `1px solid ${LINE}`, padding: en ? "8px 28px 10px" : "8px 30px", borderRadius: 14, maxWidth: 1340, textAlign: "center", backdropFilter: "blur(6px)" }}>
        <div style={{ fontFamily: en ? EN : ZH, fontWeight: 600, fontSize: en ? 36 : 40, color: "#fff", lineHeight: 1.3 }}><Hi text={ln.text} /></div>
        {en && ln.zh && <div style={{ fontFamily: ZH, fontSize: 26, color: "rgba(255,255,255,.72)", marginTop: 2 }}>{ln.zh}</div>}
      </div>
    </div>
  );
};

/* ================= 通用组件 ================= */
const Card: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode; glow?: string }> = ({ style, children, glow }) => (
  <div style={{ position: "absolute", background: GLASS, borderRadius: 26, border: `1px solid ${glow ?? LINE}`, boxShadow: `0 24px 70px rgba(0,0,0,.45)${glow ? `, 0 0 40px ${glow}33` : ""}`, backdropFilter: "blur(10px)", overflow: "hidden", ...style }}>{children}</div>
);
const Pic: React.FC<{ src: string; x: number; y: number; w: number; h?: number; f: number; at: number; fit?: "cover" | "contain"; pos?: string; label?: string; glow?: string }> = ({ src, x, y, w, h, f, at, fit = "contain", pos, label, glow }) => {
  if (f < F(at) - 2) return null;
  const p = sp(f, at, 15, 150);
  const kb = interpolate(f - F(at), [0, 240], [1.0, 1.04], clamp);
  return (
    <Card glow={glow} style={{ left: x, top: y, width: w, height: h, background: "rgba(255,255,255,.96)", ...appear(p, 40) }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: h ?? "auto", objectFit: fit, objectPosition: pos, transform: `scale(${kb})`, display: "block" }} />
      {label && <div style={{ position: "absolute", left: 16, top: 14, fontFamily: ZH, fontWeight: 700, fontSize: 22, color: "#14122A", background: GOLD, padding: "4px 12px", borderRadius: 8 }}>{label}</div>}
    </Card>
  );
};
const Chip: React.FC<{ text: string; color?: string; bg?: string; size?: number; style?: React.CSSProperties }> = ({ text, color = INK, bg = "rgba(255,255,255,.08)", size = 26, style }) => (
  <span style={{ display: "inline-block", fontFamily: /^[\x00-\x7F]+$/.test(text) ? EN : ZH, fontWeight: 600, fontSize: size, padding: "7px 16px", borderRadius: 12, background: bg, color, border: `1px solid ${color}44`, ...style }}>{text}</span>
);
const Typed: React.FC<{ f: number; at: number; text: string; cps?: number }> = ({ f, at, text, cps = 30 }) => {
  if (f < F(at)) return null;
  const n = Math.max(0, Math.floor(((f - F(at)) / FPS) * cps));
  return <>{text.slice(0, n)}{n < text.length && f % 14 < 8 ? "▍" : ""}</>;
};
const Term: React.FC<{ f: number; x: number; y: number; w: number; h: number; title: string; lines: Array<{ at: number; text: string; color?: string; prompt?: boolean }> }> = ({ f, x, y, w, h, title, lines }) => (
  <Card style={{ left: x, top: y, width: w, height: h, background: "#0B0B14", ...appear(sp(f, lines[0].at - 0.3)) }}>
    <div style={{ height: 46, display: "flex", alignItems: "center", gap: 9, padding: "0 18px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
      {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
      <span style={{ fontFamily: MONO, fontSize: 18, color: "rgba(255,255,255,.5)", marginLeft: 12 }}>{title}</span>
    </div>
    <div style={{ padding: "18px 26px", display: "flex", flexDirection: "column", gap: 12 }}>
      {lines.map((l, k) => f >= F(l.at) && (
        <div key={k} style={{ fontFamily: MONO, fontSize: 24, color: l.color ?? "#EDEBE4", whiteSpace: "pre" }}>
          {l.prompt !== false && <span style={{ color: GOLD }}>{"$ "}</span>}<Typed f={f} at={l.at} text={l.text} cps={45} />
        </div>
      ))}
    </div>
  </Card>
);
const Big: React.FC<{ f: number; at: number; kicker?: string; title: React.ReactNode; sub?: React.ReactNode; x?: number; y?: number; w?: number; children?: React.ReactNode }> = ({ f, at, kicker, title, sub, x = 90, y = 210, w = 1260, children }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, ...appear(sp(f, at, 14, 150), 40) }}>
    {kicker && <div style={{ fontFamily: ZH, fontWeight: 600, fontSize: 30, color: GOLD, marginBottom: 14, letterSpacing: 2 }}>{kicker}</div>}
    <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 88, lineHeight: 1.2, color: INK }}>{title}</div>
    {sub && <div style={{ fontFamily: ZH, fontSize: 32, color: MUTE, marginTop: 20, lineHeight: 1.5 }}>{sub}</div>}
    {children}
  </div>
);
const Count: React.FC<{ f: number; at: number; from: number; to: number; dur?: number; suffix?: string }> = ({ f, at, from, to, dur = 0.9, suffix = "" }) => {
  const v = interpolate(f, [F(at), F(at + dur)], [from, to], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
  return <>{Math.round(v).toLocaleString()}{suffix}</>;
};
const Stamp: React.FC<{ f: number; at: number; text: string; x: number; y: number; color?: string; rot?: number }> = ({ f, at, text, x, y, color = RED, rot = -10 }) => {
  if (f < F(at)) return null;
  const p = sp(f, at, 9, 260, 0.6);
  return <div style={{ position: "absolute", left: x, top: y, transform: `rotate(${rot}deg) scale(${2.2 - 1.2 * p})`, opacity: Math.min(1, p * 2), fontFamily: ZH, fontWeight: 900, fontSize: 64, color, border: `6px solid ${color}`, borderRadius: 16, padding: "4px 22px", background: "rgba(10,10,22,.6)", boxShadow: `0 0 30px ${color}66` }}>{text}</div>;
};
const Sparkles: React.FC<{ f: number; at: number; n?: number; x: number; y: number }> = ({ f, at, n = 26, x, y }) => {
  if (f < F(at)) return null;
  const l = f - F(at);
  return <>{new Array(n).fill(0).map((_, i) => {
    const a = random(`a${i}`) * Math.PI * 2, v = 6 + random(`v${i}`) * 10, d = l * v;
    return <div key={i} style={{ position: "absolute", left: x + Math.cos(a) * d, top: y + Math.sin(a) * d + 0.25 * l * l * 0.3, width: 10, height: 10, borderRadius: 5, background: [GOLD, PURPLE, TEAL, "#fff"][i % 4], opacity: interpolate(l, [0, 40], [1, 0], clamp) }} />;
  })}</>;
};

/* ================= 每段的画面（左侧内容区 / 场景叠层） ================= */
const Panel: React.FC<{ id: string }> = ({ id }) => {
  const f = useCurrentFrame();
  const P0 = ST(id);
  switch (id) {
    case "s01": return (
      <div style={{ position: "absolute", left: 60, bottom: 170, width: 700, ...appear(sp(f, W("s01", "Small confession")), 30) }}>
        {f >= F(W("s01", "fifty-six")) && <div style={{ display: "flex", gap: 14, ...appear(sp(f, W("s01", "fifty-six"))) }}>
          <Chip text="56 pictures" color={GOLD2} bg="rgba(10,10,22,.6)" size={34} />
          {f >= F(W("s01", "graphics card")) && <span style={pop(sp(f, W("s01", "graphics card"), 10, 220))}><Chip text="1 × RTX 4090" color={TEAL} bg="rgba(10,10,22,.6)" size={34} /></span>}
        </div>}
      </div>
    );
    case "s02": return (
      <Big f={f} at={P0 + 0.1} kicker="LANGUAGE SWITCH" title={<span style={{ fontFamily: SERIF }}>English <span style={{ color: GOLD }}>→</span> 中文</span>} sub="开场用英式英语，正片切成普通话">
        <div style={{ display: "flex", gap: 18, marginTop: 40 }}>
          <span style={pop(sp(f, W("s02", "Mandarin"), 10, 220))}><Chip text="Mandarin, please." color={TEAL} size={34} /></span>
          <span style={pop(sp(f, W("s02", "China"), 10, 220))}><Chip text="一半观众在中国" color={GOLD} size={34} /></span>
        </div>
      </Big>
    );
    case "s03": return (
      <Big f={f} at={P0 + 0.1} kicker="这一期，教你两件事" title={<>训练一个我<br /><span style={{ color: GOLD }}>再让我开口讲课</span></>}>
        <div style={{ display: "flex", gap: 22, marginTop: 44 }}>
          {[["①", "人物 LoRA", "MOSS-Image · 56 张图 · 一张 4090", W("s03", "训练")], ["②", "数字人口播", "MiniMax H3 · 本地 · 画面声音一起出", W("s03", "开口")]].map(([n, a, b, at]) => (
            <div key={a as string} style={{ ...appear(sp(f, at as number, 12, 200)), background: GLASS, border: `1px solid ${LINE}`, borderRadius: 22, padding: "22px 28px", width: 560 }}>
              <div style={{ fontFamily: SERIF, fontSize: 40, color: GOLD }}>{n} <span style={{ fontFamily: ZH, fontWeight: 800, color: INK }}>{a}</span></div>
              <div style={{ fontFamily: ZH, fontSize: 24, color: MUTE, marginTop: 8 }}>{b}</div>
            </div>
          ))}
        </div>
      </Big>
    );
    case "s04": return (
      <>
        <Pic src="img/lora_principle.jpg" x={90} y={190} w={1260} f={f} at={P0 + 0.1} label="LoRA 原理" />
        <div style={{ position: "absolute", left: 90, top: 740, display: "flex", gap: 16 }}>
          <span style={appear(sp(f, W("s04", "什么都会画")))}><Chip text="通用模型：什么都会画" /></span>
          <span style={appear(sp(f, W("s04", "不认识")))}><Chip text="但不认识你心里的那个人" color={RED} /></span>
          <span style={appear(sp(f, W("s04", "一小块记忆")))}><Chip text="LoRA = 补一小块记忆（约 150MB）" color={GOLD2} /></span>
        </div>
      </>
    );
    case "s05": {
      const a1 = W("s05", "一个小时"), a2 = W("s05", "三个多小时");
      return (
        <>
          <Pic src="img/moss01_batch1_sample.jpg" x={90} y={180} w={1000} f={f} at={P0 + 0.1} label="GPT Image 2 画的训练照" />
          <Card style={{ left: 1110, top: 180, width: 300, height: 510, padding: 26, ...appear(sp(f, a1 - 0.2)) }}>
            <div style={{ fontFamily: ZH, fontWeight: 700, fontSize: 26, color: GOLD }}>时间花在哪</div>
            {[["训练", 1, a1, TEAL], ["准备数据", 3.25, a2, GOLD]].map(([n, h, at, c]) => (
              <div key={n as string} style={{ marginTop: 26 }}>
                <div style={{ fontFamily: ZH, fontSize: 24, color: INK }}>{n as string} · {h === 1 ? "1 小时" : "3 小时 15 分"}</div>
                <div style={{ marginTop: 10, height: 26, borderRadius: 13, background: "rgba(255,255,255,.08)" }}>
                  <div style={{ height: 26, borderRadius: 13, background: c as string, width: `${interpolate(f, [F(at as number), F((at as number) + 0.8)], [0, ((h as number) / 3.25) * 100], clamp)}%` }} />
                </div>
              </div>
            ))}
            {f >= F(a2 + 0.6) && <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 40, color: RED, marginTop: 40, ...pop(sp(f, a2 + 0.6)) }}>数据才是大头</div>}
          </Card>
        </>
      );
    }
    case "s05b": {
      const c = W("s05b", "六十八"), d = W("s05b", "五十六");
      return (
        <>
          <Pic src="img/moss01_train_set.jpg" x={90} y={180} w={1000} f={f} at={P0 + 0.1} label="最终训练集" />
          <Card style={{ left: 1110, top: 180, width: 300, height: 510, padding: 26, display: "flex", flexDirection: "column", gap: 18, ...appear(sp(f, P0 + 0.3)) }}>
            <div style={{ fontFamily: ZH, fontSize: 24, color: MUTE }}>① 定妆照</div>
            <div style={{ fontFamily: ZH, fontSize: 24, color: MUTE }}>② 按清单出发型 / 衣服 / 角度</div>
            <div style={{ fontFamily: SERIF, fontSize: 84, color: INK, marginTop: 20, opacity: f >= F(c) ? 1 : 0 }}>{f < F(d) ? <Count f={f} at={c} from={0} to={68} /> : <span style={{ color: GOLD }}><Count f={f} at={d} from={68} to={56} /></span>}<span style={{ fontFamily: ZH, fontSize: 30 }}> 张</span></div>
            {f >= F(d) && <div style={pop(sp(f, d))}><Chip text="−12 张重复" color={RED} /></div>}
          </Card>
        </>
      );
    }
    case "s06": {
      const at = W("s06", "开头");
      return (
        <Card style={{ left: 50, top: 130, width: 620, padding: "22px 28px", background: "rgba(10,10,22,.78)", ...appear(sp(f, W("s06", "caption") - 0.2)) }}>
          <div style={{ fontFamily: ZH, fontWeight: 700, fontSize: 28, color: GOLD }}>caption 长这样</div>
          <div style={{ fontFamily: MONO, fontSize: 25, color: INK, marginTop: 14, lineHeight: 1.6 }}>
            <span style={{ color: f >= F(at) ? "#14122A" : INK, background: f >= F(at) ? GOLD : "transparent", borderRadius: 6, padding: "0 6px" }}>moss01</span>
            <Typed f={f} at={W("s06", "后面")} text=", upper-body portrait, braided updo hairstyle, school uniform with a black cloak, rainy gothic courtyard" cps={34} />
          </div>
        </Card>
      );
    }
    case "s07": return (
      <>
        <Pic src="img/moss01_caption_example.jpg" x={170} y={170} w={1100} f={f} at={P0 + 0.1} label="训练图 + caption" />
        <div style={{ position: "absolute", left: 170, top: 870, display: "flex", gap: 16 }}>
          <span style={appear(sp(f, W("s07", "写进去")))}><Chip text="写进去的 → 可以换" color={GREEN} size={30} /></span>
          <span style={appear(sp(f, W("s07", "没写的")))}><Chip text="没写的 → 记成她本人" color={GOLD2} size={30} /></span>
        </div>
      </>
    );
    case "s07b": {
      const tags: Array<[string, string, string]> = [["moss01", "触发词", RED], ["upper-body portrait", "构图", TEAL], ["calm expression", "表情", PURPLE], ["low bun hairstyle", "发型", PURPLE], ["school uniform", "衣服", GREEN], ["snowy cloister walkway", "场景", GOLD]];
      const keys = ["触发词", "构图", "表情", "发型", "衣服", "场景"];
      return (
        <Big f={f} at={P0} kicker="标签式 caption" title="逗号隔开，简单好改" y={200}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 50, width: 1240 }}>
            {tags.map(([t, k, c], i) => (
              <div key={t} style={{ ...pop(sp(f, W("s07b", keys[i]), 10, 220)), display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 30, color: c, background: `${c}18`, border: `1.5px solid ${c}88`, borderRadius: 12, padding: "10px 18px" }}>{t}{i < tags.length - 1 ? "," : ""}</span>
                <span style={{ fontFamily: ZH, fontSize: 22, color: MUTE, textAlign: "center" }}>{k}</span>
              </div>
            ))}
          </div>
        </Big>
      );
    }
    case "s08": {
      const tiles: Array<[React.ReactNode, string, number]> = [
        [<>RTX 4090</>, "48G 显存 · 一张卡", W("s08", "4090")],
        [<Count f={f} at={W("s08", "一千二百")} from={0} to={1200} />, "训练步数", W("s08", "一千二百")],
        [<><Count f={f} at={W("s08", "六十五")} from={0} to={65} /> 分钟</>, "总训练时长", W("s08", "六十五")],
        [<>第 300 步 ✓</>, "已经认出她", W("s08", "第三百步")],
      ];
      return (
        <div style={{ position: "absolute", left: 54, bottom: 150, display: "flex", gap: 18 }}>
          {tiles.map(([v, l, at], i) => (
            <div key={i} style={{ ...appear(sp(f, at, 12, 200), 30), background: "rgba(10,10,22,.72)", border: `1px solid ${i === 3 ? GREEN : LINE}`, borderRadius: 20, padding: "16px 24px", minWidth: 250 }}>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 46, color: i === 3 ? GREEN : GOLD2 }}>{v}</div>
              <div style={{ fontFamily: ZH, fontSize: 22, color: MUTE, marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
      );
    }
    case "s09": return (
      <>
        <Pic src="img/moss01_step300_row_ucloud.jpg" x={90} y={250} w={1260} f={f} at={P0 + 0.1} label="第 300 步的测试图" />
        <div style={{ position: "absolute", left: 90, top: 560, ...appear(sp(f, W("s09", "terrifying"), 12, 180)) }}>
          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 72, color: GOLD2 }}>“Slightly terrifying.”</div>
        </div>
      </>
    );
    case "s10": return (
      <>
        <Pic src="img/moss01_leak_matrix.jpg" x={250} y={170} w={900} f={f} at={P0 + 0.1} label="写 / 不写 moss01" />
        <Stamp f={f} at={W("s10", "全变成了我")} text="身份泄漏" x={880} y={560} />
      </>
    );
    case "s11": return (
      <>
        <Pic src="img/moss01_leak_compare_greenhouse.jpg" x={180} y={170} w={1080} f={f} at={P0} />
        <div style={{ position: "absolute", left: 0, width: PANEL.w + 64, top: 700, textAlign: "center", ...pop(sp(f, P0 + 0.2, 8, 220)) }}>
          <span style={{ fontFamily: ZH, fontWeight: 900, fontSize: 92, color: "#fff", WebkitTextStroke: `2px ${PURPLE}`, textShadow: `0 0 28px ${PURPLE}, 0 6px 0 #3A2A70` }}>全世界都变成我啦！</span>
        </div>
        <Sparkles f={f} at={P0 + 0.3} x={720} y={760} n={44} />
      </>
    );
    case "s12": {
      const a = W("s12", "只有我一个人"), b = W("s12", "正则图");
      return (
        <Big f={f} at={P0} kicker="为什么会泄漏" title="模型没见过「不是 Moss 的人」" y={190}>
          <div style={{ display: "flex", gap: 30, marginTop: 46, alignItems: "center" }}>
            <div style={{ ...appear(sp(f, a)), background: GLASS, border: `1px solid ${RED}88`, borderRadius: 22, padding: 26, width: 520 }}>
              <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 34, color: RED }}>现在</div>
              <div style={{ fontFamily: ZH, fontSize: 28, color: INK, marginTop: 10, lineHeight: 1.5 }}>56 张全是她<br />学到的是「画人 = 画成她」</div>
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 70, color: GOLD, ...appear(sp(f, b - 0.3)) }}>→</div>
            <div style={{ ...appear(sp(f, b)), background: GLASS, border: `1px solid ${GREEN}88`, borderRadius: 22, padding: 26, width: 560 }}>
              <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 34, color: GREEN }}>改进</div>
              <div style={{ fontFamily: ZH, fontSize: 28, color: INK, marginTop: 10, lineHeight: 1.5 }}>加一批不写 moss01 的正则图<br />学会「moss01 = 这个人」</div>
            </div>
          </div>
        </Big>
      );
    }
    case "s13": {
      const band = W("s13", "零点四");
      return (
        <>
          <Pic src="img/moss01_loss.jpg" x={90} y={190} w={1260} f={f} at={P0 + 0.1} label="真实 Loss 曲线" />
          {f >= F(band) && <div style={{ position: "absolute", left: 200, top: 290, width: 1110, height: 300, border: `3px dashed ${RED}`, borderRadius: 16, ...pop(sp(f, band)) }} />}
          {f >= F(band) && <div style={{ position: "absolute", left: 90, top: 745, ...appear(sp(f, band + 0.2)) }}><Chip text="0.4 ~ 0.65 来回跳，看不出哪步最好" color={RED} size={30} /></div>}
          {f >= F(W("s13", "固定测试图")) && <div style={{ position: "absolute", left: 720, top: 745, ...appear(sp(f, W("s13", "固定测试图"))) }}><Chip text="看固定提示词 + 固定种子的测试图" color={GREEN} size={30} /></div>}
        </>
      );
    }
    case "s13b": {
      // moss01_ucloud_grid.jpg 1930×1490：左 130px 是行标签；第 300 步 y 50–410，第 900 步 y 770–1130
      const a = W("s13b", "第三百步"), b = W("s13b", "第九百步"), k = 1180 / 1800;
      const row = (y0: number, at: number, title: string, sub: string, c: string, top: number) => (
        <Card glow={c} style={{ left: 90, top, width: 1260, height: 300, display: "flex", ...appear(sp(f, at)) }}>
          <div style={{ width: 1180, height: 360 * k, overflow: "hidden", position: "relative", background: "#fff", marginTop: (300 - 360 * k) / 2 }}>
            <Img src={staticFile("img/moss01_ucloud_grid.jpg")} style={{ position: "absolute", width: 1930 * k, left: -130 * k, top: -y0 * k }} />
          </div>
          <div style={{ width: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `${c}22` }}>
            <div style={{ writingMode: "vertical-rl", fontFamily: ZH, fontWeight: 800, fontSize: 30, color: c }}>{title}</div>
          </div>
          <div style={{ position: "absolute", left: 18, bottom: 14 }}><Chip text={sub} color={c} bg="rgba(10,10,22,.8)" size={24} /></div>
        </Card>
      );
      return <>{row(50, a, "第 300 步", "泄漏最轻", GREEN, 170)}{row(770, b, "第 900 步", "更像她，泄漏也更强", GOLD, 500)}</>;
    }
    case "s13c": return (
      <>
        <Term f={f} x={90} y={180} w={1260} h={150} title="导出给 ComfyUI" lines={[{ at: W("s13c", "一条命令") - 0.2, text: "bash export_comfy.sh 900" }, { at: W("s13c", "ComfyUI") , text: "✓ moss01-lora-comfy.safetensors", color: GREEN, prompt: false }]} />
        <Pic src="img/comfyui_leak_compare_ui.jpg" x={240} y={350} w={960} h={400} fit="cover" pos="center 70%" f={f} at={W("s13c", "同一个种子")} label="原模型 · 不写 · 写 moss01" />
      </>
    );
    case "s14": {
      const a = W("s14", "首帧"), b = W("s14", "台词"), c = W("s14", "画面和声音");
      return (
        <>
          <div style={{ position: "absolute", left: 90, top: 190, fontFamily: ZH, fontWeight: 800, fontSize: 56, color: INK, ...appear(sp(f, P0)) }}>本地 <span style={{ color: GOLD }}>MiniMax H3</span>：一张图 + 一句话</div>
          <Card style={{ left: 90, top: 320, width: 250, height: 444, ...appear(sp(f, a)) }}><Img src={staticFile("cast/moss_916.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></Card>
          <div style={{ position: "absolute", left: 360, top: 500, fontFamily: SERIF, fontSize: 70, color: GOLD, ...appear(sp(f, b - 0.2)) }}>+</div>
          <Card style={{ left: 420, top: 420, width: 420, padding: 22, background: "#0B0B14", ...appear(sp(f, b)) }}>
            <div style={{ fontFamily: MONO, fontSize: 21, color: TEAL, lineHeight: 1.5 }}>{"<d>[Chinese]"}</div>
            <div style={{ fontFamily: ZH, fontSize: 26, color: INK, lineHeight: 1.5 }}>没问题，接下来说中文。</div>
            <div style={{ fontFamily: MONO, fontSize: 21, color: TEAL }}>{"</d>"}</div>
          </Card>
          <div style={{ position: "absolute", left: 870, top: 500, fontFamily: SERIF, fontSize: 70, color: GOLD, ...appear(sp(f, c - 0.4)) }}>→</div>
          <Card glow={GOLD} style={{ left: 960, top: 360, width: 400, height: 360, padding: 26, ...appear(sp(f, c)) }}>
            <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 40, color: GOLD2 }}>画面 + 声音</div>
            <div style={{ fontFamily: ZH, fontSize: 26, color: MUTE, marginTop: 10, lineHeight: 1.6 }}>一次生成<br />口型、表情、音色<br />全在一个模型里</div>
            <svg width={340} height={70} style={{ marginTop: 18 }}>{new Array(34).fill(0).map((_, i) => { const hh = 8 + 50 * Math.abs(Math.sin(i * 0.9 + f / 4)); return <rect key={i} x={i * 10} y={35 - hh / 2} width={6} height={hh} rx={3} fill={GOLD} opacity={0.85} />; })}</svg>
          </Card>
        </>
      );
    }
    case "s15": return (
      <Term f={f} x={90} y={200} w={1260} h={430} title="worker2 · nvidia-smi" lines={[
        { at: P0 + 0.2, text: "nvidia-smi --query-gpu=index,name,memory.total" },
        { at: W("s15", "two graphics cards") - 0.2, text: "0, NVIDIA GeForce RTX 4090, 49140 MiB   ███████████ H3 :8188", color: TEAL, prompt: false },
        { at: W("s15", "two graphics cards") + 0.3, text: "1, NVIDIA GeForce RTX 4090, 49140 MiB   ███████████ H3 :8190", color: TEAL, prompt: false },
        { at: W("s15", "cupboard"), text: "# 0 cloud credits · 2 local GPUs", color: GOLD2, prompt: false },
      ]} />
    );
    case "s16": return (
      <Term f={f} x={90} y={180} w={1260} h={560} title="h3.py run tasks.json --gpus 2" lines={[
        { at: P0 + 0.1, text: "python3 h3.py run tasks.json --gpus 2" },
        { at: W("s16", "加速"), text: "Turbo LoRA · 20 步 → 8 步", color: GOLD2, prompt: false },
        { at: W("s16", "八步"), text: "  已入队 s03 → :8190 (480x864 · 8.7s)", color: "#C9C6BD", prompt: false },
        { at: W("s16", "生成完"), text: "  ✓ s03 → gen/s03.mp4", color: GREEN, prompt: false },
        { at: W("s16", "whisper"), text: "python3 assemble.py script.json", prompt: true },
        { at: W("s16", "逐字回听"), text: "  s03  准确率 97%  说话 0.3–7.9s", color: GREEN, prompt: false },
        { at: W("s16", "念错"), text: "⚠ s07  准确率 71% → 换种子重拍", color: RED, prompt: false },
      ]} />
    );
    case "s17": {
      const rows: Array<[string, string]> = [["数字人", GOLD], ["字幕", "#fff"], ["配图", TEAL], ["画中画", PURPLE], ["音效 / 配乐", GREEN]];
      return (
        <>
          <Term f={f} x={90} y={180} w={1260} h={210} title="Episode.tsx" lines={[
            { at: P0 + 0.1, text: "<HostBox /> <Panel id={it.id} /> <Subs />", prompt: false, color: TEAL },
            { at: W("s17", "一条命令") - 0.2, text: "npx remotion render Episode out.mp4" },
          ]} />
          <Card style={{ left: 90, top: 420, width: 1260, height: 330, padding: 26, ...appear(sp(f, W("s17", "字幕"))) }}>
            {rows.map(([n, c], i) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 16 }}>
                <div style={{ width: 150, fontFamily: ZH, fontSize: 24, color: MUTE }}>{n}</div>
                <div style={{ flex: 1, height: 30, position: "relative" }}>
                  {new Array(10).fill(0).map((_, k) => { const x0 = (k * 97 + i * 31) % 900; return <div key={k} style={{ position: "absolute", left: x0, width: 40 + ((k * 13 + i * 7) % 60), height: 30, borderRadius: 6, background: c, opacity: interpolate(f - F(W("s17", "字幕")) - (k + i) * 2, [0, 6], [0, 0.85], clamp) }} />; })}
                </div>
              </div>
            ))}
            <div style={{ position: "absolute", top: 20, bottom: 20, width: 3, background: RED, left: 190 + interpolate(f, [F(P0), F(EN_("s17"))], [0, 1000], clamp) }} />
          </Card>
        </>
      );
    }
    case "s17b": return (
      <Term f={f} x={90} y={220} w={1260} h={400} title="Claude Code" lines={[
        { at: P0 + 0.2, text: "/digital-human-koubo 用 Moss 讲解这篇文章" },
        { at: W("s17b", "one skill"), text: "● 写稿 → 切段 → H3 生成 → 回听 → 对齐 → 剪辑", color: TEAL, prompt: false },
        { at: W("s17b", "robot"), text: "● 剪辑师：Claude（technically, a robot）", color: GOLD2, prompt: false },
      ]} />
    );
    case "s18": return (
      <Card style={{ left: 50, top: 150, width: 600, padding: "24px 30px", background: "rgba(10,10,22,.78)", ...appear(sp(f, W("s18", "文章") - 0.2)) }}>
        <div style={{ fontFamily: MONO, fontSize: 25, color: GOLD2 }}>github.com/limin112/moss-koubo</div>
        {["训练文章 + Notebook", "ComfyUI 工作流", "H3 Turbo 加速配置", "这条视频的整套 skill"].map((t, i) => (
          <div key={t} style={{ fontFamily: ZH, fontSize: 28, color: INK, marginTop: 14, ...appear(sp(f, W("s18", ["文章", "ComfyUI", "工作流", "skill"][i]))) }}><span style={{ color: GREEN }}>✓ </span>{t}</div>
        ))}
      </Card>
    );
    case "s19": return (
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 150, textAlign: "center", ...pop(sp(f, W("s19", "链接"), 10, 200)) }}>
        <span style={{ fontFamily: ZH, fontWeight: 900, fontSize: 70, color: "#fff", textShadow: "0 4px 20px rgba(0,0,0,.7)" }}>链接在评论区 <span style={{ color: GOLD }}>↓</span></span>
      </div>
    );
    case "s20": {
      const cast: Array<[string, string, string]> = [["cast/moss_916.jpg", "Moss", GOLD], ["cast/oliver_916.jpg", "Oliver", TEAL], ["cast/hoot_169.jpg", "Hoot 教授", GREEN], ["cast/chibi_916.jpg", "Q 版 Moss", PURPLE]];
      return (
        <Big f={f} at={P0} kicker="THE END · 本片角色全部由 AI 生成" title={<span style={{ fontFamily: SERIF, fontStyle: "italic", color: GOLD2 }}>Cheerio!</span>} y={190}>
          <div style={{ display: "flex", gap: 26, marginTop: 40 }}>
            {cast.map(([src, n, c], i) => (
              <div key={n} style={{ ...appear(sp(f, P0 + 0.3 + i * 0.25, 12, 200)), textAlign: "center" }}>
                <div style={{ width: 200, height: 200, borderRadius: 100, overflow: "hidden", boxShadow: `0 0 0 4px ${c}, 0 0 30px ${c}66` }}><Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 22%" }} /></div>
                <div style={{ fontFamily: SERIF, fontSize: 30, color: c, marginTop: 14 }}>{n}</div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 26, color: MUTE, marginTop: 34 }}>MOSS-Image · KohakuMoss · MiniMax H3 · Remotion · Claude Code</div>
        </Big>
      );
    }
    default: return null;
  }
};

/* ================= 片头标题卡 ================= */
const Title: React.FC<{ at: number; dur: number }> = ({ at, dur }) => {
  const f = useCurrentFrame();
  const l = f - F(at);
  const p = sp(f, at + 0.15, 16, 110);
  const out = interpolate(l, [F(dur) - 8, F(dur)], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <AbsoluteFill style={{ background: "radial-gradient(900px 600px at 50% 45%, #2E2452 0%, #0A0A16 75%)" }} />
      <Img src={staticFile("img/cover_5x2_notext.jpg")} style={{ position: "absolute", left: 0, top: 120, width: 1920, height: 768, objectFit: "cover", opacity: 0.32 * p, transform: `scale(${1.08 - 0.06 * p})` }} />
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <circle cx={960} cy={470} r={300 + 20 * Math.sin(l / 10)} fill="none" stroke={GOLD} strokeWidth={2} strokeDasharray="6 14" opacity={0.6 * p} transform={`rotate(${l * 0.6} 960 470)`} />
        <circle cx={960} cy={470} r={340} fill="none" stroke={GOLD} strokeWidth={1} opacity={0.25 * p} />
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: 330, textAlign: "center", ...appear(p, 40) }}>
        <div style={{ fontFamily: ZH, fontWeight: 600, fontSize: 32, color: GOLD, letterSpacing: 10 }}>MOSS 魔法学院 · 第一课</div>
        <div style={{ fontFamily: ZH, fontWeight: 900, fontSize: 120, color: "#fff", marginTop: 16, textShadow: `0 0 40px ${GOLD}55` }}>你的专属「女友马尔福」</div>
        <div style={{ fontFamily: ZH, fontSize: 38, color: GOLD2, marginTop: 22 }}>MOSS-Image 人物 LoRA <span style={{ color: MUTE }}>×</span> 本地数字人口播 · 从 0 到 1</div>
      </div>
      <Sparkles f={f} at={at + 0.2} x={960} y={470} n={36} />
    </AbsoluteFill>
  );
};

/* ================= 音效：转场 whoosh / 盖章 slam / 片头 riser ================= */
const SFX: Array<[string, number, number]> = (() => {
  const out: Array<[string, number, number]> = [];
  ITEMS.forEach((it, i) => {
    if (i > 0 && it.kind === "nar" && (it.shot === "scene" || ITEMS[i - 1].shot === "scene")) out.push(["sfx/whoosh.wav", it.start - 0.15, 0.35]);
    else if (i > 0 && it.kind === "nar" && ITEMS[i - 1].host !== it.host) out.push(["sfx/swish-1.wav", it.start - 0.05, 0.25]);
  });
  if (has("title")) out.push(["sfx/riser.wav", ST("title") - 0.4, 0.4], ["sfx/impact.wav", ST("title") + 0.2, 0.45]);
  if (has("s10")) out.push(["sfx/slam-1.wav", W("s10", "全变成了我"), 0.5]);
  if (has("s11")) out.push(["sfx/ding.wav", ST("s11") + 0.2, 0.4]);
  if (has("s05b")) out.push(["sfx/pop.wav", W("s05b", "五十六"), 0.4]);
  if (has("s16")) out.push(["sfx/done.wav", W("s16", "生成完"), 0.3]);
  return out;
})();

export const Episode: React.FC = () => {
  const f = useCurrentFrame(); const t = f / FPS;
  const it = cur(t);
  const ttl = BY["title"];
  return (
    <AbsoluteFill style={{ background: "#0A0A16" }}>
      <Backdrop />
      <SceneClip />
      {/* 内容区按绝对时间挂（Panel 里的 W()/ST() 都是整片绝对秒，不能套 Sequence 改帧号） */}
      {ITEMS.filter((i) => i.kind === "nar" && t >= i.start - 0.07 && t < i.start + i.dur + 0.13).map((i) => <Panel key={`p-${i.id}`} id={i.id} />)}
      <HostBox />
      <TopBar />
      <Subs />
      {ttl && t >= ttl.start && t < ttl.start + ttl.dur && <Title at={ttl.start} dur={ttl.dur} />}
      {/* 人声：每段片段自带的 H3 原生配音 */}
      {ITEMS.filter((i) => i.kind === "nar").map((i) => (
        <Sequence key={`a-${i.id}`} from={F(i.start)} durationInFrames={F(i.dur) + 2}><Audio src={staticFile(i.src!)} volume={1} /></Sequence>
      ))}
      {/* 配乐压在人声下约 20 dB，片头标题卡抬起来 */}
      <Audio src={staticFile("music/score.mp3")} loop volume={(fr) => {
        const tt = fr / FPS, onTitle = ttl && tt >= ttl.start - 0.3 && tt < ttl.start + ttl.dur;
        return interpolate(fr, [0, 30, TOTAL - 45, TOTAL], [0, 1, 1, 0], clamp) * (onTitle ? 0.6 : 0.14);
      }} />
      {SFX.map(([s, at, v], k) => <Sequence key={`s${k}`} from={Math.max(0, F(at))} durationInFrames={45}><Audio src={staticFile(s)} volume={v} /></Sequence>)}
      {it && it.kind === "nar" && it.shot === "scene" ? null : null}
    </AbsoluteFill>
  );
};
