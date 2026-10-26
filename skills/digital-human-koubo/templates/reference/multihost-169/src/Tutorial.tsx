// AIGC 自媒体视频创作教程 · 第三期：数字人升级版（16:9）。两位主播接力：她开场+基础三步，你（新同事）讲多语言/进场景，她讲换角色，结尾两人同框。
// 时间轴来自 tl.json（build_tl.py 生成）：nar = 主播口播，clip = 全屏片段（多语言/场景/动物/快闪），title / outro = 字卡。
import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame } from "remotion";
import tl from "./tl.json";
import qa from "./qa3.json";

const FPS = 30;
const F = (s: number) => Math.round(s * FPS);
export const TOTAL = F(tl.total);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ZH = '"PingFang SC","Hiragino Sans GB",sans-serif';
const INTL = '"PingFang SC","Hiragino Sans","Apple SD Gothic Neo","Geeza Pro",sans-serif';
const EN = '"Avenir Next","Helvetica Neue",Arial,sans-serif';
const MONO = '"SF Mono",Menlo,monospace';
const BG = "#EDF0EA", INK = "#25231F", MUTE = "#7B786F", OR = "#F7931E", CARD = "#FFFFFF", GREEN = "#24A863", RED = "#E5484D", BLUE = "#3767F0", PURPLE = "#8B5CF6", LINE = "rgba(37,35,31,.10)";

type Item = {
  kind: string; id: string; ch: string; host?: string; shot?: string; text?: string; src?: string; start: number; dur: number;
  chars?: Record<string, number>; role?: string; vert?: boolean; zh?: string; label?: string; lang?: string; audio?: boolean; offset?: number; zh2?: string;
};
const ITEMS = tl.items as unknown as Item[];
const BY: Record<string, Item> = Object.fromEntries(ITEMS.filter((i) => i.role !== "montage" && i.role !== "flash").map((i) => [i.id, i]));
const QA: Record<string, { acc: number; lang: string }> = Object.fromEntries((qa as Array<{ id: string; acc: number; lang: string }>).map((r) => [r.id, r]));
const ST = (id: string) => BY[id].start;
const EN_ = (id: string) => BY[id].start + BY[id].dur;
/** 某段口播里某个词开始的绝对秒数 */
const W = (id: string, word: string) => {
  const it = BY[id]; const i0 = it.text!.indexOf(word);
  if (i0 < 0) throw new Error(`${id} 里找不到「${word}」`);
  let i = i0; while (it.chars![String(i)] === undefined && i < it.text!.length) i++;
  return it.start + (it.chars![String(i)] ?? 0);
};
const sp = (f: number, at: number, damping = 13, stiffness = 170, mass = 0.7) => spring({ frame: f - F(at), fps: FPS, config: { damping, stiffness, mass } });
const appear = (p: number, dy = 30): React.CSSProperties => ({ opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * dy}px)` });
/** 当前条目：取「已开始且未过尾巴」里最晚开始的那条（零间隔衔接时不被上一条 0.12 s 的尾巴抢走） */
const idxAt = (t: number) => { for (let k = ITEMS.length - 1; k >= 0; k--) { const i = ITEMS[k]; if (t >= i.start && t < i.start + i.dur + 0.12) return k; } return -1; };
const at = (t: number) => ITEMS[idxAt(t)] as Item | undefined;

/* ================= 布局 ================= */
type Box = { x: number; y: number; w: number; h: number };
const FULL_V: Box = { x: 230, y: 90, w: 480, h: 853 };
const PIP_V: Box = { x: 1478, y: 196, w: 390, h: 693 };
const FULL_H: Box = { x: 60, y: 170, w: 1120, h: 630 };
const PIP_H: Box = { x: 1452, y: 170, w: 420, h: 236 };
const PANEL = { x: 70, y: 150, w: 1360, h: 780 };
const boxOf = (it?: Item): Box | null => {
  if (!it || it.kind !== "nar") return null;
  if (it.host === "me") return it.shot === "pip" ? PIP_H : FULL_H;
  return it.shot === "pip" ? PIP_V : FULL_V;
};

const Host: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const k = idxAt(t);
  if (k < 0) return null;
  const it = ITEMS[k];
  const to = boxOf(it);
  if (!to) return null;
  const from = boxOf(ITEMS[k - 1]) ?? to;
  const p = spring({ frame: f - F(it.start), fps: FPS, config: { damping: 18, stiffness: 150, mass: 0.8 } });
  const m = (a: number, b: number) => a + (b - a) * (from === to ? 1 : p);
  const b = { x: m(from.x, to.x), y: m(from.y, to.y), w: m(from.w, to.w), h: m(from.h, to.h) };
  const local = f - F(it.start);
  const enter = from === to && ITEMS[k - 1]?.kind !== "nar" ? sp(f, it.start, 15, 170) : 1;
  return (
    <div style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: it.host === "me" && it.shot === "pip" ? 20 : 30, overflow: "hidden", background: "#111",
      boxShadow: "0 0 0 6px #fff, 0 24px 60px rgba(40,40,30,.25)", opacity: enter, transform: `scale(${0.92 + 0.08 * enter})` }}>
      <Sequence from={F(it.start)} durationInFrames={F(it.dur) + 4} layout="none">
        <OffthreadVideo src={staticFile(it.src!)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </Sequence>
      <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: k > 0 ? interpolate(local, [0, 3], [0.3, 0], clamp) : 0 }} />
      <div style={{ position: "absolute", left: 12, top: 12, fontFamily: ZH, fontSize: it.host === "me" && it.shot === "pip" ? 13 : 17, color: "rgba(255,255,255,.9)", background: "rgba(0,0,0,.35)", padding: "3px 10px", borderRadius: 8 }}>内容由 AI 数字人演绎</div>
      {it.host === "me" && it.shot === "full" && <div style={{ position: "absolute", right: 16, bottom: 16 }}><Chip text="新同事 · 用本人照片做的" size={22} bg="rgba(0,0,0,.5)" color="#fff" /></div>}
    </div>
  );
};

/* ================= 顶部：系列标题 + 章节 ================= */
const STEPS = ["基础三步", "新同事", "①多语言", "②进场景", "③换角色", "成片流程"];
const STEP_NAME = ["基础三步", "新同事登场", "① 多语言", "② 进场景", "③ 换角色", "成片流程"];
const TopBar: React.FC = () => {
  const f = useCurrentFrame();
  const it = at(f / FPS);
  if (!it || it.kind !== "nar") return null;
  const cur = STEPS.indexOf(it.ch);
  const p = sp(f, it.start, 16, 140);
  const prevNar = ITEMS[ITEMS.indexOf(it) - 1]?.kind === "nar";
  return (
    <div style={{ position: "absolute", left: 70, right: 52, top: 40, display: "flex", alignItems: "center", justifyContent: "space-between", opacity: prevNar ? 1 : p }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontFamily: ZH, fontWeight: 600, fontSize: 26, color: INK }}>AIGC 自媒体视频创作教程</span>
        <span style={{ fontFamily: ZH, fontWeight: 600, fontSize: 22, color: "#fff", background: OR, padding: "3px 12px", borderRadius: 8 }}>第三期 · 数字人升级版</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {STEPS.map((s, k) => {
          const on = k === cur, done = cur > k || it.ch === "结尾";
          return (
            <div key={s} style={{ fontFamily: ZH, fontWeight: 600, fontSize: 18, padding: "6px 12px", borderRadius: 999, color: on ? "#fff" : done ? GREEN : MUTE,
              background: on ? INK : done ? "rgba(36,168,99,.12)" : "rgba(37,35,31,.06)", transform: `scale(${on ? 1.06 : 1})` }}>{STEP_NAME[k]}</div>
          );
        })}
      </div>
    </div>
  );
};

/* ================= 字幕 ================= */
const HL = ["Renoise", "Claude Code", "Claude", "Codex", "MCP", "Grok", "Wan 3.0", "MiMo", "OmniHuman", "B-roll", "Skill", "四视图", "积分", "克隆", "连接器", "多语言", "进场景", "换角色", "新同事", "AI 生成", "目标语言", "一张照片"];
type Line = { text: string; it: Item; start: number; end: number };
const LINES: Line[] = (() => {
  const out: Line[] = [];
  for (const it of ITEMS) {
    if (!it.chars || !(it.kind === "nar" || (it.kind === "clip" && it.role === "scene"))) continue;
    const txt = it.text!, ch = it.chars;
    const tAt = (i: number) => { let k = i; while (ch[String(k)] === undefined && k < txt.length) k++; return it.start + (ch[String(k)] ?? it.dur); };
    const parts: Array<[string, number]> = []; let buf = "", b0 = 0;
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if ("，。：；！？".includes(c)) { if (buf.trim()) parts.push([buf, b0]); buf = ""; continue; }
      if (!buf) b0 = i; buf += c;
    }
    if (buf.trim()) parts.push([buf, b0]);
    parts.forEach(([p, o], k) => out.push({ text: p.trim(), it, start: tAt(o), end: k + 1 < parts.length ? tAt(parts[k + 1][1]) - 0.03 : it.start + it.dur }));
  }
  return out;
})();
const Hi: React.FC<{ text: string }> = ({ text }) => {
  const segs: Array<{ s: string; h: boolean }> = []; let rest = text;
  while (rest) {
    let best = -1, w = "";
    for (const h of HL) { const i = rest.indexOf(h); if (i >= 0 && (best < 0 || i < best || (i === best && h.length > w.length))) { best = i; w = h; } }
    if (best < 0) { segs.push({ s: rest, h: false }); break; }
    if (best) segs.push({ s: rest.slice(0, best), h: false });
    segs.push({ s: w, h: true }); rest = rest.slice(best + w.length);
  }
  return <>{segs.map((x, i) => <span key={i} style={{ color: x.h ? "#FFB347" : "#fff" }}>{x.s}</span>)}</>;
};
const Subs: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const it = at(t);
  if (it && it.kind === "clip" && (it.role === "lang" || it.role === "flash" || (it.role === "scene" && !it.chars))) {
    const p = sp(f, it.start + 0.1, 14, 200);
    return (
      <div style={{ position: "absolute", left: 0, width: 1920, bottom: 46, display: "flex", justifyContent: "center", ...appear(p, 16) }}>
        <div dir="auto" style={{ textAlign: "center", background: "rgba(28,27,24,.82)", padding: "12px 34px", borderRadius: 16, maxWidth: 1500 }}>
          <div dir="auto" style={{ fontFamily: INTL, fontWeight: 600, fontSize: 44, color: "#fff" }}>{it.text}</div>
          <div style={{ fontFamily: ZH, fontSize: 30, color: "#FFB347", marginTop: 4 }}>{it.zh}</div>
        </div>
      </div>
    );
  }
  const ln = LINES.find((l) => t >= l.start - 0.05 && t < l.end);
  if (!ln) return null;
  const pip = ln.it.kind === "nar" && ln.it.shot === "pip";
  return (
    <div style={{ position: "absolute", left: pip ? PANEL.x : 0, width: pip ? PANEL.w : 1920, bottom: 40, display: "flex", justifyContent: "center" }}>
      <div style={{ fontFamily: ZH, fontWeight: 600, fontSize: 40, color: "#fff", background: "rgba(28,27,24,.82)", padding: "8px 28px", borderRadius: 14, maxWidth: 1300, textAlign: "center" }}><Hi text={ln.text} /></div>
    </div>
  );
};

/* ================= 通用组件 ================= */
const Card: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode }> = ({ style, children }) => (
  <div style={{ position: "absolute", background: CARD, borderRadius: 24, boxShadow: "0 18px 50px rgba(40,40,30,.12)", border: `1px solid ${LINE}`, ...style }}>{children}</div>
);
const Dots: React.FC<{ title?: string; dark?: boolean }> = ({ title, dark }) => (
  <div style={{ height: 48, display: "flex", alignItems: "center", gap: 9, padding: "0 18px", borderBottom: `1px solid ${dark ? "rgba(255,255,255,.1)" : LINE}` }}>
    {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
    <span style={{ fontFamily: MONO, fontSize: 18, color: dark ? "rgba(255,255,255,.55)" : MUTE, marginLeft: 12 }}>{title}</span>
  </div>
);
const Ring: React.FC<{ f: number; at: number; x: number; y: number; w?: number; h?: number }> = ({ f, at, x, y, w = 160, h = 56 }) => {
  if (f < F(at)) return null;
  const p = sp(f, at, 10, 200), pulse = 0.5 + 0.5 * Math.sin((f - F(at)) / 5);
  return <div style={{ position: "absolute", left: x - w / 2, top: y - h / 2, width: w, height: h, borderRadius: 14, border: `4px solid ${OR}`, boxShadow: `0 0 ${10 + 14 * pulse}px ${OR}`, transform: `scale(${1.5 - 0.5 * p})`, opacity: p }} />;
};
const Typed: React.FC<{ f: number; at: number; text: string; cps?: number; style?: React.CSSProperties }> = ({ f, at, text, cps = 28, style }) => {
  const n = Math.max(0, Math.floor(((f - F(at)) / FPS) * cps));
  if (f < F(at)) return null;
  return <span style={style}>{text.slice(0, n)}{n < text.length && f % 14 < 8 ? "▍" : ""}</span>;
};
const Chip: React.FC<{ text: string; bg?: string; color?: string; size?: number; style?: React.CSSProperties }> = ({ text, bg = "rgba(37,35,31,.07)", color = INK, size = 24, style }) => (
  <span style={{ display: "inline-block", fontFamily: /^[A-Za-z0-9 .\-·/:]+$/.test(text) ? EN : INTL, fontWeight: 600, fontSize: size, padding: "6px 14px", borderRadius: 10, background: bg, color, whiteSpace: "nowrap", ...style }}>{text}</span>
);
const Check: React.FC<{ on: boolean; size?: number; bad?: boolean }> = ({ on, size = 30, bad }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><circle cx={12} cy={12} r={11} fill={!on ? "rgba(37,35,31,.12)" : bad ? RED : GREEN} />
    {bad ? <path d="M8 8l8 8M16 8l-8 8" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" /> : <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />}</svg>
);
const Chat: React.FC<{ f: number; title?: string; user: { at: number; text: string; attach?: React.ReactNode }; replies: Array<{ at: number; text: string; tool?: boolean; color?: string }>; children?: React.ReactNode; h?: number }> = ({ f, title = "Claude", user, replies, children, h = 680 }) => (
  <Card style={{ left: 40, top: 30, width: 1280, minHeight: Math.min(h, 360), overflow: "hidden" }}>
    <Dots title={title} />
    <div style={{ padding: "26px 36px", display: "flex", flexDirection: "column", gap: 18 }}>
      {f >= F(user.at) && (
        <div style={{ alignSelf: "flex-end", maxWidth: 900, ...appear(sp(f, user.at)) }}>
          {user.attach}
          <div style={{ fontFamily: ZH, fontSize: 30, color: INK, background: "#F2EFE8", padding: "16px 22px", borderRadius: "20px 20px 6px 20px" }}><Typed f={f} at={user.at} text={user.text} cps={26} /></div>
        </div>
      )}
      {replies.map((r, k) => f >= F(r.at) && (
        <div key={k} style={{ ...appear(sp(f, r.at)), display: "flex", alignItems: "center", gap: 12 }}>
          {r.tool ? (
            <div style={{ fontFamily: MONO, fontSize: 24, color: r.color ?? BLUE, background: "rgba(55,103,240,.08)", padding: "10px 16px", borderRadius: 12 }}>● {r.text}</div>
          ) : (
            <div style={{ fontFamily: ZH, fontSize: 30, color: r.color ?? INK, lineHeight: 1.5 }}>{r.text}</div>
          )}
        </div>
      ))}
      {children}
    </div>
  </Card>
);
const Term: React.FC<{ f: number; x: number; y: number; w: number; h: number; title: string; lines: Array<{ at: number; text: string; color?: string; prompt?: boolean }> }> = ({ f, x, y, w, h, title, lines }) => (
  <Card style={{ left: x, top: y, width: w, height: h, background: "#1C1B19", overflow: "hidden", ...appear(sp(f, lines[0].at - 0.3)) }}>
    <Dots title={title} dark />
    <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 14 }}>
      {lines.map((l, k) => f >= F(l.at) && (
        <div key={k} style={{ fontFamily: MONO, fontSize: 25, color: l.color ?? "#EDEBE4", whiteSpace: "pre" }}>
          {l.prompt !== false && <span style={{ color: OR }}>{"> "}</span>}<Typed f={f} at={l.at} text={l.text} cps={40} />
        </div>
      ))}
    </div>
  </Card>
);
/** 她全屏段：右侧大标题区 */
const Big: React.FC<{ f: number; at: number; kicker?: string; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }> = ({ f, at, kicker, title, sub, children }) => {
  const p = sp(f, at, 14, 150);
  return (
    <div style={{ position: "absolute", left: 820, top: 230, width: 1000, ...appear(p, 40) }}>
      {kicker && <div style={{ fontFamily: ZH, fontWeight: 600, fontSize: 30, color: OR, marginBottom: 14 }}>{kicker}</div>}
      <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 84, lineHeight: 1.2, color: INK }}>{title}</div>
      {sub && <div style={{ fontFamily: ZH, fontSize: 34, color: MUTE, marginTop: 22, lineHeight: 1.5 }}>{sub}</div>}
      {children}
    </div>
  );
};
/** 你全屏段（横屏主播在左）：右侧窄栏 */
const Side: React.FC<{ f: number; at: number; kicker?: string; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }> = ({ f, at, kicker, title, sub, children }) => {
  const p = sp(f, at, 14, 150);
  return (
    <div style={{ position: "absolute", left: 1240, top: 190, width: 640, ...appear(p, 40) }}>
      {kicker && <div style={{ fontFamily: ZH, fontWeight: 600, fontSize: 28, color: OR, marginBottom: 12 }}>{kicker}</div>}
      <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 66, lineHeight: 1.2, color: INK }}>{title}</div>
      {sub && <div style={{ fontFamily: ZH, fontSize: 30, color: MUTE, marginTop: 18, lineHeight: 1.5 }}>{sub}</div>}
      {children}
    </div>
  );
};
const Browser: React.FC<{ f: number; at: number; url: string; img: string; iw: number; ih: number; w: number; children?: React.ReactNode; x?: number; y?: number }> = ({ f, at, url, img, iw, ih, w, children, x = 40, y = 20 }) => {
  const sc = w / iw;
  return (
    <Card style={{ left: x, top: y, width: w, overflow: "hidden", ...appear(sp(f, at)) }}>
      <div style={{ height: 50, display: "flex", alignItems: "center", gap: 9, padding: "0 18px", borderBottom: `1px solid ${LINE}`, background: "#F7F6F2" }}>
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
        <div style={{ marginLeft: 20, flex: 1, height: 32, borderRadius: 8, background: "#fff", border: `1px solid ${LINE}`, display: "flex", alignItems: "center", padding: "0 14px", fontFamily: MONO, fontSize: 18, color: MUTE }}>{url}</div>
      </div>
      <div style={{ position: "relative", width: w, height: ih * sc }}>
        <Img src={staticFile(img)} style={{ width: w, height: ih * sc }} />
        {children}
      </div>
    </Card>
  );
};
const Thumb: React.FC<{ src: string; w: number; h: number; label?: string; style?: React.CSSProperties; ring?: boolean }> = ({ src, w, h, label, style, ring }) => (
  <div style={{ position: "relative", width: w, height: h, borderRadius: 16, overflow: "hidden", boxShadow: ring ? `0 0 0 5px ${OR}, 0 12px 30px rgba(0,0,0,.2)` : "0 0 0 4px #fff, 0 12px 30px rgba(0,0,0,.18)", flexShrink: 0, ...style }}>
    <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    {label && <div style={{ position: "absolute", left: 8, bottom: 8 }}><Chip text={label} size={18} bg="rgba(0,0,0,.6)" color="#fff" /></div>}
  </div>
);
const Arrow: React.FC<{ label?: string; on: boolean }> = ({ label, on }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: on ? 1 : 0.2, flexShrink: 0 }}>
    {label && <Chip text={label} size={20} bg={on ? INK : "rgba(37,35,31,.08)"} color={on ? "#fff" : INK} />}
    <svg width={90} height={30} viewBox="0 0 90 30"><path d="M4 15h74M66 5l12 10-12 10" fill="none" stroke={on ? OR : MUTE} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" /></svg>
  </div>
);
const Wave: React.FC<{ f: number; at: number; w: number; h: number; color: string; active: boolean; mt?: number }> = ({ f, at, w, h, color, active, mt = 30 }) => {
  const n = 48;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, width: w, height: h, marginTop: mt }}>
      {Array.from({ length: n }).map((_, i) => {
        const a = active ? 0.25 + 0.75 * Math.abs(Math.sin(i * 0.7 + (f - F(at)) / 3.2) * Math.sin(i * 0.23 + (f - F(at)) / 7)) : 0.18;
        return <div key={i} style={{ flex: 1, height: `${a * 100}%`, borderRadius: 4, background: color, opacity: 0.85 }} />;
      })}
    </div>
  );
};

const LANGS: Array<[string, string, string]> = [["L_en", "English", "英语"], ["L_ja", "日本語", "日语"], ["L_ko", "한국어", "韩语"], ["L_fr", "Français", "法语"], ["L_es", "Español", "西班牙语"], ["L_ar", "العربية", "阿拉伯语"]];
const SCENES: Array<[string, string, string]> = [["shop", "直播间带货", "中文"], ["ad", "产品广告", "English"], ["travel", "旅游导览", "日本語"], ["class", "课程讲师", "中文"]];
const NEW_IDS = ["t1", "t2", "t3", "u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9", "u10", "u11", "t4", "t5", "u12"];

/* ================= 每段口播的画面 ================= */
const Scene: React.FC<{ id: string }> = ({ id }) => {
  const f = useCurrentFrame();
  switch (id) {
    /* ---------- 开场（她） ---------- */
    case "t1": return (
      <Big f={f} at={ST("t1")} kicker="第三期 · 升级版" title={<>上期做出了我<br />这期<span style={{ color: OR }}>全面升级</span></>}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 34 }}>
          {[["说外语", BLUE], ["进场景", GREEN], ["换角色", PURPLE], ["新同事", OR]].map(([w, c]) => <div key={w} style={appear(sp(f, W("t1", w), 10, 220))}><Chip text={w} size={36} bg={c} color="#fff" /></div>)}
        </div>
      </Big>
    );
    case "t2": return (
      <Big f={f} at={ST("t2")} kicker="老规矩，先复习" title={<>基础三步<br /><span style={{ color: OR }}>一分半钟</span></>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 30 }}>
          {["① 接工具：Renoise 连进 AI 助手", "② 做形象：一张照片 → 四视图", "③ 配声音：Grok 原声 / MiMo"].map((s, k) => <div key={s} style={{ ...appear(sp(f, W("t2", "基础三步") + 0.2 + k * 0.3, 12, 220)), fontFamily: ZH, fontWeight: 600, fontSize: 34, color: INK }}>{s}</div>)}
        </div>
      </Big>
    );
    /* ---------- 复用第二期：基础三步 ---------- */
    case "s1a": return (
      <Browser f={f} at={ST("s1a")} url="renoise.ai" img="shots/home.png" iw={2880} ih={1800} w={1280}>
        <Ring f={f} at={W("s1a", "注册")} x={2590 * (1280 / 2880)} y={62 * (1280 / 2880)} w={92} h={40} />
        <Ring f={f} at={W("s1a", "注册") + 0.4} x={2762 * (1280 / 2880)} y={62 * (1280 / 2880)} w={110} h={40} />
        {f >= F(W("s1a", "积分")) && <div style={{ position: "absolute", left: 760, top: 110, ...appear(sp(f, W("s1a", "积分"))) }}><Chip text="登录后右上角能看到积分余额" size={26} bg={INK} color="#fff" /></div>}
      </Browser>
    );
    case "s1b": return (
      <Browser f={f} at={ST("s1b")} url="Claude 桌面端 · 设置" img="shots/connectors.png" iw={2000} ih={1319} w={1180}>
        <Ring f={f} at={W("s1b", "连接器")} x={205 * (1180 / 2000)} y={1169 * (1180 / 2000)} w={150} h={42} />
        <Ring f={f} at={W("s1b", "添加自定义")} x={1722 * (1180 / 2000)} y={174 * (1180 / 2000)} w={110} h={46} />
        {f >= F(W("s1b", "添加自定义")) && <div style={{ position: "absolute", left: 640, top: 150, ...appear(sp(f, W("s1b", "添加自定义"))) }}><Chip text="Add → Add custom connector" size={26} bg={INK} color="#fff" /></div>}
      </Browser>
    );
    case "s1c": {
      const auth = W("s1c", "登录授权");
      return f < F(auth) ? (
        <Card style={{ left: 190, top: 40, width: 980, height: 600, padding: "36px 44px", ...appear(sp(f, ST("s1c"))) }}>
          <div style={{ fontFamily: EN, fontWeight: 700, fontSize: 40, color: INK }}>Add custom connector</div>
          <div style={{ fontFamily: EN, fontSize: 22, color: MUTE, marginTop: 8 }}>添加自定义连接器</div>
          <div style={{ marginTop: 34, fontFamily: ZH, fontSize: 22, color: MUTE }}>名称</div>
          <div style={{ marginTop: 8, height: 62, borderRadius: 12, border: `2px solid ${f >= F(W("s1c", "名称")) && f < F(W("s1c", "地址")) ? BLUE : LINE}`, display: "flex", alignItems: "center", padding: "0 18px", fontFamily: EN, fontSize: 30, color: INK }}><Typed f={f} at={W("s1c", "名称") + 0.3} text="Renoise" cps={14} /></div>
          <div style={{ marginTop: 22, fontFamily: ZH, fontSize: 22, color: MUTE }}>远程 MCP 服务器地址</div>
          <div style={{ marginTop: 8, height: 62, borderRadius: 12, border: `2px solid ${f >= F(W("s1c", "地址")) ? BLUE : LINE}`, display: "flex", alignItems: "center", padding: "0 18px", fontFamily: MONO, fontSize: 28, color: INK }}><Typed f={f} at={W("s1c", "地址") + 0.3} text="https://renoise.ai/api/public/mcp" cps={22} /></div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginTop: 40 }}>
            <div style={{ fontFamily: EN, fontSize: 26, padding: "12px 26px", borderRadius: 12, border: `1px solid ${LINE}` }}>Cancel</div>
            <div style={{ fontFamily: EN, fontWeight: 700, fontSize: 26, padding: "12px 26px", borderRadius: 12, background: INK, color: "#fff", transform: `scale(${f >= F(W("s1c", "点继续")) && f < F(W("s1c", "点继续")) + 6 ? 0.92 : 1})` }}>Continue</div>
          </div>
          <Ring f={f} at={W("s1c", "点继续")} x={818} y={474} w={178} h={66} />
        </Card>
      ) : (
        <Card style={{ left: 330, top: 60, width: 700, height: 560, padding: 44, display: "flex", flexDirection: "column", alignItems: "center", gap: 22, ...appear(sp(f, auth)) }}>
          <div style={{ fontFamily: EN, fontWeight: 800, fontSize: 56, color: OR }}>Renoise</div>
          <div style={{ fontFamily: ZH, fontWeight: 700, fontSize: 36, color: INK, textAlign: "center" }}>Claude 请求连接你的 Renoise 账号</div>
          <div style={{ fontFamily: ZH, fontSize: 26, color: MUTE }}>登录 renoise.ai，点同意即可，不用复制 API key</div>
          <div style={{ marginTop: 20, width: 420, height: 70, borderRadius: 14, background: GREEN, color: "#fff", display: "grid", placeItems: "center", fontFamily: ZH, fontWeight: 700, fontSize: 32 }}>同意授权</div>
          <Ring f={f} at={auth + 0.5} x={350} y={420} w={440} h={84} />
          <div style={{ fontFamily: ZH, fontSize: 20, color: MUTE }}>示意图</div>
        </Card>
      );
    }
    case "s1d": return (
      <>
        <Term f={f} x={40} y={20} w={1280} h={300} title="Claude Code" lines={[
          { at: W("s1d", "Claude Code"), text: "/plugin marketplace add ArcoCodes/renoise-plugins-official" },
          { at: W("s1d", "Claude Code") + 1.5, text: "/plugin install renoise@renoise-plugins-official" },
          { at: W("s1d", "插件命令") + 0.6, text: "首次使用会自动打开浏览器登录 Renoise", color: "#9BE3B5", prompt: false },
        ]} />
        {f >= F(W("s1d", "Codex") - 0.3) && <Term f={f} x={40} y={360} w={1280} h={280} title="Codex（终端）" lines={[
          { at: W("s1d", "Codex"), text: "codex mcp add renoise --url https://renoise.ai/api/public/mcp" },
          { at: W("s1d", "加上这个地址"), text: "codex mcp login renoise   # 提示登录时执行", color: "#C9C6BD" },
        ]} />}
      </>
    );
    case "s1e": return (
      <Chat f={f} user={{ at: W("s1e", "查一下") - 0.2, text: "查一下我的 Renoise 余额" }} replies={[
        { at: W("s1e", "能查到") - 0.4, text: "renoise · get_account", tool: true },
        { at: W("s1e", "能查到") + 0.3, text: "当前余额 4,833 credits（Advanced 套餐）" },
        { at: W("s1e", "连上了") - 0.2, text: "✓ 已连接，可以开始做视频了", color: GREEN },
      ]} />
    );
    case "s2a": return (
      <Big f={f} at={ST("s2a")} kicker="② 生成形象" title="先准备一张人物照" sub="数字人照片、你自己的生活照都可以">
        <div style={{ marginTop: 30, display: "flex", gap: 24, alignItems: "flex-end", ...appear(sp(f, W("s2a", "人物照"))) }}>
          <Img src={staticFile("demo/photo.jpg")} style={{ width: 200, height: 395, objectFit: "cover", borderRadius: 18, boxShadow: "0 0 0 5px #fff, 0 12px 30px rgba(0,0,0,.2)" }} />
          <div style={{ fontFamily: ZH, fontSize: 26, color: MUTE, lineHeight: 1.6 }}>正脸 · 光线均匀<br />头发不挡脸 · 嘴闭着<br /><span style={{ color: RED }}>只用本人或已授权的照片</span></div>
        </div>
      </Big>
    );
    case "s2b": return (
      <Chat f={f} user={{ at: W("s2b", "把照片") - 0.1, text: "帮我生成这个人的四视图：正面、两个侧面和背面", attach: <Img src={staticFile("demo/photo.jpg")} style={{ width: 90, height: 178, objectFit: "cover", borderRadius: 12, marginBottom: 10, display: "block", marginLeft: "auto" }} /> }} replies={[
        { at: W("s2b", "正面"), text: "renoise · gpt-image-2.5 · 2k · 约 23 积分", tool: true },
      ]}>
        {f >= F(W("s2b", "两个侧面")) && <Img src={staticFile("demo/multiview.png")} style={{ width: 540, borderRadius: 14, ...appear(sp(f, W("s2b", "两个侧面"))) }} />}
      </Chat>
    );
    case "s2c": {
      const labels = ["正面", "左侧", "右侧", "背面"];
      const cmpAt = W("s2c", "多用几个模型");
      return (
        <>
          <Card style={{ left: 40, top: 20, width: 1280, overflow: "hidden", ...appear(sp(f, ST("s2c"))) }}>
            <Img src={staticFile("demo/multiview.png")} style={{ width: 1280, display: "block" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 16, display: "flex", justifyContent: "space-around" }}>
              {labels.map((l, k) => <div key={l} style={appear(sp(f, ST("s2c") + 0.3 + k * 0.25, 10, 220))}><Chip text={l} bg="rgba(255,255,255,.92)" size={28} /></div>)}
            </div>
          </Card>
          {f >= F(cmpAt) && <div style={{ position: "absolute", left: 40, top: 762, display: "flex", gap: 14, ...appear(sp(f, cmpAt)) }}>
            <Chip text="多模型对比：" size={28} bg="transparent" />
            {["Grok Video 1.5", "Wan 3.0", "Seedance 2.5"].map((m, k) => <div key={m} style={appear(sp(f, cmpAt + 0.2 + k * 0.2, 10, 220))}><Chip text={m} size={28} bg={k === 0 ? OR : "rgba(37,35,31,.08)"} color={k === 0 ? "#fff" : INK} /></div>)}
            <Chip text="（对比细节见第二期）" size={24} bg="transparent" color={MUTE} />
          </div>}
        </>
      );
    }
    case "s3a": return <Big f={f} at={ST("s3a")} kicker="③ 配置音色" title={<>默认：<span style={{ color: OR }}>Grok 原生配音</span></>} sub="生成数字人时自带声音，就是你现在听到的这个"><Wave f={f} at={ST("s3a")} w={760} h={120} color={OR} active /></Big>;
    case "s3b": return (
      <div style={{ position: "absolute", left: 40, top: 30, display: "flex", gap: 36 }}>
        {[["音色设计", "写一句描述就生成", "「温柔知性的年轻女声，语速稍慢」", W("s3b", "按文字描述")], ["声音克隆", "上传十几秒录音", "像你自己的声音", W("s3b", "也能克隆")]].map(([t, s, e, a]) => (
          <Card key={t as string} style={{ position: "relative", width: 620, height: 520, padding: "40px 44px", ...appear(sp(f, a as number)) }}>
            <Chip text="小米 MiMo 语音" size={24} bg="rgba(247,147,30,.14)" color={OR} />
            <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 60, color: INK, marginTop: 26 }}>{t}</div>
            <div style={{ fontFamily: ZH, fontSize: 32, color: MUTE, marginTop: 12 }}>{s}</div>
            <div style={{ fontFamily: ZH, fontSize: 28, color: INK, marginTop: 40, padding: "18px 22px", background: "#F5F3EE", borderRadius: 14 }}>{e}</div>
            <div style={{ position: "absolute", left: 44, bottom: 40 }}><Wave f={f} at={a as number} w={530} h={70} color={t === "音色设计" ? BLUE : GREEN} active /></div>
          </Card>
        ))}
      </div>
    );
    /* ---------- 交棒 ---------- */
    case "t3": {
      const swap = W("t3", "换了声音"), hand = W("t3", "接棒");
      return (
        <>
          <Card style={{ left: 40, top: 30, width: 1280, height: 420, padding: "34px 44px", ...appear(sp(f, ST("t3"))) }}>
            <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 44, color: INK }}>上期留下的坑</div>
            {[["Grok 原声", "口型对得上", false, ST("t3") + 0.3, OR], ["换成新声音", "口型差约 100 毫秒", true, swap, BLUE]].map(([n, r, bad, a, c]) => (
              <div key={n as string} style={{ display: "flex", alignItems: "center", gap: 26, marginTop: 34, ...appear(sp(f, a as number)) }}>
                <span style={{ width: 210, fontFamily: ZH, fontWeight: 700, fontSize: 32, color: c as string }}>{n}</span>
                <Wave f={f} at={a as number} w={520} h={60} color={c as string} active mt={0} />
                <Check on size={40} bad={bad as boolean} />
                <span style={{ fontFamily: ZH, fontWeight: 600, fontSize: 32, color: bad ? RED : GREEN }}>{r}</span>
              </div>
            ))}
          </Card>
          {f >= F(hand - 0.5) && (
            <Card style={{ left: 40, top: 490, width: 1280, height: 230, padding: "28px 40px", display: "flex", alignItems: "center", gap: 34, ...appear(sp(f, hand - 0.5)) }}>
              <Thumb src="demo/me_polo.jpg" w={300} h={169} ring />
              <div>
                <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 48, color: INK }}>接下来：新同事登场 →</div>
                <div style={{ fontFamily: ZH, fontSize: 28, color: MUTE, marginTop: 10 }}>他来讲怎么解决，以及三个新玩法</div>
              </div>
            </Card>
          )}
        </>
      );
    }
    /* ---------- 你（新同事） ---------- */
    case "u1": return (
      <Side f={f} at={ST("u1") + 0.1} kicker="新同事登场" title={<>我也是<br /><span style={{ color: OR }}>数字人</span></>} sub="不同的是：用本人的一张照片做的">
        {f >= F(W("u1", "一张照片")) && <div style={{ marginTop: 30, ...appear(sp(f, W("u1", "一张照片"))) }}><Thumb src="demo/me_polo.jpg" w={420} h={236} label="原始照片 · 1 张" /></div>}
      </Side>
    );
    case "u2": return (
      <Side f={f} at={ST("u2")} kicker="照片要求" title={<>横屏照片<br />→ <span style={{ color: OR }}>横屏口播</span></>}>
        <div style={{ marginTop: 26 }}><Thumb src="demo/me_polo.jpg" w={460} h={259} /></div>
        <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
          {[["横屏", W("u2", "横屏")], ["正脸", W("u2", "正脸")], ["背景干净", W("u2", "背景干净")]].map(([w, a]) => (
            <div key={w as string} style={{ display: "flex", alignItems: "center", gap: 8, ...appear(sp(f, a as number, 10, 220)) }}><Check on={f >= F(a as number)} size={30} /><span style={{ fontFamily: ZH, fontWeight: 700, fontSize: 30, color: INK }}>{w}</span></div>
          ))}
        </div>
        {f >= F(W("u2", "直接就能")) && <div style={{ marginTop: 22, ...appear(sp(f, W("u2", "直接就能"))) }}><Chip text="Grok 1.5 · 16:9 · 不用裁切" size={26} bg={INK} color="#fff" /></div>}
      </Side>
    );
    case "u3": {
      const fix = W("u3", "最稳的做法");
      return (
        <>
          <Card style={{ left: 40, top: 30, width: 1280, height: 330, padding: "30px 44px", ...appear(sp(f, ST("u3"))) }}>
            <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 40, color: INK }}>口型跟着谁走？</div>
            <div style={{ display: "flex", alignItems: "center", gap: 26, marginTop: 40 }}>
              <div style={{ ...appear(sp(f, W("u3", "Grok"))) }}><Chip text="Grok 生成的画面" size={32} bg="rgba(247,147,30,.14)" color={OR} /></div>
              <div style={{ ...appear(sp(f, W("u3", "自己的声音") - 0.3)) }}><Chip text="← 口型跟随 ←" size={28} bg="transparent" color={MUTE} /></div>
              <div style={{ ...appear(sp(f, W("u3", "自己的声音"))) }}><Chip text="Grok 自己生成的声音" size={32} bg={OR} color="#fff" /></div>
            </div>
            <div style={{ fontFamily: ZH, fontSize: 26, color: MUTE, marginTop: 30 }}>Grok 只吃图片、不吃音频 → 事后换声，嘴就对不上</div>
          </Card>
          {f >= F(fix) && (
            <Card style={{ left: 40, top: 400, width: 1280, height: 300, padding: "30px 44px", ...appear(sp(f, fix)) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}><Check on size={44} /><span style={{ fontFamily: ZH, fontWeight: 800, fontSize: 46, color: GREEN }}>最稳：直接用目标语言开口</span></div>
              <div style={{ display: "flex", gap: 14, marginTop: 34 }}>
                {LANGS.map(([lid, n], k) => <div key={lid} style={appear(sp(f, W("u3", "目标语言") + k * 0.15, 10, 220))}><Chip text={n} size={30} bg="rgba(55,103,240,.1)" color={BLUE} /></div>)}
              </div>
            </Card>
          )}
        </>
      );
    }
    case "u4": {
      const a1 = W("u4", "一张照片"), a2 = W("u4", "一段录音");
      return (
        <Card style={{ left: 40, top: 30, width: 1280, height: 690, padding: "34px 44px", ...appear(sp(f, ST("u4"))) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}><Chip text="想用你自己的录音？" size={30} bg={INK} color="#fff" />{f >= F(W("u4", "音频驱动")) && <div style={appear(sp(f, W("u4", "音频驱动")))}><Chip text="换「音频驱动口型」的模型" size={30} bg="rgba(247,147,30,.14)" color={OR} /></div>}</div>
          {f >= F(W("u4", "OmniHuman") - 0.2) && <div style={{ fontFamily: EN, fontWeight: 800, fontSize: 76, color: INK, marginTop: 34, ...appear(sp(f, W("u4", "OmniHuman") - 0.2)) }}>OmniHuman 2.0</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 30, marginTop: 40 }}>
            <div style={appear(sp(f, a1))}><Thumb src="demo/me_polo.jpg" w={320} h={180} label="一张照片" /></div>
            <div style={{ fontFamily: EN, fontWeight: 800, fontSize: 60, color: MUTE, ...appear(sp(f, a2)) }}>+</div>
            <div style={{ width: 300, height: 180, borderRadius: 16, background: "rgba(36,168,99,.1)", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 22px", ...appear(sp(f, a2)) }}>
              <Chip text="🎙 我的录音.wav" size={24} bg="transparent" color={GREEN} />
              <Wave f={f} at={a2} w={250} h={60} color={GREEN} active={f >= F(a2)} mt={8} />
            </div>
            <Arrow on={f >= F(a2 + 0.5)} />
            <div style={{ ...appear(sp(f, a2 + 0.5)) }}><Chip text="口型跟着录音走的视频" size={30} bg={GREEN} color="#fff" /></div>
          </div>
          <div style={{ fontFamily: ZH, fontSize: 24, color: MUTE, marginTop: 40 }}>Renoise 模型列表里就有 · 视频时长 = 录音时长 · 只用你本人或已授权的声音</div>
        </Card>
      );
    }
    case "u5": {
      const ws = ["英语", "日语", "韩语"];
      return (
        <Side f={f} at={ST("u5")} kicker="升级 ①" title={<><span style={{ color: BLUE }}>多语言</span></>} sub="提示词里写清楚语言，台词直接用那门语言写">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 196px)", gap: 14, marginTop: 26 }}>
            {LANGS.map(([lid, n, zh], k) => {
              const a = k < 3 ? W("u5", ws[k]) : W("u5", "那门语言") + (k - 3) * 0.2;
              const vert = lid !== "L_es" && lid !== "L_ar";
              return (
                <div key={lid} style={{ ...appear(sp(f, a, 10, 220)) }}>
                  <div style={{ width: 196, height: 140, borderRadius: 14, overflow: "hidden", boxShadow: "0 0 0 3px #fff, 0 8px 20px rgba(0,0,0,.15)" }}><Img src={staticFile(`lang/${lid}.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: vert ? "50% 22%" : "50% 30%" }} /></div>
                  <div style={{ marginTop: 6, fontFamily: INTL, fontWeight: 700, fontSize: 22, color: INK }}>{n} <span style={{ color: MUTE, fontWeight: 400 }}>{zh}</span></div>
                </div>
              );
            })}
          </div>
        </Side>
      );
    }
    case "u6": {
      const bad = W("u6", "别写中文"), good = W("u6", "提前翻好"), chk = W("u6", "语音识别");
      return (
        <>
          <Card style={{ left: 40, top: 20, width: 1280, height: 360, padding: "26px 36px", background: "#1C1B19", ...appear(sp(f, ST("u6"))) }}>
            <div style={{ fontFamily: MONO, fontSize: 22, color: "#8D8A82" }}>提示词 · grok-video-1.5</div>
            <div style={{ fontFamily: MONO, fontSize: 26, color: "#EDEBE4", marginTop: 16, lineHeight: 1.6 }}>She speaks <span style={{ color: OR }}>Japanese</span>, clearly lip-synced:</div>
            {f >= F(bad) && f < F(good) && <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14, ...appear(sp(f, bad)) }}><Check on bad size={36} /><span style={{ fontFamily: ZH, fontSize: 32, color: "#FF9A9C", textDecoration: "line-through" }}>“你好，我是 AI 数字人。”（让它自己翻）</span></div>}
            {f >= F(good) && <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14, ...appear(sp(f, good)) }}><Check on size={36} /><span style={{ fontFamily: INTL, fontSize: 34, color: "#9BE3B5" }}>“こんにちは！私はAIデジタルヒューマンです。”</span></div>}
          </Card>
          {f >= F(chk - 0.2) && (
            <Card style={{ left: 40, top: 410, width: 1280, height: 310, padding: "24px 36px", ...appear(sp(f, chk - 0.2)) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}><Chip text="whisper 按语言回听" size={24} bg="rgba(55,103,240,.1)" color={BLUE} /><span style={{ fontFamily: ZH, fontSize: 24, color: MUTE }}>和台词逐字比对 · 本期真实结果</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px 30px", marginTop: 22 }}>
                {LANGS.map(([lid, n], k) => {
                  const acc = QA[lid]?.acc ?? 0; const ok = acc >= 0.8;
                  return <div key={lid} style={{ display: "flex", alignItems: "center", gap: 12, ...appear(sp(f, chk + 0.2 + k * 0.18, 10, 220)) }}><Check on bad={!ok} size={30} /><span style={{ fontFamily: INTL, fontWeight: 600, fontSize: 28, color: INK, width: 150 }}>{n}</span><span style={{ fontFamily: EN, fontWeight: 700, fontSize: 28, color: ok ? GREEN : OR }}>{Math.round(acc * 100)}%</span></div>;
                })}
              </div>
            </Card>
          )}
        </>
      );
    }
    case "u7": {
      const ws = ["直播间带货", "产品广告", "旅游导览", "讲师"];
      return (
        <Side f={f} at={ST("u7")} kicker="升级 ②" title={<><span style={{ color: GREEN }}>进场景</span></>} sub="同一个数字人，换个地方开工">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 300px)", gap: 16, marginTop: 24 }}>
            {SCENES.map(([s, n], k) => (
              <div key={s} style={appear(sp(f, W("u7", ws[k]), 10, 220))}><Thumb src={`stills/${s}.jpg`} w={300} h={170} label={n} /></div>
            ))}
          </div>
        </Side>
      );
    }
    case "u8": {
      const a1 = W("u8", "人物照片"), a2 = W("u8", "场景描述"), a3 = W("u8", "图片模型"), a4 = W("u8", "开场画面");
      return (
        <Card style={{ left: 40, top: 30, width: 1280, height: 690, padding: "30px 40px", ...appear(sp(f, ST("u8"))) }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}><Chip text="第一步" size={30} bg={INK} color="#fff" /><span style={{ fontFamily: ZH, fontWeight: 700, fontSize: 36, color: INK }}>合成一张开场画面</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 40 }}>
            <div style={appear(sp(f, a1))}><Thumb src="demo/photo.jpg" w={220} h={390} label="人物照片" /></div>
            <div style={{ fontFamily: EN, fontWeight: 800, fontSize: 54, color: MUTE, ...appear(sp(f, a2)) }}>+</div>
            <div style={{ width: 300, height: 390, borderRadius: 16, background: "#F5F3EE", padding: "22px 22px", fontFamily: ZH, fontSize: 24, color: INK, lineHeight: 1.6, ...appear(sp(f, a2)) }}>
              <Chip text="场景描述" size={20} bg={INK} color="#fff" />
              <div style={{ marginTop: 14 }}><Typed f={f} at={a2 + 0.2} text="明亮的直播间，环形补光灯；她穿米色针织开衫，手里举着一瓶白色精华；人物不变；画面里不要文字和 logo" cps={22} /></div>
            </div>
            <Arrow on={f >= F(a3)} label="GPT Image 2.5 · 23 积分" />
            <div style={appear(sp(f, a4))}><Thumb src="stills/shop.jpg" w={220} h={390} label="开场画面" ring={f >= F(a4)} /></div>
          </div>
        </Card>
      );
    }
    case "u9": return (
      <Chat f={f} user={{ at: W("u9", "比如") + 0.1, text: "让她站在直播间里，手里拿着一瓶精华。人物不变，只换背景、服装和道具。", attach: <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}><Img src={staticFile("demo/photo.jpg")} style={{ width: 80, height: 158, objectFit: "cover", borderRadius: 12 }} /></div> }} replies={[
        { at: W("u9", "人物不变"), text: "renoise · gpt-image-2.5 · 9:16 · 2k · 23 积分", tool: true },
      ]}>
        {f >= F(W("u9", "背景")) && (
          <div style={{ display: "flex", gap: 18, alignItems: "flex-end", ...appear(sp(f, W("u9", "背景"))) }}>
            <Thumb src="stills/shop.jpg" w={170} h={302} label="直播间" />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 6 }}>
              {[["脸", "不变 ✓", GREEN], ["背景", "直播间", OR], ["服装", "米色开衫", OR], ["道具", "精华瓶", OR]].map(([k, v, c]) => <div key={k as string} style={{ display: "flex", gap: 14, fontFamily: ZH, fontSize: 26 }}><span style={{ width: 70, color: MUTE }}>{k}</span><span style={{ fontWeight: 700, color: c as string }}>{v}</span></div>)}
            </div>
          </div>
        )}
      </Chat>
    );
    case "u10": {
      const a1 = W("u10", "交给"), a2 = W("u10", "写好台词"), a3 = W("u10", "开口了");
      return (
        <Card style={{ left: 40, top: 30, width: 1280, height: 690, padding: "30px 40px", ...appear(sp(f, ST("u10"))) }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}><Chip text="第二步" size={30} bg={INK} color="#fff" /><span style={{ fontFamily: ZH, fontWeight: 700, fontSize: 36, color: INK }}>画面交给 Grok，写好台词</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 34 }}>
            <div style={appear(sp(f, ST("u10") + 0.2))}><Thumb src="stills/shop.jpg" w={220} h={390} label="开场画面" /></div>
            <Arrow on={f >= F(a1)} label="Grok Video 1.5" />
            <div style={{ width: 420, height: 390, borderRadius: 16, background: "#1C1B19", padding: "22px 24px", ...appear(sp(f, a2 - 0.2)) }}>
              <div style={{ fontFamily: MONO, fontSize: 18, color: "#8D8A82" }}>台词（中文 · 直播带货语气）</div>
              <div style={{ fontFamily: ZH, fontSize: 28, color: "#EDEBE4", marginTop: 14, lineHeight: 1.6 }}><Typed f={f} at={a2} text="“家人们看过来！这瓶精华一滴就能推开，今天直播间下单，再送小样！”" cps={18} /></div>
              <div style={{ marginTop: 18 }}><Chip text="720p · 8 秒 · 136 积分" size={20} bg="rgba(255,255,255,.1)" color="#EDEBE4" /></div>
            </div>
            <div style={{ ...appear(sp(f, a3)) }}><Chip text="▶ 开口了" size={34} bg={GREEN} color="#fff" /></div>
          </div>
        </Card>
      );
    }
    case "u11": {
      const ws = ["带货", "广告", "导览", "讲课"];
      const tag = W("u11", "标注");
      return (
        <>
          <div style={{ position: "absolute", left: 40, top: 20, display: "flex", gap: 18 }}>
            {SCENES.map(([s, n], k) => {
              const a = W("u11", ws[k]); const v = s === "shop" || s === "travel";
              return (
                <div key={s} style={{ ...appear(sp(f, a, 10, 220)), textAlign: "center" }}>
                  <Thumb src={`stills/${s}.jpg`} w={v ? 230 : 330} h={v ? 409 : 409} style={{ objectPosition: "center" }} />
                  <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}><Check on={f >= F(a)} size={28} /><span style={{ fontFamily: ZH, fontWeight: 700, fontSize: 28, color: INK }}>{n}</span></div>
                </div>
              );
            })}
          </div>
          {f >= F(W("u11", "全搞定")) && <div style={{ position: "absolute", left: 40, top: 520, ...appear(sp(f, W("u11", "全搞定"))) }}><Chip text="一张照片 → 4 个场景，每张画面 23 积分" size={32} bg={INK} color="#fff" /></div>}
          {f >= F(tag) && <div style={{ position: "absolute", left: 40, top: 600, ...appear(sp(f, tag)) }}><Chip text="⚠ 商用之前，记得标注「AI 生成」" size={32} bg="rgba(229,72,77,.1)" color={RED} style={{ border: `2px solid ${RED}` }} /></div>}
        </>
      );
    }
    /* ---------- 换角色（她） ---------- */
    case "t4": return (
      <Big f={f} at={ST("t4")} kicker="升级 ③" title={<><span style={{ color: PURPLE }}>换角色</span></>} sub="谁说数字人一定是人？">
        <div style={{ display: "flex", gap: 24, marginTop: 34 }}>
          <div style={appear(sp(f, W("t4", "小猫"), 10, 220))}><Thumb src="stills/cat.jpg" w={250} h={444} label="橘猫店长" /></div>
          <div style={appear(sp(f, W("t4", "小狗"), 10, 220))}><Thumb src="stills/dog.jpg" w={444} h={250} label="柴犬主播" style={{ marginTop: 194 }} /></div>
        </div>
      </Big>
    );
    case "t5": {
      const a1 = W("t5", "先生成角色形象"), a2 = W("t5", "再写台词"), a3 = W("t5", "这只猫在说话"), a4 = W("t5", "嘴巴要跟着动");
      return (
        <>
          <div style={{ position: "absolute", left: 40, top: 20, ...appear(sp(f, a1)) }}><Thumb src="stills/cat.jpg" w={300} h={533} label="GPT Image 2.5 · 23 积分" /></div>
          <Card style={{ left: 380, top: 20, width: 940, height: 533, padding: "28px 34px", background: "#1C1B19", ...appear(sp(f, a2 - 0.2)) }}>
            <div style={{ fontFamily: MONO, fontSize: 20, color: "#8D8A82" }}>提示词 · grok-video-1.5</div>
            <div style={{ fontFamily: MONO, fontSize: 25, color: "#EDEBE4", marginTop: 18, lineHeight: 1.65 }}>
              <span style={{ background: f >= F(a3) ? "rgba(247,147,30,.3)" : "transparent", borderRadius: 6 }}>The orange cat talks to the camera</span> like a shop manager:{" "}
              <span style={{ background: f >= F(a4) ? "rgba(36,168,99,.35)" : "transparent", borderRadius: 6 }}>its mouth clearly opens and closes in sync with the words</span>, ears twitch…
            </div>
            <div style={{ fontFamily: ZH, fontSize: 28, color: "#9BE3B5", marginTop: 26 }}>“喵～这罐猫粮，本喵亲自试吃过，好吃到舔盘！”</div>
          </Card>
          <div style={{ position: "absolute", left: 40, top: 590, display: "flex", gap: 14 }}>
            {[["① 先生成角色形象", a1], ["② 再写台词", a2], ["③ 写清楚谁在说话", a3], ["④ 嘴巴跟着动", a4]].map(([t, a]) => <div key={t as string} style={appear(sp(f, a as number, 10, 220))}><Chip text={t as string} size={28} bg={f >= F(a as number) ? INK : "rgba(37,35,31,.07)"} color={f >= F(a as number) ? "#fff" : INK} /></div>)}
          </div>
        </>
      );
    }
    /* ---------- 成片流程 ---------- */
    case "u12": return (
      <Side f={f} at={ST("u12")} kicker="最后" title={<>串成<br />一条片子</>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 30 }}>
          {["脚本", "Skill", "剪辑"].map((w, k) => <div key={w} style={{ display: "flex", alignItems: "center", gap: 14, ...appear(sp(f, W("u12", w), 10, 220)) }}><Chip text={`${k + 4 > 6 ? "" : ""}${w}`} size={40} bg={f >= F(W("u12", w)) ? OR : "rgba(37,35,31,.07)"} color={f >= F(W("u12", w)) ? "#fff" : INK} /><span style={{ fontFamily: ZH, fontSize: 26, color: MUTE }}>{["切段 · 先报价再生成", "形象/音色/规则一次写好", "字幕 · 画中画 · 配乐"][k]}</span></div>)}
        </div>
      </Side>
    );
    case "s4b": {
      const S5 = ITEMS.filter((i) => i.kind === "nar" && NEW_IDS.includes(i.id)).slice(3, 8);
      return (
        <Card style={{ left: 40, top: 20, width: 1280, height: 700, padding: "30px 40px", ...appear(sp(f, ST("s4b"))) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}><Chip text="自动切段" size={28} bg={INK} color="#fff" /><Chip text="每段 ≤ 15 秒（Grok 单段上限）" size={26} bg="rgba(247,147,30,.14)" color={OR} /></div>
          {S5.map((s, k) => {
            const p = sp(f, ST("s4b") + 0.4 + k * 0.45, 12, 200);
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 0", borderTop: `1px solid ${LINE}`, ...appear(p) }}>
                <span style={{ width: 70, fontFamily: EN, fontWeight: 700, fontSize: 26, color: MUTE }}>{String(k + 1).padStart(2, "0")}</span>
                <span style={{ flex: 1, fontFamily: ZH, fontSize: 27, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.text}</span>
                <span style={{ width: 110, textAlign: "right", fontFamily: EN, fontWeight: 700, fontSize: 28, color: GREEN }}>{Math.ceil(s.dur)} 秒</span>
              </div>
            );
          })}
          <div style={{ fontFamily: ZH, fontSize: 22, color: MUTE, marginTop: 14 }}>这期新生成的真实切段 · 共 30 段（口播 17 · 多语言 6 · 场景和角色 7）</div>
        </Card>
      );
    }
    case "s4c": {
      const ok = W("s4c", "点头");
      return (
        <Chat f={f} title="Claude Code" user={{ at: ST("s4c") + 0.1, text: "按这个方案生成第三期的片段" }} replies={[
          { at: W("s4c", "生成之前") - 0.3, text: "renoise · estimate_cost", tool: true },
          { at: W("s4c", "要花多少"), text: "30 段 · 约 224 秒 + 7 张场景图 · 预估 3,409 积分 · 当前余额 4,833" },
          { at: W("s4c", "要花多少") + 0.6, text: "确认后我再开始生成，可以吗？", color: OR },
        ]}>
          {f >= F(ok - 0.4) && <div style={{ display: "flex", gap: 16, ...appear(sp(f, ok - 0.4)) }}>
            <div style={{ fontFamily: ZH, fontWeight: 700, fontSize: 28, padding: "12px 28px", borderRadius: 12, background: GREEN, color: "#fff", transform: `scale(${f >= F(ok) && f < F(ok) + 6 ? 0.92 : 1})` }}>确认，开始生成</div>
            <div style={{ fontFamily: ZH, fontSize: 28, padding: "12px 28px", borderRadius: 12, border: `1px solid ${LINE}` }}>我再改改稿子</div>
          </div>}
        </Chat>
      );
    }
    case "s4d": {
      const rows = (qa as Array<{ id: string; acc: number; lang: string }>).filter((r) => ["u1", "u5", "L_ja", "L_ar", "S_cat"].includes(r.id));
      return (
        <Card style={{ left: 40, top: 20, width: 1280, height: 700, padding: "30px 40px", ...appear(sp(f, ST("s4d"))) }}>
          {[["先拍第 1 段，听音色", W("s4d", "先做")], ["满意再批量生成", W("s4d", "批量")], ["逐段回听，比对文稿", W("s4d", "逐段")], ["念错了就单独重拍", W("s4d", "单独重做")]].map(([t, a], k) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14, ...appear(sp(f, a as number)) }}><Check on={f >= F(a as number)} /><span style={{ fontFamily: ZH, fontWeight: 600, fontSize: 32, color: INK }}>{t}</span></div>
          ))}
          {f >= F(W("s4d", "逐段")) && (
            <div style={{ marginTop: 18, borderTop: `1px solid ${LINE}`, paddingTop: 16, ...appear(sp(f, W("s4d", "逐段"))) }}>
              <div style={{ fontFamily: ZH, fontSize: 22, color: MUTE, marginBottom: 8 }}>本期真实回听结果（节选）</div>
              {rows.map((r) => <div key={r.id} style={{ display: "flex", gap: 30, fontFamily: MONO, fontSize: 24, color: INK, padding: "6px 0" }}><span style={{ width: 90 }}>{r.id}</span><span style={{ width: 70 }}>{r.lang}</span><span style={{ width: 90, color: r.acc < 0.85 ? OR : GREEN }}>{Math.round(r.acc * 100)}%</span></div>)}
            </div>
          )}
        </Card>
      );
    }
    case "s6b": {
      const tree: Array<[string, string, string]> = [["SKILL.md", "流程 · 红线 · 用法", "Skill"], ["persona.json", "形象 · 音色 · 提示词模板", "形象"], ["scripts/build_tasks.py", "切段规则 · 报价", "切段规则"], ["scripts/rangedl.py", "分片下载 · 校验", "切段规则"], ["scripts/assemble.py", "回听 · 剪空白 · 拼接", "切段规则"], ["references/edit-styles.md", "剪辑风格（9:16 / 16:9 / 教程）", "剪辑风格"]];
      return (
        <Card style={{ left: 40, top: 20, width: 1280, height: 700, padding: "30px 40px", background: "#1C1B19", ...appear(sp(f, ST("s6b"))) }}>
          <div style={{ fontFamily: MONO, fontSize: 28, color: OR, marginBottom: 20 }}>~/.claude/skills/digital-human-koubo/</div>
          {tree.map(([n, d, w]) => {
            const on = f >= F(W("s6b", w));
            return <div key={n} style={{ display: "flex", gap: 30, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,.08)", opacity: on ? 1 : 0.35 }}><span style={{ width: 460, fontFamily: MONO, fontSize: 26, color: on ? "#EDEBE4" : "#8D8A82" }}>├─ {n}</span><span style={{ fontFamily: ZH, fontSize: 28, color: on ? "#9BE3B5" : "#8D8A82" }}>{d}</span></div>;
          })}
          <div style={{ fontFamily: ZH, fontSize: 22, color: "#8D8A82", marginTop: 16 }}>已装在本机 · 这期新增两位角色：她 + 新同事</div>
        </Card>
      );
    }
    case "s6c": return (
      <Chat f={f} title="Claude Code" user={{ at: W("s6c", "用我的") - 0.2, text: "用我的数字人 Skill 讲这段内容：……" }} replies={[
        { at: W("s6c", "出来的") - 0.4, text: "Skill · digital-human-koubo 已加载", tool: true, color: GREEN },
        { at: W("s6c", "同一个我") - 0.2, text: "形象 / 音色 / 提示词 / 切段规则已就位 → 先报价，等你确认再生成" },
        { at: W("s6c", "非常稳定") - 0.2, text: "同一个人 · 同一种风格 ✓", color: GREEN },
      ]} />
    );
    case "s7b": {
      const feats = [["对齐字幕", "对齐字幕"], ["花字和表情", "花字"], ["画中画", "画中画"], ["背景音乐", "背景音乐"], ["横屏竖屏", "横屏"]];
      return (
        <>
          <Card style={{ left: 40, top: 20, width: 340, height: 604, overflow: "hidden", ...appear(sp(f, ST("s7b"))) }}>
            <Sequence from={F(ST("s7b"))} durationInFrames={F(BY.s7b.dur) + 4} layout="none"><OffthreadVideo src={staticFile("show/koubo.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /></Sequence>
            <div style={{ position: "absolute", left: 10, top: 10 }}><Chip text="竖屏花字版" size={20} bg="rgba(0,0,0,.6)" color="#fff" /></div>
          </Card>
          <Card style={{ left: 420, top: 20, width: 900, height: 506, overflow: "hidden", ...appear(sp(f, ST("s7b") + 0.2)) }}>
            <Sequence from={F(ST("s7b"))} durationInFrames={F(BY.s7b.dur) + 4} layout="none"><OffthreadVideo src={staticFile("show/memt.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /></Sequence>
            <div style={{ position: "absolute", left: 12, top: 12 }}><Chip text="横屏侧边版" size={20} bg="rgba(0,0,0,.6)" color="#fff" /></div>
          </Card>
          <div style={{ position: "absolute", left: 420, top: 560, display: "flex", flexWrap: "wrap", gap: 14, width: 900 }}>
            {feats.map(([t, w]) => f >= F(W("s7b", w)) && <div key={t} style={appear(sp(f, W("s7b", w), 10, 220))}><Chip text={`✓ ${t}`} size={30} bg="rgba(36,168,99,.14)" color={GREEN} /></div>)}
          </div>
        </>
      );
    }
    case "s7c": {
      const tracks = [["数字人", 34, OR], ["字幕", 60, BLUE], ["界面画面", 30, PURPLE], ["场景片段", 12, GREEN], ["配乐", 1, "#9A968C"]];
      const ph = interpolate(f, [F(ST("s7c")), F(EN_("s7c"))], [0.08, 0.92], clamp);
      const mm = Math.floor(tl.total / 60), ss = Math.round(tl.total % 60);
      return (
        <Card style={{ left: 40, top: 40, width: 1280, height: 560, padding: "28px 34px", ...appear(sp(f, ST("s7c"))) }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18 }}><Chip text="Remotion" size={26} bg={INK} color="#fff" /><span style={{ fontFamily: ZH, fontSize: 26, color: MUTE }}>这期教程的工程 · {mm} 分 {ss} 秒 · 两位主播</span></div>
          <div style={{ position: "relative" }}>
            {tracks.map(([n, k, c]) => (
              <div key={n as string} style={{ display: "flex", alignItems: "center", gap: 16, height: 74 }}>
                <span style={{ width: 120, fontFamily: ZH, fontWeight: 600, fontSize: 24, color: INK }}>{n}</span>
                <div style={{ flex: 1, display: "flex", gap: 3, height: 42 }}>
                  {Array.from({ length: k as number }).map((_, i) => <div key={i} style={{ flex: 1, borderRadius: 6, background: c as string, opacity: 0.35 + 0.65 * ((i * 37) % 10) / 10 }} />)}
                </div>
              </div>
            ))}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `calc(136px + (100% - 136px) * ${ph})`, width: 3, background: RED }} />
          </div>
        </Card>
      );
    }
    default: return null;
  }
};

/* ================= 全屏片段：多语言 / 场景 / 动物 / 快闪 ================= */
const ClipView: React.FC<{ it: Item }> = ({ it }) => {
  const f = useCurrentFrame();
  const local = f - F(it.start);
  const v = it.vert;
  const zoom = it.role === "montage" ? 1.04 : interpolate(local, [0, F(it.dur)], [1, 1.04], clamp);
  const flash = interpolate(local, [0, 4], [it.role === "scene" ? 0.25 : 0.5, 0], clamp);
  const video = (style: React.CSSProperties) => (
    <Sequence from={F(it.start)} durationInFrames={F(it.dur) + 2} layout="none">
      <OffthreadVideo src={staticFile(it.src!)} muted startFrom={F(it.offset ?? 0)} style={style} />
    </Sequence>
  );
  const chipP = sp(f, it.start + 0.15, 12, 200);
  return (
    <AbsoluteFill style={{ background: "#111" }}>
      {v ? (
        <>
          <AbsoluteFill style={{ filter: "blur(40px) brightness(.55)", transform: "scale(1.2)" }}>{video({ width: "100%", height: "100%", objectFit: "cover" })}</AbsoluteFill>
          <div style={{ position: "absolute", left: (1920 - 590) / 2, top: 20, width: 590, height: 1049, borderRadius: 26, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,.5)", transform: `scale(${zoom})` }}>{video({ width: "100%", height: "100%", objectFit: "cover" })}</div>
        </>
      ) : (
        <AbsoluteFill style={{ transform: `scale(${zoom})` }}>{video({ width: "100%", height: "100%", objectFit: "cover" })}</AbsoluteFill>
      )}
      {it.role !== "montage" && (
        <div style={{ position: "absolute", left: 60, top: 54, display: "flex", gap: 12, alignItems: "center", ...appear(chipP, -20) }}>
          {it.role === "lang" ? (
            <><span dir="auto" style={{ fontFamily: INTL, fontWeight: 800, fontSize: 64, color: "#fff", textShadow: "0 4px 20px rgba(0,0,0,.5)" }}>{it.label}</span><Chip text={it.zh2 ?? ""} size={30} bg={OR} color="#fff" /></>
          ) : (
            <><Chip text={it.label ?? ""} size={34} bg={OR} color="#fff" /><Chip text={it.lang ?? ""} size={28} bg="rgba(0,0,0,.55)" color="#fff" /></>
          )}
        </div>
      )}
      <div style={{ position: "absolute", right: 50, top: 60 }}><Chip text="AI 生成" size={22} bg="rgba(0,0,0,.5)" color="#fff" /></div>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
};

const TitleCard: React.FC<{ it: Item }> = ({ it }) => {
  const f = useCurrentFrame();
  const p = sp(f, it.start, 13, 160), p2 = sp(f, it.start + 0.35, 13, 160), p3 = sp(f, it.start + 0.7, 13, 160);
  const tiles = ["lang/L_en.jpg", "lang/L_es.jpg", "stills/shop.jpg", "stills/ad.jpg", "stills/cat.jpg", "stills/dog.jpg", "stills/travel.jpg", "stills/class.jpg"];
  return (
    <AbsoluteFill style={{ background: BG }}>
      <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gridTemplateRows: "repeat(2, 1fr)", gap: 10, padding: 10, opacity: 0.22 }}>
        {tiles.map((s, k) => <div key={s} style={{ borderRadius: 18, overflow: "hidden", opacity: Math.min(1, sp(f, it.start + k * 0.05, 14, 200) * 1.4) }}><Img src={staticFile(s)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>)}
      </div>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: ZH, fontWeight: 600, fontSize: 36, color: MUTE, ...appear(p) }}>AIGC 自媒体视频创作教程 · 第三期</div>
        <div style={{ fontFamily: ZH, fontWeight: 900, fontSize: 132, color: INK, marginTop: 16, ...appear(p2, 50) }}>数字人<span style={{ color: OR }}>升级版</span></div>
        <div style={{ display: "flex", gap: 18, marginTop: 34, ...appear(p3) }}>
          {[["多语言", BLUE], ["进场景", GREEN], ["换角色", PURPLE], ["两位主播", OR]].map(([w, c]) => <Chip key={w} text={w} size={40} bg={c} color="#fff" />)}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ it: Item }> = ({ it }) => {
  const f = useCurrentFrame();
  const p = sp(f, it.start + 0.1, 14, 150);
  return (
    <AbsoluteFill style={{ background: BG }}>
      <div style={{ position: "absolute", left: 120, top: 250, ...appear(p, 40) }}>
        <div style={{ fontFamily: EN, fontWeight: 800, fontSize: 96, color: INK }}>renoise<span style={{ color: OR }}>.ai</span></div>
        <div style={{ fontFamily: ZH, fontSize: 36, color: MUTE, marginTop: 26 }}>插件与连接器：<span style={{ fontFamily: MONO, color: INK }}>renoise.ai/plugin</span></div>
        <div style={{ fontFamily: ZH, fontSize: 36, color: MUTE, marginTop: 12 }}>MCP 地址：<span style={{ fontFamily: MONO, color: INK }}>renoise.ai/api/public/mcp</span></div>
        <div style={{ marginTop: 44, display: "flex", gap: 14 }}><Chip text="AIGC 自媒体视频创作教程 · 第三期" size={30} bg={OR} color="#fff" /><Chip text="全片人物与场景均为 AI 生成" size={26} /></div>
      </div>
      <div style={{ position: "absolute", right: 120, top: 200, width: 640, height: 360, borderRadius: 26, overflow: "hidden", boxShadow: "0 0 0 6px #fff, 0 24px 60px rgba(0,0,0,.2)", ...appear(sp(f, it.start + 0.3, 14, 150), 40) }}>
        <Img src={staticFile("stills/duo.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    </AbsoluteFill>
  );
};

/* ================= 声音 ================= */
type Cue = [number, string, number];
const SFX: Cue[] = (() => {
  const c: Cue[] = [];
  ITEMS.forEach((it, k) => {
    const prev = ITEMS[k - 1];
    if (it.kind === "nar" && it.shot === "full" && prev?.kind === "nar") c.push([it.start, "swish-1", 0.18]);
    if (it.kind === "clip") c.push([it.start - 0.05, it.role === "montage" ? "swish-2" : "whoosh", it.role === "montage" ? 0.22 : 0.3]);
    if (it.kind === "nar" && prev && prev.kind !== "nar") c.push([it.start, "swish-1", 0.22]);
  });
  const T = ITEMS.find((i) => i.kind === "title")!;
  c.push([T.start + 0.35, "pop", 0.4], [T.start + 0.7, "ding", 0.3]);
  c.push([W("s1a", "注册"), "click", 0.4], [W("s1b", "连接器"), "click", 0.4], [W("s1b", "添加自定义"), "click", 0.4], [W("s1c", "名称") + 0.3, "key-1", 0.3], [W("s1c", "地址") + 0.3, "key-2", 0.3], [W("s1c", "点继续"), "click", 0.45], [W("s1c", "登录授权") + 0.5, "ding", 0.3],
    [W("s1d", "Claude Code"), "key-3", 0.3], [W("s1d", "Codex"), "key-1", 0.3], [W("s1e", "连上了") - 0.2, "ding", 0.35], [W("s2b", "两个侧面"), "pop", 0.4],
    [W("t3", "接棒") - 0.5, "page-1", 0.4], [W("u2", "直接就能"), "pop", 0.35], [W("u3", "最稳的做法"), "ding", 0.3], [W("u4", "OmniHuman") - 0.2, "pop", 0.4],
    [W("u6", "别写中文"), "tap", 0.35], [W("u6", "提前翻好"), "ding", 0.3], [W("u8", "开场画面"), "pop", 0.4], [W("u9", "人物不变"), "key-2", 0.3], [W("u10", "开口了"), "pop", 0.4], [W("u11", "标注"), "tap", 0.4],
    [W("t5", "嘴巴要跟着动"), "ding", 0.3], [W("s4c", "点头"), "click", 0.45], [W("s6c", "出来的") - 0.4, "ding", 0.3]);
  ["说外语", "进场景", "换角色", "新同事"].forEach((w) => c.push([W("t1", w), "tap", 0.28]));
  ["英语", "日语", "韩语"].forEach((w) => c.push([W("u5", w), "tap", 0.28]));
  ["带货", "广告", "导览", "讲课"].forEach((w) => c.push([W("u11", w), "tap", 0.28]));
  const O = ITEMS.find((i) => i.kind === "outro")!; c.push([O.start + 0.1, "done", 0.4]);
  return c;
})();

export const Tutorial: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const it = at(t + 0.02);
  const bgmVol = (fr: number) => {
    const tt = fr / FPS;
    const cur = at(tt);
    const loud = !cur || cur.kind === "title" || cur.kind === "outro" || cur.role === "montage";
    const duck = cur && cur.kind === "clip" && cur.audio;
    return interpolate(fr, [0, 12, TOTAL - 30, TOTAL - 1], [0, 1, 1, 0], clamp) * (loud ? 0.22 : duck ? 0.035 : 0.065);
  };
  return (
    <AbsoluteFill style={{ background: BG }}>
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(37,35,31,.06) 1.2px, transparent 1.4px)", backgroundSize: "30px 30px" }} />
      {it && it.kind === "nar" && (
        <AbsoluteFill style={it.shot === "pip" ? { left: PANEL.x, top: PANEL.y, width: PANEL.w, height: PANEL.h } : undefined}>
          <Scene id={it.id} />
        </AbsoluteFill>
      )}
      {it && it.kind === "clip" && <ClipView it={it} />}
      {it && it.kind === "title" && <TitleCard it={it} />}
      {it && it.kind === "outro" && <Outro it={it} />}
      <Host />
      <TopBar />
      <Subs />
      {ITEMS.filter((i) => i.kind === "nar" || (i.kind === "clip" && i.audio)).map((i, k) => (
        <Sequence key={`a${k}`} from={F(i.start)} durationInFrames={F(i.dur) + 2} layout="none">
          <Audio src={staticFile(`nar_fx/${i.id}.wav`)} startFrom={F(i.offset ?? 0)} volume={(fr) => interpolate(fr, [F(i.dur) - 4, F(i.dur) + 1], [1, 0], clamp)} />
        </Sequence>
      ))}
      <Audio src={staticFile("music/bgm.mp3")} loop volume={bgmVol} />
      <Audio src={staticFile("demo/roomtone.wav")} volume={(fr) => interpolate(fr, [0, 15, TOTAL - 20, TOTAL - 1], [0, 1, 1, 0], clamp)} />
      {SFX.map(([a, n, v], k) => <Sequence key={k} from={Math.max(0, F(a))} durationInFrames={F(2)} layout="none"><Audio src={staticFile(`sfx/${n}.wav`)} volume={v} /></Sequence>)}
    </AbsoluteFill>
  );
};
