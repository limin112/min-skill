// 开场三条路 → 第四条路「记忆」→ Logo 发布 → 失忆聊天窗 → model card 真实代码 → 团队时间线
import React from "react";
import { AbsoluteFill, staticFile } from "remotion";
import { clamp01, E, mix, seg, track, typed, typingSchedule } from "../cinematic/motion";
import { random } from "remotion";
import { ap, Backdrop, C, CN, EN, GRAD, GradText, Kicker, Mark, MONO, out, Rise, Shatter, slamStyle, T, TE, Wd, Win } from "./kit";

// ── 场景边界（帧） ──
export const B2 = T("b03");
export const B3 = T("b04") - 4;
export const B4 = T("b05") - 2;
export const B5 = T("b06") - 4;
export const NAME = Wd("b03", "MemT");
export const MEM = Wd("b02", "记忆");

// ═════════ S1 三条路 + 第四条路 ═════════
const ORIGIN = { x: 240, y: 900 };
const OLD = [
  { label: "更多参数", en: "Parameters", w: "参数", H: 330, k: 230 },
  { label: "更多数据", en: "Data", w: "数据", H: 270, k: 270 },
  { label: "更长的上下文", en: "Context", w: "上下文", H: 210, k: 310 },
];
const oldPath = (H: number, k: number) => {
  const pts: string[] = [];
  for (let x = ORIGIN.x; x <= 1380; x += 12) pts.push(`${x},${(ORIGIN.y - H * (1 - Math.exp(-(x - ORIGIN.x) / k))).toFixed(1)}`);
  return "M" + pts.join(" L");
};
const newY = (p: number) => ORIGIN.y - 760 * Math.pow(p, 2.2);
const newX = (p: number) => ORIGIN.x + 1300 * p;
const NEW_PATH = "M" + Array.from({ length: 61 }, (_, i) => `${newX(i / 60).toFixed(1)},${newY(i / 60).toFixed(1)}`).join(" L");
const L4 = Wd("b02", "第四条路") - 8;
export const s1Cues = () => [
  ...OLD.map((o, i) => ({ at: Wd("b01", o.w), name: `swish-${i + 1}`, volume: 0.45 })),
  { at: L4, name: "whoosh", volume: 0.55 },
  { at: MEM, name: "slam-1", volume: 0.7 },
  { at: B2 - 12, name: "whoosh", volume: 0.5 },
];

export const S1Paths: React.FC<{ f: number }> = ({ f }) => {
  const p4 = seg(f, L4, 40, E.inOut);
  const dimOld = mix(1, 0.32, seg(f, L4, 20));
  const head = { x: newX(p4), y: newY(p4) };
  const zoom = seg(f, B2 - 14, 14, E.in);
  return (
    <AbsoluteFill style={{ opacity: 1 - zoom * 0.9 }}>
      <AbsoluteFill style={{ transform: `scale(${1 + zoom * 5})`, transformOrigin: `${head.x}px ${head.y}px` }}>
        <svg width={1920} height={1080} style={{ position: "absolute" }}>
          <defs>
            <linearGradient id="g4" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor={C.cyan} />
              <stop offset="0.55" stopColor={C.blue} />
              <stop offset="1" stopColor={C.violet} />
            </linearGradient>
            <filter id="glow4" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g opacity={ap(f, 4, 20)}>
            <line x1={ORIGIN.x} y1={ORIGIN.y} x2={1760} y2={ORIGIN.y} style={{ stroke: C.faint, strokeWidth: 2 }} />
            <line x1={ORIGIN.x} y1={ORIGIN.y} x2={ORIGIN.x} y2={120} style={{ stroke: C.faint, strokeWidth: 2 }} />
          </g>
          {OLD.map((o, i) => {
            const at = Wd("b01", o.w) - 6;
            const p = seg(f, at, 26, E.out);
            return (
              <path key={i} d={oldPath(o.H, o.k)} pathLength={1} style={{ fill: "none", stroke: "rgba(226,232,255,0.8)", strokeWidth: 3.5, strokeDasharray: 1, strokeDashoffset: 1 - p, opacity: dimOld }} />
            );
          })}
          {p4 > 0 && <path d={NEW_PATH} pathLength={1} filter="url(#glow4)" style={{ fill: "none", stroke: "url(#g4)", strokeWidth: 7, strokeLinecap: "round", strokeDasharray: 1, strokeDashoffset: 1 - p4 }} />}
          {p4 > 0 && <circle cx={head.x} cy={head.y} r={10 + 8 * Math.sin(f / 4) ** 2} style={{ fill: "#fff" }} filter="url(#glow4)" />}
        </svg>
        <div style={{ position: "absolute", left: 30, top: ORIGIN.y + 18, width: 200, textAlign: "right", fontFamily: CN, fontSize: 22, color: C.mute, opacity: ap(f, 10, 20) }}>投入 →</div>
        <div style={{ position: "absolute", left: ORIGIN.x - 20, top: 84, fontFamily: CN, fontSize: 22, color: C.mute, opacity: ap(f, 10, 20) }}>能力 ↑</div>
        {OLD.map((o, i) => {
          const at = Wd("b01", o.w) + 10;
          const y = ORIGIN.y - o.H * (1 - Math.exp(-(1380 - ORIGIN.x) / o.k));
          return (
            <div key={i} style={{ position: "absolute", left: 1410, top: y - 30, opacity: ap(f, at, 12) * dimOld, transform: `translateX(${(1 - ap(f, at, 12)) * 30}px)` }}>
              <div style={{ fontFamily: CN, fontSize: 44, fontWeight: 700, color: C.ink }}>{o.label}</div>
              <div style={{ fontFamily: EN, fontSize: 20, color: C.mute, letterSpacing: "0.12em", textTransform: "uppercase" }}>{o.en}</div>
            </div>
          );
        })}
        <div style={{ position: "absolute", left: 330, top: 150, opacity: ap(f, T("b01"), 16) * out(f, L4, 12) }}>
          <Kicker>Scaling · 三条老路</Kicker>
        </div>
        <div style={{ position: "absolute", left: 330, top: 150, opacity: ap(f, L4 + 4, 14) }}>
          <Kicker>第四条路</Kicker>
        </div>
        <div style={{ position: "absolute", left: 312, top: 196 }}>
          <Rise f={f} at={MEM - 4} parts={[{ t: "记忆", accent: true }]} size={230} weight={900} step={3} align="left" />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ═════════ S2 发布：Logo → MemT 1.0 ═════════
const DATE = Wd("b03", "十月");
const FIRST = Wd("b03", "全球");
export const s2Cues = () => [
  { at: B2 + 8, name: "swish-2", volume: 0.5 },
  { at: DATE, name: "pop", volume: 0.5 },
  { at: NAME, name: "impact", volume: 0.85 },
  { at: FIRST, name: "slam-2", volume: 0.5 },
  { at: B3 - 6, name: "whoosh", volume: 0.5 },
];

export const S2Launch: React.FC<{ f: number }> = ({ f }) => {
  const l = f - B2;
  const glow = seg(l, 0, 18);
  const q = seg(l, 4, 24, E.out);
  const sweep = seg(l, 16, 30, E.inOut);
  const push = seg(f, B3 - 10, 18, E.in);
  return (
    <AbsoluteFill style={{ opacity: 1 - push, transform: `scale(${1 + push * 0.9})` }}>
      <div
        style={{
          position: "absolute",
          left: 960 - 500,
          top: 330 - 500,
          width: 1000,
          height: 1000,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(61,107,245,${0.55 * (1 - glow * 0.55)}) 0%, rgba(106,59,240,0.14) 35%, transparent 65%)`,
          transform: `scale(${mix(0.05, 1, glow)})`,
        }}
      />
      <div style={{ position: "absolute", left: 0, right: 0, top: 168, display: "flex", justifyContent: "center", opacity: ap(f, DATE, 10), transform: `translateY(${(1 - ap(f, DATE, 10)) * 16}px)` }}>
        <div style={{ padding: "10px 26px", borderRadius: 40, border: "1px solid rgba(39,185,243,0.45)", background: "rgba(39,185,243,0.08)", fontFamily: EN, fontSize: 26, color: C.ink, letterSpacing: "0.04em" }}>
          2026.10.20 <span style={{ color: C.mute }}>· MemOS 团队发布</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 960 - 150, top: 250, width: 300, height: 203, opacity: clamp01(q * 1.5), transform: `scale(${mix(0.55, 1, q)})`, filter: q < 1 ? `blur(${(1 - q) * 18}px)` : undefined }}>
        <Mark w={300} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            WebkitMaskImage: `url(${staticFile("brand/mark.png")})`,
            WebkitMaskSize: "100% 100%",
            background: "linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.9) 50%, transparent 62%)",
            backgroundSize: "300% 100%",
            backgroundPosition: `${mix(110, -10, sweep)}% 0`,
            opacity: sweep > 0 && sweep < 1 ? 1 : 0,
          }}
        />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 486, textAlign: "center", fontFamily: EN, fontWeight: 800, fontSize: 170, letterSpacing: "-0.03em", color: C.ink, ...slamStyle(f, NAME) }}>
        MemT <GradText>1.0</GradText>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 712 }}>
        <Rise f={f} at={FIRST} parts={[{ t: "全球首个" }, { t: "记忆原生", accent: true }, { t: "大模型" }]} size={64} weight={700} step={1.6} />
      </div>
    </AbsoluteFill>
  );
};

// ═════════ S3+S4 同一个窗口：失忆聊天 → model card 代码 ═════════
const WIN = { x: 360, y: 236, w: 1200, h: 700 };
const NC = Wd("b04", "新开");
const FG = Wd("b04", "全忘");
const RULES = [
  { t: "改代码时，别动公开 API 的签名。", at: Wd("b04", "规矩") },
  { t: "再说一次：updateUser() 的签名不要改。", at: Wd("b04", "讲了") },
  { t: "第三遍：API 签名保持不变！", at: Wd("b04", "三遍") },
];
const textW = (s: string, px: number) => Array.from(s).reduce((a, ch) => a + (ch.charCodeAt(0) < 128 ? px * 0.56 : px), 0);
const REPLY = "好的！已把 updateUser(id, data) 改成 updateUser(id, data, options)。";
const replyType = typingSchedule(REPLY, FG - 16, 0.55, (i) => random(`r${i}`));
const CL = Wd("b05", "对话记录");
const ST = Wd("b05", "记忆还在");
const Q = 'restored.chat("How old is my kitten?")';
const qType = typingSchedule(Q, CL + 8, 0.42, (i) => random(`q${i}`));

export const s3Cues = () => [
  ...RULES.map((r, i) => ({ at: r.at, name: "pop", volume: 0.45 + i * 0.05 })),
  { at: RULES[2].at + 9, name: "pop", volume: 0.35 },
  { at: NC, name: "click", volume: 0.9 },
  { at: NC + 2, name: "swish-3", volume: 0.5 },
  { at: FG + 14, name: "slam-3", volume: 0.6 },
  { at: B4 + 2, name: "swish-1", volume: 0.4 },
  { at: CL, name: "slam-1", volume: 0.55 },
  { at: ST, name: "done", volume: 0.7 },
  { at: B5 - 4, name: "whoosh", volume: 0.5 },
];

const Bubble: React.FC<{ text: string; right?: boolean; o: number; tone?: string; children?: React.ReactNode }> = ({ text, right, o, tone, children }) => (
  <div style={{ display: "flex", justifyContent: right ? "flex-end" : "flex-start", opacity: o, transform: `translateY(${(1 - o) * 14}px) scale(${mix(0.94, 1, o)})`, transformOrigin: right ? "right center" : "left center" }}>
    <div
      style={{
        maxWidth: 760,
        padding: "14px 22px",
        borderRadius: right ? "20px 20px 6px 20px" : "20px 20px 20px 6px",
        background: right ? "linear-gradient(135deg, #3D6BF5, #5A47EE)" : tone ?? "rgba(255,255,255,0.07)",
        border: right ? "none" : "1px solid rgba(255,255,255,0.08)",
        fontFamily: CN,
        fontSize: 26,
        lineHeight: 1.45,
        color: C.ink,
      }}
    >
      {children ?? text}
    </div>
  </div>
);

const codeLine = (s: string) => {
  // 极简语法着色：字符串、注释、关键字参数
  const parts: React.ReactNode[] = [];
  const re = /("[^"]*"|#.*$|\benable_memory\b|\bTrue\b|\bprint\b|\blen\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(<span key={k++}>{s.slice(last, m.index)}</span>);
    const tok = m[0];
    const color = tok.startsWith('"') ? "#F6C177" : tok.startsWith("#") ? "rgba(226,232,255,0.42)" : tok === "True" ? "#C792EA" : C.cyan;
    parts.push(
      <span key={k++} style={{ color }}>
        {tok}
      </span>,
    );
    last = m.index + tok.length;
  }
  if (last < s.length) parts.push(<span key={k++}>{s.slice(last)}</span>);
  return parts;
};

const Cell: React.FC<{ n: number; lines: string[]; o: number; hl?: number }> = ({ n, lines, o, hl = 0 }) => (
  <div style={{ display: "flex", gap: 18, opacity: o, transform: `translateY(${(1 - o) * 12}px)` }}>
    <div style={{ width: 70, fontFamily: MONO, fontSize: 20, color: "rgba(39,185,243,0.7)", paddingTop: 12 }}>In [{n}]</div>
    <div
      style={{
        flex: 1,
        padding: "10px 18px",
        borderRadius: 10,
        background: `rgba(255,255,255,${0.035 + hl * 0.04})`,
        border: `1px solid rgba(61,107,245,${0.12 + hl * 0.5})`,
        fontFamily: MONO,
        fontSize: 22,
        lineHeight: 1.6,
        color: C.ink,
        whiteSpace: "pre",
      }}
    >
      {lines.map((l, i) => (
        <div key={i}>{codeLine(l)}</div>
      ))}
    </div>
  </div>
);

export const S34Window: React.FC<{ f: number }> = ({ f }) => {
  const inQ = seg(f, B3, 16, E.out);
  const toCode = seg(f, B4 - 4, 10, E.inOut);
  const exit = seg(f, B5 - 8, 14, E.in);
  const shattered = f >= NC + 1;
  const clickP = seg(f, NC - 24, 22, E.inOut);
  const cur = { x: mix(1320, 480, clickP), y: mix(820, 326, clickP) };
  const press = f >= NC && f < NC + 5 ? 0.86 : 1;
  const chatO = 1 - toCode;
  // 头条
  const head1 = ap(f, RULES[0].at - 6, 6) * out(f, NC - 6, 8);
  const head2 = f >= NC - 2 && f < B4 + 2;
  return (
    <AbsoluteFill style={{ opacity: inQ * (1 - exit), transform: `translateY(${(1 - inQ) * 40 - exit * 60}px) scale(${mix(0.96, 1, inQ)})` }}>
      {/* 头条：聊天阶段 */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 112, opacity: out(f, RULES[0].at - 10, 6) }}>
        <Rise f={f} at={T("b04") + 2} parts={[{ t: "你一定遇到过" }]} size={60} weight={800} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 112, opacity: head1 }}>
        <Rise f={f} at={RULES[0].at - 6} parts={[{ t: "同一条规矩，讲了" }, { t: "三遍", accent: true }]} size={60} weight={800} />
      </div>
      {head2 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 112, opacity: out(f, B4 - 6, 8) }}>
          <Rise f={f} at={NC - 2} parts={[{ t: "新开一个对话，它" }, { t: "全忘了", color: C.red }]} size={60} weight={800} step={1.1} />
        </div>
      )}
      {/* 头条：代码阶段 */}
      {f >= CL - 4 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 112, display: "flex", justifyContent: "center", gap: 0 }}>
          <Rise f={f} at={CL - 4} parts={[{ t: "对话记录清空，" }]} size={60} weight={800} />
          <Rise f={f} at={ST - 4} parts={[{ t: "记忆还在", accent: true }]} size={60} weight={800} step={2} />
        </div>
      )}

      <Win x={WIN.x} y={WIN.y} w={WIN.w} h={WIN.h} title={toCode < 0.5 ? (shattered ? "新对话" : "重构用户模块 · 第 3 天") : "MemT-1.0 · Quick Start"}>
        {/* 聊天 */}
        <div style={{ position: "absolute", inset: 0, opacity: chatO, display: chatO > 0.01 ? "block" : "none" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 250, borderRight: "1px solid rgba(160,180,255,0.1)", background: "rgba(255,255,255,0.02)" }}>
            <div
              style={{
                margin: "20px 20px 22px",
                height: 48,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontFamily: CN,
                fontSize: 22,
                color: C.ink,
                background: f >= NC && f < NC + 10 ? "rgba(61,107,245,0.5)" : "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                transform: `scale(${press})`,
              }}
            >
              ＋ 新对话
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ margin: "0 20px 14px", height: 40, borderRadius: 10, background: i === 0 && !shattered ? "rgba(61,107,245,0.18)" : "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", padding: "0 14px" }}>
                <div style={{ height: 10, width: [140, 110, 150, 96][i], borderRadius: 5, background: "rgba(226,232,255,0.18)" }} />
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", left: 290, right: 40, top: 30, display: "flex", flexDirection: "column", gap: 22 }}>
            {!shattered &&
              RULES.map((r, i) => <Bubble key={i} text={r.t} right o={ap(f, r.at - 3, 9)} />)}
            {!shattered && <Bubble text="好的，记住了。" o={ap(f, RULES[2].at + 7, 9)} />}
            {shattered && f < FG - 18 && (
              <div style={{ marginTop: 200, textAlign: "center", fontFamily: CN, fontSize: 28, color: "rgba(226,232,255,0.35)", opacity: ap(f, NC + 6, 10) }}>有什么可以帮你？</div>
            )}
            {f >= FG - 18 && (
              <>
                <Bubble text="帮我给 updateUser() 加一个日志参数。" right o={ap(f, FG - 18, 6)} />
                <Bubble text="" o={ap(f, FG - 16, 6)}>
                  {typed(REPLY, replyType.times, f)}
                </Bubble>
                <div style={{ display: "flex", ...slamStyle(f, FG + 14), transformOrigin: "left center" }}>
                  <div style={{ padding: "8px 18px", borderRadius: 10, background: "rgba(255,91,98,0.14)", border: `1px solid ${C.red}`, color: C.red, fontFamily: CN, fontSize: 24, fontWeight: 700 }}>✕ 签名又被改了</div>
                </div>
              </>
            )}
          </div>
        </div>
        {/* 代码 */}
        {toCode > 0 && (
          <div style={{ position: "absolute", inset: 0, padding: "34px 44px", opacity: toCode, display: "flex", flexDirection: "column", gap: 16 }}>
            <Cell n={1} o={ap(f, B4 + 2, 8)} lines={['session.chat("I have a three-month-old kitten named memmy ...",', "             enable_memory=True)   # 写进内部记忆"]} />
            <Cell n={2} o={ap(f, B4 + 7, 8)} lines={['session.save_state("memmy_memory.safetensors"); session.close()']} />
            <Cell n={3} o={ap(f, B4 + 12, 8)} hl={ap(f, CL - 2, 8) * out(f, ST - 8, 8)} lines={["restored = model.create_session(tokenizer, state=state_path)", "print(len(restored.messages))"]} />
            <div style={{ display: "flex", alignItems: "center", gap: 18, paddingLeft: 88, height: 64, opacity: ap(f, CL - 2, 6) }}>
              <div style={{ fontFamily: MONO, fontSize: 52, fontWeight: 700, color: C.ink, ...slamStyle(f, CL) }}>0</div>
              <div style={{ fontFamily: CN, fontSize: 24, color: C.mute }}>← 明文对话记录：0 条</div>
            </div>
            <Cell n={4} o={ap(f, CL + 4, 8)} hl={ap(f, ST - 6, 8)} lines={[typed(Q, qType.times, f) + (f < qType.end + 2 && Math.floor(f / 8) % 2 === 0 ? "▍" : "")]} />
            <div style={{ display: "flex", alignItems: "center", gap: 18, paddingLeft: 88, height: 60, opacity: ap(f, ST - 2, 8) }}>
              <div style={{ fontFamily: MONO, fontSize: 30, color: C.green, padding: "6px 16px", borderRadius: 10, background: "rgba(62,220,155,0.1)", border: "1px solid rgba(62,220,155,0.4)" }}>Your kitten is 3 months old.</div>
              <div style={{ fontFamily: CN, fontSize: 24, color: C.mute }}>← 从内部记忆里答出来</div>
            </div>
          </div>
        )}
      </Win>
      {/* 碎片：盖在窗口上 */}
      {RULES.map((r, i) => {
        const w = Math.min(textW(r.t, 26) + 44, 760);
        return <Shatter key={i} f={f} at={NC + 1 + i * 2} x={WIN.x + WIN.w - 40 - w} y={WIN.y + 52 + 30 + i * (59 + 22)} w={w} h={59} color="#4A5BF0" seed={`s${i}`} />;
      })}
      <Shatter f={f} at={NC + 7} x={WIN.x + 290} y={WIN.y + 52 + 30 + 3 * 81} w={textW("好的，记住了。", 26) + 44} h={59} color="rgba(255,255,255,0.18)" seed="s4" />
      {/* 光标 */}
      {f > NC - 26 && f < NC + 12 && (
        <svg width={34} height={40} style={{ position: "absolute", left: cur.x, top: cur.y, transform: `scale(${press})`, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))" }}>
          <path d="M2 2 L2 30 L10 23 L15 35 L20 33 L15 21 L26 21 Z" style={{ fill: "#fff", stroke: "#111", strokeWidth: 1.5 }} />
        </svg>
      )}
      {f >= NC && f < NC + 14 && (
        <div style={{ position: "absolute", left: 480 - 40, top: 326 - 40, width: 80, height: 80, borderRadius: 40, border: "2px solid rgba(255,255,255,0.8)", transform: `scale(${mix(0.2, 1.6, seg(f, NC, 14))})`, opacity: 1 - seg(f, NC, 14) }} />
      )}
      <div style={{ position: "absolute", left: WIN.x, width: WIN.w, top: WIN.y + WIN.h + 18, textAlign: "right", fontFamily: CN, fontSize: 18, color: "rgba(226,232,255,0.42)", opacity: toCode }}>
        代码来自 Hugging Face · MemTensor/MemT-1.0-Flash model card
      </div>
    </AbsoluteFill>
  );
};
export const s3KeyText = { text: REPLY, times: replyType.times, q: Q, qTimes: qType.times };

// ═════════ S5 团队时间线 ═════════
const MEMOS = Wd("b06", "MemOS");
const TEAM = Wd("b06", "记忆张量");
const DIG = Wd("b06", "一直在");
const NODES = [
  { x: 330, at: B5 + 18, year: "2024", name: "Memory³", desc: "记忆分层大模型" },
  { x: 900, at: MEMOS, year: "2025", name: "MemOS", desc: "开源记忆操作系统" },
  { x: 1470, at: DIG, year: "2026.10", name: "MemT 1.0", desc: "记忆原生大模型", mark: true },
];
export const s5Cues = () => [...NODES.map((n, i) => ({ at: n.at, name: i === 2 ? "slam-2" : "tap", volume: 0.6 })), { at: TEAM, name: "slam-1", volume: 0.6 }];

export const S5Team: React.FC<{ f: number; end: number }> = ({ f, end }) => {
  const inQ = seg(f, B5 + 6, 14);
  const hx = track(f, [
    { f: B5 + 8, x: -40 },
    { f: NODES[0].at, x: NODES[0].x, ease: E.out },
    { f: NODES[1].at, x: NODES[1].x, ease: E.inOut },
    { f: NODES[2].at, x: NODES[2].x, ease: E.inOut },
    { f: end, x: 2000, ease: E.in2 },
  ]).x;
  const pan = mix(30, -30, clamp01((f - B5) / (end - B5)));
  const Y = 640;
  return (
    <AbsoluteFill style={{ opacity: inQ }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center", opacity: ap(f, B5 + 4, 12) }}>
        <Kicker style={{ textTransform: "none", letterSpacing: "0.16em" }}>开源记忆操作系统 MemOS 背后的团队</Kicker>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 196, textAlign: "center", fontFamily: CN, fontWeight: 800, fontSize: 96, color: C.ink, ...slamStyle(f, TEAM) }}>
        记忆张量 <GradText style={{ fontFamily: EN }}>MemTensor</GradText>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 334, textAlign: "center", fontFamily: CN, fontSize: 28, color: C.mute, opacity: ap(f, TEAM + 8, 12) }}>上海算法创新研究院孵化 · 鄂维南院士任首席科学顾问</div>
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${pan}px)` }}>
        <div style={{ position: "absolute", left: -100, width: 2200, top: Y - 1, height: 2, background: C.faint }} />
        <div style={{ position: "absolute", left: -100, width: Math.max(0, hx + 100), top: Y - 3, height: 6, borderRadius: 3, background: GRAD, boxShadow: `0 0 24px ${C.blue}` }} />
        <div style={{ position: "absolute", left: hx - 11, top: Y - 11, width: 22, height: 22, borderRadius: 11, background: "#fff", boxShadow: `0 0 30px 8px ${C.cyan}` }} />
        {NODES.map((n, i) => {
          const o = ap(f, n.at - 2, 12);
          return (
            <div key={i} style={{ position: "absolute", left: n.x - 200, width: 400, top: 0, opacity: o, transform: `translateY(${(1 - o) * 20}px)` }}>
              <div style={{ position: "absolute", top: Y - 128, width: 400, textAlign: "center", fontFamily: EN, fontWeight: 700, fontSize: 64, color: i === 2 ? undefined : C.ink }}>{i === 2 ? <GradText>{n.year}</GradText> : n.year}</div>
              <div style={{ position: "absolute", left: 200 - 12, top: Y - 12, width: 24, height: 24, borderRadius: 12, background: C.bg, border: `4px solid ${i === 2 ? C.cyan : C.ink}` }} />
              <div style={{ position: "absolute", top: Y + 34, width: 400, display: "flex", justifyContent: "center", alignItems: "center", gap: 12 }}>
                {n.mark && <Mark w={52} />}
                <div style={{ fontFamily: EN, fontWeight: 700, fontSize: 42, color: C.ink }}>{n.name}</div>
              </div>
              <div style={{ position: "absolute", top: Y + 98, width: 400, textAlign: "center", fontFamily: CN, fontSize: 28, color: C.mute }}>{n.desc}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export { Backdrop };
export const S1End = B2;
export const S2End = B3;
export const T_B06_END = TE("b06");
