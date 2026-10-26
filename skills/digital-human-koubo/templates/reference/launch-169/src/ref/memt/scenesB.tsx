// 章节卡 · 看点一（架构透视 + 长程不跑偏）· 看点二（经验沉淀与复用）
import React from "react";
import { AbsoluteFill, random } from "remotion";
import { Database, Gem, Infinity as InfinityIcon, PenLine, RefreshCw, ScanSearch } from "lucide-react";
import { IconTile } from "../cinematic/IconTile";
import { clamp01, E, mix, seg } from "../cinematic/motion";
import { ap, C, CN, EN, GRAD, GradText, Kicker, Mark, out, Rise, slamStyle, T, Wd } from "./kit";

// ═════════ 章节卡：竖条遮罩进、出 ═════════
export const Chapter: React.FC<{ f: number; start: number; end: number; num: string; title: { t: string; accent?: boolean }[]; en: string }> = ({ f, start, end, num, title, en }) => {
  const N = 10;
  const sw = 1920 / N;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: N }, (_, i) => {
        const pin = seg(f, start + i * 0.6, 9, E.out);
        const pout = seg(f, end - 12 + i * 0.6, 9, E.in2);
        const y = (1 - pin) * 1080 - pout * 1080;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: i * sw - 0.5,
              width: sw + 1,
              top: 0,
              height: 1080,
              transform: `translateY(${y}px)`,
              background: `linear-gradient(120deg, #1B2C8F 0%, ${C.blue} 45%, ${C.violet} 100%)`,
              backgroundSize: "1920px 1080px",
              backgroundPosition: `${-i * sw}px 0`,
            }}
          />
        );
      })}
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: out(f, end - 14, 6) * (f >= start + 6 ? 1 : 0) }}>
        <div style={{ fontFamily: CN, fontSize: 36, fontWeight: 600, color: "rgba(255,255,255,0.85)", letterSpacing: "0.3em", marginBottom: 18, opacity: ap(f, start + 6, 10) }}>{num}</div>
        <Rise f={f} at={start + 8} parts={title.map((p) => ({ t: p.t, color: p.accent ? "#9FE6FF" : "#fff" }))} size={124} weight={900} step={1.4} />
        <div style={{ fontFamily: EN, fontSize: 28, color: "rgba(255,255,255,0.7)", letterSpacing: "0.2em", textTransform: "uppercase", marginTop: 22, opacity: ap(f, start + 16, 12) }}>{en}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ═════════ S7 看点一：记忆进入计算 ═════════
const MOE = Wd("b08", "MoE");
const STATE = Wd("b08", "持续存在");
const OPS = [
  { w: "写入", icon: PenLine },
  { w: "保持", icon: InfinityIcon },
  { w: "更新", icon: RefreshCw },
  { w: "读取", icon: ScanSearch },
].map((o) => ({ ...o, at: Wd("b08", o.w) }));
const EXT = Wd("b08", "不是外挂");
const LONG = Wd("b08", "长程");
const STAY = Wd("b08", "不跑偏");
const LAYERS = [0, 1, 2, 3];
const LX = 200;
const LY = (i: number) => 300 + i * 132;
const MX = 960;
const MY = 300;
const CELL = 46;
const GAP = 8;

export const s7Cues = () => [
  { at: MOE, name: "pop", volume: 0.55 },
  { at: STATE, name: "swish-2", volume: 0.5 },
  ...OPS.map((o, i) => ({ at: o.at, name: "tap", volume: 0.55 + i * 0.05 })),
  { at: EXT - 20, name: "pop", volume: 0.4 },
  { at: EXT + 6, name: "cut", volume: 0.7 },
  { at: LONG - 6, name: "whoosh", volume: 0.5 },
  { at: STAY, name: "slam-2", volume: 0.7 },
];

const cellVal = (i: number, j: number, f: number) => {
  const [w, , u, r] = OPS.map((o) => o.at);
  let v = 0.06;
  const base = 0.25 + 0.75 * random(`m${i}-${j}`);
  if (f >= w + j * 1.4) v = base * seg(f, w + j * 1.4, 8);
  if (f >= u && random(`u${i}-${j}`) < 0.32) {
    const t = u + random(`ut${i}-${j}`) * 10;
    if (f >= t) v = (0.3 + 0.7 * random(`n${i}-${j}`)) * (1 + 0.8 * Math.exp(-(f - t) / 4));
  }
  if (f >= r) {
    const row = (f - r) / 1.6;
    if (Math.abs(row - i) < 1.2) v = Math.max(v, 1.15);
  }
  return v;
};

export const S7Arch: React.FC<{ f: number; start: number }> = ({ f, start }) => {
  const toTraj = seg(f, LONG - 8, 14, E.inOut);
  const lit = ap(f, STATE, 12);
  const keepGlow = f >= OPS[1].at ? 0.5 + 0.5 * Math.sin((f - OPS[1].at) / 5) ** 2 : 0;
  const readP = f >= OPS[3].at ? seg(f, OPS[3].at, 26, E.linear) : 0;
  const extIn = ap(f, EXT - 22, 12);
  const extKill = seg(f, EXT + 6, 6);
  const extFall = seg(f, EXT + 14, 16, E.in2);
  return (
    <AbsoluteFill>
      {/* ── 架构 ── */}
      <AbsoluteFill style={{ opacity: 1 - toTraj, transform: `scale(${mix(1, 0.86, toTraj)})` }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 96, textAlign: "center", ...slamStyle(f, MOE - 2) }}>
          <div style={{ fontFamily: EN, fontWeight: 800, fontSize: 64, color: C.ink, letterSpacing: "-0.02em" }}>
            Memory-Native <GradText>MoE</GradText>
          </div>
          <div style={{ fontFamily: CN, fontSize: 28, color: C.mute, marginTop: 4 }}>记忆原生 MoE 架构</div>
        </div>
        {/* 模型内部边界 */}
        <div style={{ position: "absolute", left: 160, top: 248, width: 1290, height: 650, borderRadius: 28, border: `2px dashed rgba(39,185,243,${0.45 * lit})`, background: `rgba(61,107,245,${0.04 * lit})` }} />
        <div style={{ position: "absolute", left: 186, top: 262, fontFamily: CN, fontSize: 20, color: C.cyan, opacity: lit, letterSpacing: "0.12em" }}>模型内部</div>
        {/* 层 */}
        {LAYERS.map((i) => {
          const o = ap(f, start + 4 + i * 3, 14);
          const pill = seg(f, STATE + i * 3, 10);
          const step = Math.floor(f / 5);
          const a1 = Math.floor(random(`e${i}-${step}`) * 8);
          const a2 = (a1 + 1 + Math.floor(random(`f${i}-${step}`) * 7)) % 8;
          return (
            <div key={i} style={{ position: "absolute", left: LX, top: LY(i) + 20, width: 640, height: 100, borderRadius: 18, background: "rgba(255,255,255,0.045)", border: "1px solid rgba(160,180,255,0.16)", opacity: o, transform: `translateY(${(1 - o) * 24}px)` }}>
              <div style={{ position: "absolute", left: 22, top: 22, fontFamily: EN, fontSize: 18, color: C.mute, lineHeight: 1.3 }}>
                Layer {i + 1}
                <br />
                <span style={{ fontSize: 15, opacity: 0.8 }}>MoE</span>
              </div>
              {Array.from({ length: 8 }, (_, k) => {
                const on = f >= MOE - 6 && (k === a1 || k === a2);
                return <div key={k} style={{ position: "absolute", left: 112 + k * 38, top: 34, width: 30, height: 30, borderRadius: 8, background: on ? C.cyan : "rgba(226,232,255,0.1)", boxShadow: on ? `0 0 14px ${C.cyan}` : undefined }} />;
              })}
              <div
                style={{
                  position: "absolute",
                  left: 430,
                  top: 26,
                  width: 190,
                  height: 48,
                  borderRadius: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: EN,
                  fontSize: 17,
                  fontWeight: 600,
                  color: pill > 0.5 ? "#fff" : C.mute,
                  background: pill > 0 ? `linear-gradient(90deg, rgba(61,107,245,${pill}), rgba(106,59,240,${pill}))` : "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(160,180,255,0.2)",
                  boxShadow: pill > 0 ? `0 0 ${24 * pill}px rgba(106,59,240,0.7)` : undefined,
                }}
              >
                Native Memory
              </div>
            </div>
          );
        })}
        {/* 连线 */}
        <svg width={1920} height={1080} style={{ position: "absolute", opacity: lit }}>
          {LAYERS.map((i) => {
            const y0 = LY(i) + 70;
            const y1 = MY + 60 + i * 100;
            const d = `M ${LX + 620} ${y0} C ${LX + 700} ${y0}, ${MX - 80} ${y1}, ${MX - 10} ${y1}`;
            const pulse = readP > 0 && readP < 1;
            return (
              <g key={i}>
                <path d={d} style={{ fill: "none", stroke: "rgba(106,59,240,0.55)", strokeWidth: 2.5, strokeDasharray: "6 8", strokeDashoffset: -f * 1.2 }} />
                {pulse && <path d={d} pathLength={1} style={{ fill: "none", stroke: "#BFE9FF", strokeWidth: 4, strokeDasharray: "0.12 0.88", strokeDashoffset: mix(0.12, -1, readP) }} />}
              </g>
            );
          })}
        </svg>
        {/* 记忆矩阵 */}
        <div style={{ position: "absolute", left: MX, top: MY - 40, width: 8 * (CELL + GAP), opacity: ap(f, STATE + 4, 12) }}>
          <div style={{ fontFamily: CN, fontSize: 24, fontWeight: 700, color: C.ink, textAlign: "center" }}>
            内部记忆状态 <span style={{ fontFamily: EN, fontStyle: "italic" }}>M</span>
            <span style={{ color: C.mute, fontWeight: 400, fontSize: 20 }}>　持续存在 · 可更新</span>
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: MX - 10,
            top: MY - 6,
            width: 8 * (CELL + GAP) + 12,
            height: 8 * (CELL + GAP) + 12,
            borderRadius: 18,
            border: `1px solid rgba(160,180,255,${0.2 + 0.5 * keepGlow})`,
            boxShadow: keepGlow ? `0 0 ${40 * keepGlow}px rgba(39,185,243,0.35)` : undefined,
            opacity: ap(f, STATE + 4, 12),
          }}
        />
        {Array.from({ length: 64 }, (_, n) => {
          const i = Math.floor(n / 8);
          const j = n % 8;
          const v = f >= STATE + 4 ? cellVal(i, j, f) : 0;
          const o = ap(f, STATE + 4 + (i + j) * 0.6, 10);
          const hue = mix(197, 258, j / 7);
          return (
            <div
              key={n}
              style={{
                position: "absolute",
                left: MX + j * (CELL + GAP),
                top: MY + i * (CELL + GAP),
                width: CELL,
                height: CELL,
                borderRadius: 9,
                opacity: o,
                background: `hsla(${hue}, 88%, ${mix(16, 64, clamp01(v))}%, ${mix(0.35, 1, clamp01(v))})`,
                boxShadow: v > 0.9 ? `0 0 18px hsla(${hue}, 90%, 60%, 0.8)` : undefined,
              }}
            />
          );
        })}
        {/* 四个操作 */}
        <div style={{ position: "absolute", left: MX - 16, top: 762, width: 8 * (CELL + GAP) + 32, display: "flex", justifyContent: "space-between" }}>
          {OPS.map((o) => {
            const on = seg(f, o.at - 2, 10, E.back);
            return (
              <div key={o.w} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, opacity: ap(f, STATE + 10, 12), transform: `scale(${mix(0.9, 1, clamp01(on))})` }}>
                <IconTile icon={o.icon} size={78} on={clamp01(on)} color={C.blue} />
                <div style={{ fontFamily: CN, fontSize: 24, fontWeight: 700, color: on > 0.5 ? C.ink : C.mute }}>{o.w}</div>
              </div>
            );
          })}
        </div>
        {/* 外挂检索：出现 → 划掉 → 掉落 */}
        <div style={{ position: "absolute", left: 1520, top: 450 + extFall * 260, width: 300, opacity: extIn * (1 - extFall), transform: `rotate(${extFall * 14}deg)` }}>
          <div style={{ position: "absolute", left: -70, top: 74, width: 66, height: 2, borderTop: "2px dashed rgba(226,232,255,0.35)" }} />
          <div style={{ padding: "22px 24px", borderRadius: 18, background: "rgba(255,255,255,0.05)", border: `1px solid ${extKill > 0 ? C.red : "rgba(226,232,255,0.25)"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Database size={34} strokeWidth={1.75} color={C.mute} />
              <div style={{ fontFamily: CN, fontSize: 32, fontWeight: 700, color: C.ink }}>外挂检索</div>
            </div>
            <div style={{ fontFamily: CN, fontSize: 20, color: C.mute, marginTop: 8 }}>挂在模型外面，用时再去翻</div>
          </div>
          <div style={{ position: "absolute", left: -10, right: -10, top: 72, height: 5, borderRadius: 3, background: C.red, transform: `scaleX(${extKill})`, transformOrigin: "left", boxShadow: `0 0 12px ${C.red}` }} />
        </div>
      </AbsoluteFill>

      {/* ── 长程轨迹：不跑偏 ── */}
      {toTraj > 0 && <Trajectory f={f} q={toTraj} />}
    </AbsoluteFill>
  );
};

const Trajectory: React.FC<{ f: number; q: number }> = ({ f, q }) => {
  const draw = seg(f, LONG, 28, E.inOut);
  const X0 = 220;
  const X1 = 1640;
  const Y0 = 600;
  const drift = (x: number) => Y0 + 230 * Math.pow((x - X0) / (X1 - X0), 1.7) + 14 * Math.sin((x - X0) / 55);
  const dPath = "M" + Array.from({ length: 80 }, (_, i) => X0 + ((X1 - X0) * i) / 79).map((x) => `${x.toFixed(1)},${drift(x).toFixed(1)}`).join(" L");
  return (
    <AbsoluteFill style={{ opacity: q }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 120, textAlign: "center", opacity: ap(f, LONG - 2, 10) }}>
        <Kicker>长程任务 · Long-horizon</Kicker>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 168 }}>
        <Rise f={f} at={STAY - 3} parts={[{ t: "前后一致，" }, { t: "不跑偏", accent: true }]} size={120} weight={900} step={1.4} />
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="gt" gradientUnits="userSpaceOnUse" x1={X0} y1={Y0} x2={X1} y2={Y0}>
            <stop offset="0" stopColor={C.cyan} />
            <stop offset="0.6" stopColor={C.blue} />
            <stop offset="1" stopColor={C.violet} />
          </linearGradient>
        </defs>
        <line x1={X0} x2={X1 + 40} y1={900} y2={900} style={{ stroke: C.faint, strokeWidth: 2 }} />
        {[0, 0.5, 1].map((t, i) => (
          <line key={i} x1={X0 + (X1 - X0) * t} x2={X0 + (X1 - X0) * t} y1={892} y2={908} style={{ stroke: C.faint, strokeWidth: 2 }} />
        ))}
        <path d={dPath} pathLength={1} style={{ fill: "none", stroke: "rgba(226,232,255,0.4)", strokeWidth: 3, strokeDasharray: 1, strokeDashoffset: 1 - draw }} />
        <line x1={X0} y1={Y0} x2={mix(X0, X1, draw)} y2={Y0} style={{ stroke: "url(#gt)", strokeWidth: 7, strokeLinecap: "round", filter: `drop-shadow(0 0 10px ${C.blue})` }} />
        <circle cx={mix(X0, X1, draw)} cy={Y0} r={10} style={{ fill: "#fff", filter: `drop-shadow(0 0 12px ${C.cyan})` }} />
      </svg>
      {["第 1 轮", "第 50 轮", "第 100 轮"].map((s, i) => (
        <div key={s} style={{ position: "absolute", left: X0 + ((X1 - X0) * i) / 2 - 80, width: 160, top: 920, textAlign: "center", fontFamily: CN, fontSize: 22, color: C.mute }}>
          {s}
        </div>
      ))}
      <div style={{ position: "absolute", left: X1 - 380, top: Y0 - 70, width: 420, textAlign: "right", fontFamily: CN, fontSize: 28, fontWeight: 700, color: C.cyan, opacity: ap(f, LONG + 20, 10) }}>MemT：始终守住约束</div>
      <div style={{ position: "absolute", left: X1 - 380, top: drift(X1) - 64, width: 420, textAlign: "right", fontFamily: CN, fontSize: 24, color: C.mute, opacity: ap(f, LONG + 24, 10) }}>没有记忆：越走越偏</div>
    </AbsoluteFill>
  );
};

// ═════════ S9 看点二：经验沉淀与复用 ═════════
const E1 = Wd("b10", "交互");
const E2 = Wd("b10", "指导");
const E3 = Wd("b10", "纠错");
const STORE = Wd("b10", "沉淀");
const REUSE = Wd("b10", "用到");
const SAME = Wd("b10", "同样的错");
const VAULT = { x: 960, y: 580 };
export const s9Cues = () => [
  { at: E1, name: "tap", volume: 0.5 },
  { at: E2, name: "tap", volume: 0.55 },
  { at: E3 - 6, name: "cut", volume: 0.55 },
  { at: E3 + 12, name: "done", volume: 0.6 },
  { at: STORE, name: "swish-1", volume: 0.5 },
  { at: STORE + 20, name: "pop", volume: 0.6 },
  { at: REUSE + 16, name: "swish-3", volume: 0.45 },
  { at: REUSE + 30, name: "ding", volume: 0.6 },
  { at: SAME, name: "slam-3", volume: 0.65 },
];

const Node: React.FC<{ x: number; y: number; o: number; label?: string; tone?: "bad" | "good" | "plain"; big?: boolean }> = ({ x, y, o, label, tone = "plain", big }) => {
  const col = tone === "bad" ? C.red : tone === "good" ? C.green : C.ink;
  const s = big ? 54 : 22;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x - s / 2,
          top: y - s / 2,
          width: s,
          height: s,
          borderRadius: s / 2,
          background: big ? `rgba(${tone === "bad" ? "255,91,98" : "62,220,155"},0.16)` : C.bg,
          border: `3px solid ${col}`,
          opacity: o,
          transform: `scale(${mix(0.4, 1, o)})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: col,
          fontFamily: EN,
          fontWeight: 800,
          fontSize: 28,
          boxShadow: big ? `0 0 24px ${col}66` : undefined,
        }}
      >
        {big ? (tone === "bad" ? "✕" : "✓") : null}
      </div>
      {label && <div style={{ position: "absolute", left: x - 90, width: 180, top: y + (big ? 34 : 22), textAlign: "center", fontFamily: CN, fontSize: 24, color: col === C.ink ? C.mute : col, opacity: o }}>{label}</div>}
    </>
  );
};

export const S9Exp: React.FC<{ f: number; start: number }> = ({ f, start }) => {
  const A = 360;
  const Bv = 820;
  const xs = [360, 620, 860, 1080];
  const wrong = (y: number, dy: number) => `M ${xs[3]} ${y} C ${xs[3] + 120} ${y}, ${1220} ${y - dy}, ${1360} ${y - dy}`;
  const right = (y: number, dy: number) => `M ${xs[3]} ${y} C ${xs[3] + 120} ${y}, ${1220} ${y + dy}, ${1360} ${y + dy}`;
  const pA = seg(f, start + 6, Math.max(10, E2 + 14 - start - 6), E.linear); // 起点 → 分叉
  const pWrongA = seg(f, E3 - 16, 10, E.out);
  const pFix = seg(f, E3, 12, E.inOut);
  const pB = seg(f, REUSE - 2, 16, E.linear);
  const pRightB = seg(f, REUSE + 18, 12, E.out);
  const beam = seg(f, REUSE + 10, 10) * out(f, REUSE + 36, 12);
  const gemT = seg(f, STORE, 20, E.inOut);
  const gem = { x: mix(1360, VAULT.x, gemT), y: mix(A, VAULT.y - 4, gemT) - Math.sin(gemT * Math.PI) * 90 };
  const vaultLit = seg(f, STORE + 18, 10);
  return (
    <AbsoluteFill style={{ opacity: ap(f, start, 10) }}>
      {f < SAME - 4 ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 120, textAlign: "center", opacity: ap(f, start + 4, 10) * out(f, SAME - 10, 6) }}>
          <Kicker>交互 · 指导 · 纠错 → 经验</Kicker>
        </div>
      ) : (
        <div style={{ position: "absolute", left: 0, right: 0, top: 96 }}>
          <Rise f={f} at={SAME - 3} parts={[{ t: "同样的错，不用教" }, { t: "第二遍", accent: true }]} size={84} weight={900} step={1.2} />
        </div>
      )}
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        {/* 任务 A */}
        <line x1={xs[0]} y1={A} x2={mix(xs[0], xs[3], pA)} y2={A} style={{ stroke: "rgba(226,232,255,0.7)", strokeWidth: 4 }} />
        <path d={wrong(A, 90)} pathLength={1} style={{ fill: "none", stroke: C.red, strokeWidth: 4, strokeDasharray: 1, strokeDashoffset: 1 - pWrongA, opacity: mix(1, 0.4, pFix) }} />
        <path d={`M 1360 ${A - 90} C 1440 ${A - 60}, 1440 ${A + 60}, 1360 ${A + 90}`} pathLength={1} style={{ fill: "none", stroke: C.green, strokeWidth: 4, strokeDasharray: "0.04 0.03", strokeDashoffset: 0, opacity: pFix }} />
        <path d={right(A, 90)} pathLength={1} style={{ fill: "none", stroke: C.green, strokeWidth: 4, strokeDasharray: 1, strokeDashoffset: 1 - pFix }} />
        {/* 任务 B */}
        <line x1={xs[0]} y1={Bv} x2={mix(xs[0], xs[3], pB)} y2={Bv} style={{ stroke: "rgba(226,232,255,0.7)", strokeWidth: 4 }} />
        <path d={wrong(Bv, 90)} style={{ fill: "none", stroke: "rgba(255,91,98,0.35)", strokeWidth: 3, strokeDasharray: "8 10", opacity: pRightB }} />
        <path d={right(Bv, 90)} pathLength={1} style={{ fill: "none", stroke: C.green, strokeWidth: 5, strokeDasharray: 1, strokeDashoffset: 1 - pRightB, filter: `drop-shadow(0 0 8px ${C.green})` }} />
        {/* 记忆 → 分叉的光束 */}
        {beam > 0 && <line x1={VAULT.x + 60} y1={VAULT.y + 40} x2={xs[3]} y2={Bv - 14} style={{ stroke: C.cyan, strokeWidth: 3, opacity: beam, strokeDasharray: "4 6", strokeDashoffset: -f * 2 }} />}
      </svg>
      {/* 车道标签 */}
      <div style={{ position: "absolute", left: 120, top: A - 22, fontFamily: CN, fontSize: 30, fontWeight: 700, color: C.ink, opacity: ap(f, start + 2, 10) }}>任务 A</div>
      <div style={{ position: "absolute", left: 120, top: Bv - 22, fontFamily: CN, fontSize: 30, fontWeight: 700, color: C.ink, opacity: ap(f, REUSE - 6, 10) }}>任务 B</div>
      <div style={{ position: "absolute", left: 120, top: Bv + 20, fontFamily: CN, fontSize: 20, color: C.mute, opacity: ap(f, REUSE - 4, 10) }}>相关任务</div>
      <Node x={xs[0]} y={A} o={ap(f, start + 4, 8)} />
      <Node x={xs[1]} y={A} o={ap(f, E1 - 2, 8)} label="交互" />
      <Node x={xs[2]} y={A} o={ap(f, E2 - 2, 8)} label="指导" />
      <Node x={xs[3]} y={A} o={ap(f, E2 + 12, 8)} />
      <Node x={1360} y={A - 90} o={ap(f, E3 - 8, 8) * mix(1, 0.55, pFix)} tone="bad" big label="踩坑" />
      <div style={{ position: "absolute", left: 1450, top: A - 18, fontFamily: CN, fontSize: 26, fontWeight: 700, color: C.green, opacity: ap(f, E3 + 2, 10) }}>纠错</div>
      <Node x={1360} y={A + 90} o={ap(f, E3 + 10, 8)} tone="good" big />
      <Node x={xs[0]} y={Bv} o={ap(f, REUSE - 4, 8)} />
      <Node x={xs[1]} y={Bv} o={ap(f, REUSE + 2, 8)} />
      <Node x={xs[2]} y={Bv} o={ap(f, REUSE + 6, 8)} />
      <Node x={xs[3]} y={Bv} o={ap(f, REUSE + 12, 8)} />
      <Node x={1360} y={Bv - 90} o={ap(f, REUSE + 18, 8) * 0.35} tone="bad" big />
      <div style={{ position: "absolute", left: 1410, top: Bv - 108, fontFamily: CN, fontSize: 22, color: "rgba(255,91,98,0.6)", opacity: ap(f, REUSE + 22, 8) }}>已避开</div>
      <Node x={1360} y={Bv + 90} o={ap(f, REUSE + 28, 8)} tone="good" big label="一次做对" />
      {/* 记忆库 */}
      <div
        style={{
          position: "absolute",
          left: VAULT.x - 170,
          top: VAULT.y - 50,
          width: 340,
          height: 100,
          borderRadius: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: `rgba(61,107,245,${0.08 + 0.18 * vaultLit})`,
          border: `1px solid rgba(39,185,243,${0.3 + 0.5 * vaultLit})`,
          boxShadow: vaultLit ? `0 0 ${50 * vaultLit}px rgba(61,107,245,0.45)` : undefined,
          opacity: ap(f, start + 8, 12),
        }}
      >
        <Mark w={60} />
        <div>
          <div style={{ fontFamily: CN, fontSize: 28, fontWeight: 700, color: C.ink }}>内部记忆</div>
          <div style={{ fontFamily: CN, fontSize: 18, color: C.mute }}>{vaultLit > 0.5 ? "已存入 1 条经验" : "MemT 1.0"}</div>
        </div>
      </div>
      {/* 经验晶体 */}
      {f >= STORE && gemT < 1 && (
        <div style={{ position: "absolute", left: gem.x - 150, top: gem.y - 34, width: 300, height: 68, borderRadius: 16, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", background: GRAD, boxShadow: "0 10px 40px rgba(61,107,245,0.6)", transform: `scale(${mix(1, 0.5, gemT)})`, opacity: 1 - seg(f, STORE + 14, 6) }}>
          <Gem size={30} strokeWidth={1.75} color="#fff" />
          <div style={{ fontFamily: CN, fontSize: 22, fontWeight: 700, color: "#fff" }}>经验：签名别改</div>
        </div>
      )}
    </AbsoluteFill>
  );
};
export const B_TIMES = { MOE, STATE, EXT, LONG, STAY, STORE, REUSE, SAME, T09: T("b09") };
