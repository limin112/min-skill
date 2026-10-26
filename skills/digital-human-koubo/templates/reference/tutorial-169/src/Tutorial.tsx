// AIGC 自媒体视频创作教程 · 第二期：手把手做一个 AI 数字人（16:9）。时间轴来自 tl.json（32 段 Grok 口播 + 3 段演示 + 片尾）。
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame } from "remotion";
import tl from "./tl.json";

const FPS = 30;
const F = (s: number) => Math.round(s * FPS);
export const TOTAL = F(tl.total);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ZH = '"PingFang SC","Hiragino Sans GB",sans-serif';
const EN = '"Avenir Next","Helvetica Neue",Arial,sans-serif';
const MONO = '"SF Mono",Menlo,monospace';
const BG = "#EDF0EA", INK = "#25231F", MUTE = "#7B786F", OR = "#F7931E", CARD = "#FFFFFF", GREEN = "#24A863", RED = "#E5484D", BLUE = "#3767F0", LINE = "rgba(37,35,31,.10)";

type Item = { kind: string; id: string; ch: string; shot?: string; text?: string; src?: string; start: number; dur: number; chars?: Record<string, number> };
const ITEMS = tl.items as unknown as Item[];
const BY: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
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

/* ================= 布局 ================= */
const FULL = { x: 230, y: 90, w: 480, h: 853 };
const PIP = { x: 1478, y: 196, w: 390, h: 693 };
const PANEL = { x: 70, y: 150, w: 1360, h: 780 };
const boxOf = (it?: Item) => (!it ? FULL : it.kind === "nar" ? (it.shot === "pip" ? PIP : FULL) : it.kind === "clone" ? PIP : it.kind === "outro" ? FULL : null);

const Host: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const k = ITEMS.findIndex((i) => t >= i.start && t < i.start + i.dur + 0.12);
  const it = ITEMS[Math.max(0, k)];
  const prev = ITEMS[Math.max(0, k - 1)];
  const to = boxOf(it), from = boxOf(prev) ?? to;
  if (!to) return null;
  const p = spring({ frame: f - F(it.start), fps: FPS, config: { damping: 18, stiffness: 150, mass: 0.8 } });
  const m = (a: number, b: number) => a + (b - a) * (from === to ? 1 : p);
  const b = { x: m(from!.x, to.x), y: m(from!.y, to.y), w: m(from!.w, to.w), h: m(from!.h, to.h) };
  const still = it.kind === "clone" ? "nar/s3d_last.jpg" : it.kind === "outro" ? "nar/e2_last.jpg" : null;
  const local = f - F(it.start);
  return (
    <div style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: 30, overflow: "hidden", background: "#111", boxShadow: "0 0 0 6px #fff, 0 24px 60px rgba(40,40,30,.25)" }}>
      {it.kind === "nar" ? (
        <Sequence from={F(it.start)} durationInFrames={F(it.dur) + 4} layout="none">
          <OffthreadVideo src={staticFile(it.src!)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </Sequence>
      ) : still ? <Img src={staticFile(still)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
      <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: k > 0 ? interpolate(local, [0, 3], [0.3, 0], clamp) : 0 }} />
      <div style={{ position: "absolute", left: 14, top: 14, fontFamily: ZH, fontSize: 17, color: "rgba(255,255,255,.9)", background: "rgba(0,0,0,.35)", padding: "3px 10px", borderRadius: 8 }}>内容由 AI 数字人演绎</div>
    </div>
  );
};

/* ================= 顶部：系列标题 + 七步进度 ================= */
const STEPS = ["准备工具", "生成形象", "配置音色", "脚本生成", "B-roll 画面", "沉淀 Skill", "剪辑合成"];
const NUM = ["①", "②", "③", "④", "⑤", "⑥", "⑦"];
const TopBar: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const it = ITEMS.find((i) => t >= i.start && t < i.start + i.dur + 0.12) ?? ITEMS[0];
  const cur = NUM.findIndex((n) => it.ch.startsWith(n));
  const p = sp(f, 0.1, 16, 120);
  return (
    <div style={{ position: "absolute", left: 70, right: 52, top: 40, display: "flex", alignItems: "center", justifyContent: "space-between", opacity: p }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontFamily: ZH, fontWeight: 600, fontSize: 26, color: INK }}>AIGC 自媒体视频创作教程</span>
        <span style={{ fontFamily: ZH, fontWeight: 600, fontSize: 22, color: "#fff", background: OR, padding: "3px 12px", borderRadius: 8 }}>第二期 · 做一个 AI 数字人</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {STEPS.map((s, k) => {
          const on = k === cur, done = cur > k || it.ch === "结尾";
          return (
            <div key={s} style={{ fontFamily: ZH, fontWeight: 600, fontSize: 18, padding: "6px 12px", borderRadius: 999, color: on ? "#fff" : done ? GREEN : MUTE,
              background: on ? INK : done ? "rgba(36,168,99,.12)" : "rgba(37,35,31,.06)", transform: `scale(${on ? 1.06 : 1})` }}>{NUM[k]} {s}</div>
          );
        })}
      </div>
    </div>
  );
};

/* ================= 字幕 ================= */
const HL = ["Renoise", "Claude Code", "Claude", "Codex", "MCP", "Grok", "Wan 3.0", "MiMo", "B-roll", "Skill", "四视图", "积分", "七步", "克隆", "连接器"];
type Line = { text: string; i0: number; it: Item; start: number; end: number };
const LINES: Line[] = (() => {
  const out: Line[] = [];
  for (const it of ITEMS) {
    if (it.kind !== "nar") continue;
    const txt = it.text!, ch = it.chars!;
    const at = (i: number) => { let k = i; while (ch[String(k)] === undefined && k < txt.length) k++; return it.start + (ch[String(k)] ?? it.dur); };
    const parts: Array<[string, number]> = []; let buf = "", b0 = 0;
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if ("，。：；！？".includes(c)) { if (buf.trim()) parts.push([buf, b0]); buf = ""; continue; }
      if (!buf) b0 = i; buf += c;
    }
    if (buf.trim()) parts.push([buf, b0]);
    parts.forEach(([p, o], k) => out.push({ text: p.trim(), i0: o, it, start: at(o), end: k + 1 < parts.length ? at(parts[k + 1][1]) - 0.03 : it.start + it.dur }));
  }
  return out;
})();
const Subs: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const ln = LINES.find((l) => t >= l.start - 0.05 && t < l.end);
  if (!ln) return null;
  const segs: Array<{ s: string; h: boolean }> = []; let rest = ln.text;
  while (rest) {
    let best = -1, w = "";
    for (const h of HL) { const i = rest.indexOf(h); if (i >= 0 && (best < 0 || i < best || (i === best && h.length > w.length))) { best = i; w = h; } }
    if (best < 0) { segs.push({ s: rest, h: false }); break; }
    if (best) segs.push({ s: rest.slice(0, best), h: false });
    segs.push({ s: w, h: true }); rest = rest.slice(best + w.length);
  }
  const pip = ln.it.shot === "pip";
  return (
    <div style={{ position: "absolute", left: pip ? PANEL.x : 0, width: pip ? PANEL.w : 1920, bottom: 40, display: "flex", justifyContent: "center" }}>
      <div style={{ fontFamily: ZH, fontWeight: 600, fontSize: 40, color: "#fff", background: "rgba(28,27,24,.82)", padding: "8px 28px", borderRadius: 14, maxWidth: 1300, textAlign: "center" }}>
        {segs.map((x, i) => <span key={i} style={{ color: x.h ? "#FFB347" : "#fff" }}>{x.s}</span>)}
      </div>
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
  <span style={{ display: "inline-block", fontFamily: /^[A-Za-z0-9 .\-·/]+$/.test(text) ? EN : ZH, fontWeight: 600, fontSize: size, padding: "6px 14px", borderRadius: 10, background: bg, color, ...style }}>{text}</span>
);
const Check: React.FC<{ on: boolean; size?: number }> = ({ on, size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><circle cx={12} cy={12} r={11} fill={on ? GREEN : "rgba(37,35,31,.12)"} /><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
);
/** 聊天窗：用户气泡 + 助手回复（工具调用小条） */
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
/** 全屏段：右侧大标题区 */
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

/* ================= 每段的画面 ================= */
const Scene: React.FC<{ id: string }> = ({ id }) => {
  const f = useCurrentFrame();
  switch (id) {
    case "h1": return (
      <Big f={f} at={ST("h1") + 0.2} kicker="嗨，我是 AI 数字人" title={<>脸、声音、讲解<br /><span style={{ color: OR }}>全是 AI 做的</span></>}>
        <div style={{ display: "flex", gap: 14, marginTop: 34 }}>
          {[["脸", W("h1", "从脸")], ["声音", W("h1", "声音")], ["讲解", W("h1", "这段讲解")]].map(([t, a]) => <div key={t as string} style={appear(sp(f, a as number, 10, 220))}><Chip text={t as string} size={34} bg="rgba(247,147,30,.14)" color={OR} /></div>)}
        </div>
      </Big>
    );
    case "h2": return <Big f={f} at={ST("h2")} kicker="AIGC 自媒体视频创作教程 · 第二期" title={<>手把手教你<br />做一个 <span style={{ color: OR }}>AI 数字人</span></>} sub="照片 → 数字人口播成片，全流程跟着做" />;
    case "h3": return (
      <Big f={f} at={ST("h3")} kicker="一共七步" title="跟着做就行">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 26px", marginTop: 30 }}>
          {STEPS.map((s, k) => <div key={s} style={{ ...appear(sp(f, ST("h3") + 0.25 + k * 0.22, 12, 220)), fontFamily: ZH, fontWeight: 600, fontSize: 34, color: INK }}><span style={{ color: OR }}>{NUM[k]}</span> {s}</div>)}
        </div>
      </Big>
    );
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
        { at: W("s1e", "能查到") + 0.3, text: "当前余额 9,097 credits（Advanced 套餐）" },
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
          </div>}
        </>
      );
    }
    case "s2d": {
      const l = W("s2d", "左边"), r = W("s2d", "右边");
      return (
        <div style={{ position: "absolute", left: 160, top: 10, display: "flex", gap: 60 }}>
          {[["Grok Video 1.5", "demo/grok_first.jpg", l], ["Wan 3.0", "demo/wan_first.jpg", r]].map(([name, img, at]) => {
            const lit = f >= F(at as number);
            return (
              <div key={name as string} style={{ textAlign: "center", ...appear(sp(f, ST("s2d"))) }}>
                <Img src={staticFile(img as string)} style={{ width: 380, height: 675, objectFit: "cover", borderRadius: 24, boxShadow: lit ? `0 0 0 6px ${OR}, 0 20px 50px rgba(0,0,0,.25)` : "0 0 0 6px #fff, 0 20px 50px rgba(0,0,0,.15)", transform: `scale(${lit ? 1.03 : 1})` }} />
                <div style={{ marginTop: 16 }}><Chip text={name as string} size={30} bg={lit ? OR : "rgba(37,35,31,.08)"} color={lit ? "#fff" : INK} /></div>
              </div>
            );
          })}
        </div>
      );
    }
    case "s2e": {
      const rows = [["表情手势", "更自然", "偏少"], ["配音", "自带中文配音", "自带配音"], ["720p · 8 秒", "136 积分", "96 积分"], ["生成方式", "参考图", "首帧"]];
      return (
        <Card style={{ left: 120, top: 40, width: 1120, padding: "34px 44px", ...appear(sp(f, ST("s2e"))) }}>
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 1fr", rowGap: 22, alignItems: "center" }}>
            <div />
            <div style={{ position: "relative" }}><Chip text="Grok Video 1.5" size={32} bg={OR} color="#fff" />{f >= F(W("s2e", "优选")) && <span style={{ position: "absolute", left: 10, top: -46, fontFamily: ZH, fontWeight: 800, fontSize: 30, color: GREEN, transform: `rotate(-6deg) scale(${sp(f, W("s2e", "优选"), 9, 240)})`, display: "inline-block" }}>我选它 ✓</span>}</div>
            <Chip text="Wan 3.0" size={32} />
            {rows.map((r, k) => (
              <React.Fragment key={k}>
                <div style={{ fontFamily: ZH, fontSize: 30, color: MUTE }}>{r[0]}</div>
                <div style={{ fontFamily: ZH, fontWeight: 600, fontSize: 32, color: INK, ...appear(sp(f, ST("s2e") + 0.3 + k * 0.35)) }}>{r[1]}</div>
                <div style={{ fontFamily: ZH, fontWeight: 600, fontSize: 32, color: k === 2 && f >= F(W("s2e", "更便宜")) ? GREEN : INK, ...appear(sp(f, ST("s2e") + 0.45 + k * 0.35)) }}>{r[2]}{k === 2 && f >= F(W("s2e", "更便宜")) ? "  更便宜" : ""}</div>
              </React.Fragment>
            ))}
          </div>
          <div style={{ fontFamily: ZH, fontSize: 22, color: MUTE, marginTop: 24 }}>积分为本次实测 Renoise 报价 · 表情手势为个人观感</div>
        </Card>
      );
    }
    case "s3a": return <Big f={f} at={ST("s3a")} kicker="③ 配置音色" title={<>默认：<span style={{ color: OR }}>Grok 原生配音</span></>} sub="生成数字人时自带声音，就是你现在听到的这个"><Wave f={f} at={ST("s3a")} w={760} h={120} color={OR} active /></Big>;
    case "s3b": return (
      <div style={{ position: "absolute", left: 40, top: 30, display: "flex", gap: 36 }}>
        {[["音色设计", "写一句描述就生成", "「温柔知性的年轻女声，语速稍慢」", W("s3b", "按文字描述")], ["声音克隆", "上传十几秒录音", "像你自己的声音", W("s3b", "也能克隆")]].map(([t, s, e, at]) => (
          <Card key={t as string} style={{ position: "relative", width: 620, height: 520, padding: "40px 44px", ...appear(sp(f, at as number)) }}>
            <Chip text="小米 MiMo 语音" size={24} bg="rgba(247,147,30,.14)" color={OR} />
            <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 60, color: INK, marginTop: 26 }}>{t}</div>
            <div style={{ fontFamily: ZH, fontSize: 32, color: MUTE, marginTop: 12 }}>{s}</div>
            <div style={{ fontFamily: ZH, fontSize: 28, color: INK, marginTop: 40, padding: "18px 22px", background: "#F5F3EE", borderRadius: 14 }}>{e}</div>
            <div style={{ position: "absolute", left: 44, bottom: 40 }}><Wave f={f} at={at as number} w={530} h={70} color={t === "音色设计" ? BLUE : GREEN} active /></div>
          </Card>
        ))}
      </div>
    );
    case "s3c": return (
      <Chat f={f} title="Claude Code" user={{ at: W("s3c", "发给") - 0.3, text: "用我的声音配这段话：……", attach: <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}><Chip text="🎙 我的录音.m4a · 0:14" size={24} bg="rgba(36,168,99,.14)" color={GREEN} /></div> }} replies={[
        { at: W("s3c", "它就会") - 0.2, text: "MiMo voiceclone · 逐字对齐 · 回听校验", tool: true },
        { at: W("s3c", "调用完成") - 0.2, text: "✓ 已生成 配音.wav（6.0 秒）", color: GREEN },
      ]} />
    );
    case "s3d": return <ClonePlayer f={f} playing={false} />;
    case "s4a": return (
      <Big f={f} at={ST("s4a")} kicker="④ 脚本生成" title="把内容发给 AI">
        <Card style={{ position: "relative", marginTop: 30, width: 860, padding: "26px 30px", ...appear(sp(f, W("s4a", "比如"))) }}>
          <div style={{ fontFamily: ZH, fontSize: 30, color: INK, lineHeight: 1.6 }}>「用这个形象，讲一段<span style={{ color: OR, fontWeight: 700 }}>一分半钟</span>的产品推荐」</div>
        </Card>
      </Big>
    );
    case "s4b": {
      const S5 = ITEMS.filter((i) => i.kind === "nar").slice(3, 8);
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
          <div style={{ fontFamily: ZH, fontSize: 22, color: MUTE, marginTop: 14 }}>这期教程的真实切段 · 共 32 段</div>
        </Card>
      );
    }
    case "s4c": {
      const ok = W("s4c", "点头");
      return (
        <Chat f={f} title="Claude Code" user={{ at: ST("s4c") + 0.1, text: "按这个稿子生成数字人口播" }} replies={[
          { at: W("s4c", "生成之前") - 0.3, text: "renoise · estimate_cost", tool: true },
          { at: W("s4c", "要花多少"), text: "32 段 · 约 244 秒 · 预估 2,958 积分 · 当前余额 9,097" },
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
      const rows = [["h1", "100%", "✓"], ["s1c", "89%", "✓"], ["s2c", "65%", "识别成繁体 → 复核没念错 ✓"], ["s5c", "81%", "Wan 念作「万」→ 复核 ✓"]];
      return (
        <Card style={{ left: 40, top: 20, width: 1280, height: 700, padding: "30px 40px", ...appear(sp(f, ST("s4d"))) }}>
          {[["先拍第 1 段，听音色", W("s4d", "先做")], ["满意再批量生成", W("s4d", "批量")], ["逐段回听，比对文稿", W("s4d", "逐段")], ["念错了就单独重拍", W("s4d", "单独重做")]].map(([t, a], k) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14, ...appear(sp(f, a as number)) }}><Check on={f >= F(a as number)} /><span style={{ fontFamily: ZH, fontWeight: 600, fontSize: 32, color: INK }}>{t}</span></div>
          ))}
          {f >= F(W("s4d", "逐段")) && (
            <div style={{ marginTop: 18, borderTop: `1px solid ${LINE}`, paddingTop: 16, ...appear(sp(f, W("s4d", "逐段"))) }}>
              <div style={{ fontFamily: ZH, fontSize: 22, color: MUTE, marginBottom: 8 }}>本期真实回听结果（节选）</div>
              {rows.map((r) => <div key={r[0]} style={{ display: "flex", gap: 30, fontFamily: MONO, fontSize: 24, color: INK, padding: "6px 0" }}><span style={{ width: 70 }}>{r[0]}</span><span style={{ width: 90, color: parseInt(r[1]) < 85 ? OR : GREEN }}>{r[1]}</span><span style={{ fontFamily: ZH }}>{r[2]}</span></div>)}
            </div>
          )}
        </Card>
      );
    }
    case "s5a": return <Big f={f} at={ST("s5a")} kicker="⑤ B-roll 画面" title={<>只有人在讲<br /><span style={{ color: OR }}>太单调了</span></>} sub="穿插空镜、示意画面，节奏才起得来" />;
    case "s5b": {
      const A = [["节奏", "约 5 秒切一个场景"], ["镜头", "美食特写 → 平滑大幅拉远"], ["光线", "夜市霓虹 / 夕阳 / 正午"], ["情绪", "欢快、时尚、有活力"]];
      return (
        <>
          <Card style={{ left: 40, top: 20, width: 380, height: 676, overflow: "hidden", ...appear(sp(f, ST("s5b"))) }}>
            <Sequence from={F(ST("s5b"))} durationInFrames={F(BY.s5b.dur) + 4} layout="none"><OffthreadVideo src={staticFile("demo/ref_soya.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /></Sequence>
            <div style={{ position: "absolute", left: 12, top: 12 }}><Chip text="参考视频" size={22} bg="rgba(0,0,0,.6)" color="#fff" /></div>
          </Card>
          <Card style={{ left: 460, top: 20, width: 860, height: 676, padding: "30px 38px", ...appear(sp(f, W("s5b", "让它先总结") - 0.3)) }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 22 }}><Chip text="renoise · analyze_media" size={24} bg="rgba(55,103,240,.1)" color={BLUE} /><span style={{ fontFamily: ZH, fontSize: 24, color: MUTE }}>AI 先总结风格</span></div>
            {A.map(([k, v], i) => {
              const at = [W("s5b", "镜头怎么动"), W("s5b", "镜头怎么动"), W("s5b", "节奏多快"), W("s5b", "什么风格")][i];
              return <div key={k} style={{ display: "flex", gap: 22, padding: "18px 0", borderTop: `1px solid ${LINE}`, ...appear(sp(f, at + i * 0.1)) }}><span style={{ width: 90, fontFamily: ZH, fontWeight: 700, fontSize: 30, color: OR }}>{k}</span><span style={{ fontFamily: ZH, fontSize: 32, color: INK }}>{v}</span></div>;
            })}
          </Card>
        </>
      );
    }
    case "s5c": return (
      <Card style={{ left: 40, top: 20, width: 1280, height: 720, overflow: "hidden", ...appear(sp(f, W("s5c", "生成你自己"))) }}>
        <Sequence from={F(W("s5c", "生成你自己"))} durationInFrames={F(EN_("s5c") - W("s5c", "生成你自己")) + 4} layout="none"><OffthreadVideo src={staticFile("demo/broll.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /></Sequence>
        <div style={{ position: "absolute", left: 20, top: 20, display: "flex", gap: 10 }}><Chip text="AI 生成的空镜" size={24} bg="rgba(0,0,0,.6)" color="#fff" />{f >= F(W("s5c", "Wan")) && <Chip text="Wan 3.0 · 480p · 5 秒 · 30 积分" size={24} bg={OR} color="#fff" />}</div>
      </Card>
    );
    case "s6a": return <Big f={f} at={ST("s6a")} kicker="⑥ 沉淀 Skill" title={<>最容易忽略<br /><span style={{ color: OR }}>也最重要</span></>} sub="把这次的经验写下来，下次一句话复用" />;
    case "s6b": {
      const tree: Array<[string, string, string]> = [["SKILL.md", "流程 · 红线 · 用法", "Skill"], ["persona.json", "形象 · 音色 · 提示词模板", "形象"], ["scripts/build_tasks.py", "切段规则 · 报价", "切段规则"], ["scripts/rangedl.py", "分片下载 · 校验", "切段规则"], ["scripts/assemble.py", "回听 · 剪空白 · 拼接", "切段规则"], ["references/edit-styles.md", "剪辑风格（9:16 / 16:9 / 教程）", "剪辑风格"]];
      return (
        <Card style={{ left: 40, top: 20, width: 1280, height: 700, padding: "30px 40px", background: "#1C1B19", ...appear(sp(f, ST("s6b"))) }}>
          <div style={{ fontFamily: MONO, fontSize: 28, color: OR, marginBottom: 20 }}>~/.claude/skills/digital-human-koubo/</div>
          {tree.map(([n, d, w], k) => {
            const at = W("s6b", w);
            const on = f >= F(at);
            return <div key={n} style={{ display: "flex", gap: 30, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,.08)", opacity: on ? 1 : 0.35 }}><span style={{ width: 460, fontFamily: MONO, fontSize: 26, color: on ? "#EDEBE4" : "#8D8A82" }}>├─ {n}</span><span style={{ fontFamily: ZH, fontSize: 28, color: on ? "#9BE3B5" : "#8D8A82" }}>{d}</span></div>;
          })}
          <div style={{ fontFamily: ZH, fontSize: 22, color: "#8D8A82", marginTop: 16 }}>已装在本机 · 就是做这期教程时沉淀的</div>
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
    case "s7a": return <Big f={f} at={ST("s7a")} kicker="⑦ 剪辑合成" title={<>交给 <span style={{ color: OR }}>Claude</span></>} sub="字幕、花字、画中画、配乐、横竖屏，一次做完" />;
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
      const tracks = [["数字人", 32, OR], ["字幕", 60, BLUE], ["界面画面", 30, "#8B5CF6"], ["音效", 40, GREEN], ["配乐", 1, "#9A968C"]];
      const ph = interpolate(f, [F(ST("s7c")), F(EN_("s7c"))], [0.08, 0.92], clamp);
      return (
        <Card style={{ left: 40, top: 40, width: 1280, height: 560, padding: "28px 34px", ...appear(sp(f, ST("s7c"))) }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18 }}><Chip text="Remotion" size={26} bg={INK} color="#fff" /><span style={{ fontFamily: ZH, fontSize: 26, color: MUTE }}>这期教程的工程 · 4 分 36 秒</span></div>
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
    case "e1": {
      const words = ["照片", "形象", "音色", "脚本", "画面", "Skill", "剪辑"];
      return (
        <Big f={f} at={ST("e1")} kicker="七步讲完" title="记住这个顺序">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 34, width: 960 }}>
            {words.map((w, k) => {
              const at = W("e1", w);
              return <div key={w} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderRadius: 16, background: f >= F(at) ? "rgba(36,168,99,.12)" : "rgba(37,35,31,.05)", ...appear(sp(f, at - 0.1, 10, 220)) }}><Check on={f >= F(at)} size={30} /><span style={{ fontFamily: /[A-Za-z]/.test(w) ? EN : ZH, fontWeight: 700, fontSize: 36, color: INK }}>{w}</span>{k < 6 && <span style={{ color: MUTE, fontSize: 28 }}>→</span>}</div>;
            })}
          </div>
        </Big>
      );
    }
    case "e2": return <Big f={f} at={ST("e2")} kicker="轮到你了" title={<>去做一个<br /><span style={{ color: OR }}>你自己的数字人</span></>} sub="我们下期见" />;
    default: return null;
  }
};

/* ================= 声波（克隆试听用） ================= */
const Wave: React.FC<{ f: number; at: number; w: number; h: number; color: string; active: boolean }> = ({ f, at, w, h, color, active }) => {
  const n = 48;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, width: w, height: h, marginTop: 30 }}>
      {Array.from({ length: n }).map((_, i) => {
        const a = active ? 0.25 + 0.75 * Math.abs(Math.sin(i * 0.7 + (f - F(at)) / 3.2) * Math.sin(i * 0.23 + (f - F(at)) / 7)) : 0.18;
        return <div key={i} style={{ flex: 1, height: `${a * 100}%`, borderRadius: 4, background: color, opacity: 0.85 }} />;
      })}
    </div>
  );
};
const ClonePlayer: React.FC<{ f: number; playing: boolean }> = ({ f, playing }) => (
  <Card style={{ left: 120, top: 80, width: 1120, height: 520, padding: "40px 50px", ...appear(sp(f, ST("s3d"))) }}>
    <div style={{ display: "flex", gap: 14, alignItems: "center" }}><Chip text="MiMo 克隆" size={30} bg={GREEN} color="#fff" /><span style={{ fontFamily: ZH, fontSize: 26, color: MUTE }}>参照：她的 Grok 原声 23 秒 · 不是真人声音</span></div>
    <div style={{ fontFamily: ZH, fontWeight: 700, fontSize: 40, color: INK, marginTop: 40, lineHeight: 1.5 }}>「这一句，是用 MiMo 克隆出来的我的声音。<br />你能听出和刚才 Grok 原声的区别吗？」</div>
    <Wave f={f} at={playing ? ST("clone") : ST("s3d")} w={1020} h={110} color={GREEN} active={playing} />
    <div style={{ fontFamily: ZH, fontSize: 24, color: playing ? GREEN : MUTE, marginTop: 14 }}>{playing ? "▶ 正在播放克隆版" : "即将播放 ▸"}</div>
  </Card>
);

/* ================= 三段演示插入 ================= */
const Inserts: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const cmp = BY.cmp, cl = BY.clone, br = BY.broll, out = BY.outro;
  if (t >= cmp.start && t < cmp.start + cmp.dur) {
    const g0 = cmp.start, w0 = cmp.start + 5.75;
    const card = (src: string, img: string, name: string, price: string, a: number, d: number) => {
      const on = t >= a && t < a + d;
      return (
        <div style={{ textAlign: "center", opacity: on ? 1 : 0.55, transform: `scale(${on ? 1.03 : 0.97})`, transition: "none" }}>
          <div style={{ width: 430, height: 764, borderRadius: 26, overflow: "hidden", boxShadow: on ? `0 0 0 7px ${OR}, 0 24px 60px rgba(0,0,0,.25)` : "0 0 0 6px #fff, 0 20px 50px rgba(0,0,0,.15)" }}>
            {t >= a && t < a + d ? (
              <Sequence from={F(a)} durationInFrames={F(d)} layout="none"><OffthreadVideo src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></Sequence>
            ) : <Img src={staticFile(img)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "center" }}><Chip text={name} size={30} bg={on ? OR : "rgba(37,35,31,.08)"} color={on ? "#fff" : INK} /><Chip text={price} size={24} /></div>
        </div>
      );
    };
    return (
      <AbsoluteFill>
        <div style={{ position: "absolute", left: 0, right: 0, top: 120, display: "flex", justifyContent: "center", gap: 90 }}>
          {card("demo/grok.mp4", "demo/grok_first.jpg", "Grok Video 1.5", "720p 8 秒 · 136 积分", g0, 5.6)}
          {card("demo/wan.mp4", "demo/wan_first.jpg", "Wan 3.0", "720p 8 秒 · 96 积分", w0, 7.37)}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 40, textAlign: "center" }}><span style={{ fontFamily: ZH, fontWeight: 600, fontSize: 34, color: "#fff", background: "rgba(28,27,24,.82)", padding: "8px 26px", borderRadius: 14 }}>同一张图、同一句台词 · {t < w0 ? "先听 Grok 版" : "再听 Wan 3.0 版"}</span></div>
      </AbsoluteFill>
    );
  }
  if (t >= cl.start && t < cl.start + cl.dur) return <AbsoluteFill style={{ left: PANEL.x, top: PANEL.y, width: PANEL.w, height: PANEL.h }}><ClonePlayer f={f} playing /></AbsoluteFill>;
  if (t >= br.start && t < br.start + br.dur) return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 210, top: 140, width: 1500, height: 844, borderRadius: 26, overflow: "hidden", boxShadow: "0 24px 70px rgba(0,0,0,.3)" }}>
        <Sequence from={F(br.start)} durationInFrames={F(br.dur)} layout="none"><OffthreadVideo src={staticFile("demo/broll.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${interpolate(t, [br.start, br.start + br.dur], [1, 1.06])})` }} /></Sequence>
        <div style={{ position: "absolute", left: 24, top: 24, display: "flex", gap: 12 }}><Chip text="按参考风格生成的 B-roll" size={28} bg="rgba(0,0,0,.6)" color="#fff" /><Chip text="AI 生成" size={24} bg={OR} color="#fff" /></div>
      </div>
    </AbsoluteFill>
  );
  if (t >= out.start) {
    const p = sp(f, out.start + 0.2, 14, 150);
    return (
      <div style={{ position: "absolute", left: 820, top: 230, width: 1000, ...appear(p, 40) }}>
        <div style={{ fontFamily: EN, fontWeight: 800, fontSize: 84, color: INK }}>renoise<span style={{ color: OR }}>.ai</span></div>
        <div style={{ fontFamily: ZH, fontSize: 34, color: MUTE, marginTop: 26 }}>插件与连接器：<span style={{ fontFamily: MONO, color: INK }}>renoise.ai/plugin</span></div>
        <div style={{ fontFamily: ZH, fontSize: 34, color: MUTE, marginTop: 12 }}>MCP 地址：<span style={{ fontFamily: MONO, color: INK }}>renoise.ai/api/public/mcp</span></div>
        <div style={{ marginTop: 40 }}><Chip text="AIGC 自媒体视频创作教程 · 第二期" size={28} bg={OR} color="#fff" /></div>
      </div>
    );
  }
  return null;
};

/* ================= 声音 ================= */
type Cue = [number, string, number];
const SFX: Cue[] = (() => {
  const c: Cue[] = [];
  for (const it of ITEMS) if (it.kind === "nar" && it.shot === "full") c.push([it.start, "swish-1", 0.18]);
  c.push([W("s1a", "注册"), "click", 0.4], [W("s1b", "连接器"), "click", 0.4], [W("s1b", "添加自定义"), "click", 0.4], [W("s1c", "名称") + 0.3, "key-1", 0.3], [W("s1c", "地址") + 0.3, "key-2", 0.3], [W("s1c", "点继续"), "click", 0.45], [W("s1c", "登录授权") + 0.5, "ding", 0.3],
    [W("s1d", "Claude Code"), "key-3", 0.3], [W("s1d", "Codex"), "key-1", 0.3], [W("s1e", "连上了") - 0.2, "ding", 0.35], [W("s2b", "两个侧面"), "pop", 0.4], [W("s2e", "优选"), "pop", 0.4],
    [W("s3c", "调用完成") - 0.2, "ding", 0.3], [W("s4c", "点头"), "click", 0.45], [W("s5b", "让它先总结") - 0.3, "page-1", 0.4], [W("s6c", "出来的") - 0.4, "ding", 0.3], [BY.outro.start + 0.2, "done", 0.4]);
  ["照片", "形象", "音色", "脚本", "画面", "Skill", "剪辑"].forEach((w) => c.push([W("e1", w), "tap", 0.3]));
  return c;
})();

export const Tutorial: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const it = ITEMS.find((i) => t >= i.start - 0.1 && t < i.start + i.dur + 0.12);
  const bgmVol = (fr: number) => {
    const tt = fr / FPS;
    const loud = ITEMS.some((i) => (i.kind === "broll" || i.kind === "outro") && tt >= i.start && tt < i.start + i.dur);
    const mute = ITEMS.some((i) => (i.kind === "cmp" || i.kind === "clone") && tt >= i.start - 0.2 && tt < i.start + i.dur + 0.2);
    return interpolate(fr, [0, 20, TOTAL - 30, TOTAL - 1], [0, 1, 1, 0], clamp) * (mute ? 0.02 : loud ? 0.2 : 0.07);
  };
  return (
    <AbsoluteFill style={{ background: BG }}>
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(37,35,31,.06) 1.2px, transparent 1.4px)", backgroundSize: "30px 30px" }} />
      {it && it.kind === "nar" && (
        <AbsoluteFill style={it.shot === "pip" ? { left: PANEL.x, top: PANEL.y, width: PANEL.w, height: PANEL.h } : undefined}>
          <Scene id={it.id} />
        </AbsoluteFill>
      )}
      <Inserts />
      <Host />
      <TopBar />
      <Subs />
      {ITEMS.filter((i) => i.kind === "nar").map((i) => (
        <Sequence key={i.id} from={F(i.start)} durationInFrames={F(i.dur) + 2} layout="none"><Audio src={staticFile(`nar_fx/${i.id}.wav`)} /></Sequence>
      ))}
      <Sequence from={F(BY.clone.start + 0.3)} durationInFrames={F(6.2)} layout="none"><Audio src={staticFile("demo/clone_fx.wav")} /></Sequence>
      <Audio src={staticFile("music/bgm.mp3")} loop volume={bgmVol} />
      <Audio src={staticFile("demo/roomtone.wav")} volume={(fr) => interpolate(fr, [0, 15, TOTAL - 20, TOTAL - 1], [0, 1, 1, 0], clamp)} />
      {SFX.map(([a, n, v], k) => <Sequence key={k} from={Math.max(0, F(a))} durationInFrames={F(2)} layout="none"><Audio src={staticFile(`sfx/${n}.wav`)} volume={v} /></Sequence>)}
    </AbsoluteFill>
  );
};
