// 数据（两个尺寸、>5% 内部测试、约 300B 规模）→ 金句粒子 → 收尾
import React from "react";
import { AbsoluteFill } from "remotion";
import { clamp01, E, mix, seg } from "../cinematic/motion";
import { ap, C, CN, EN, GRAD, GradText, Kicker, Mark, MONO, out, Rise, slamStyle, T, TE, Wd } from "./kit";
import { MemParticle } from "./MemParticle";

// ═════════ S10 数据 ═════════
const NANO = Wd("b11", "36B");
const FLASH = Wd("b11", "293B");
const CW = Wd("b11", "Coding");
const PCT = Wd("b11", "百分之五");
const NOTPUB = Wd("b12", "不是公开");
const SCALE = Wd("b12", "约");
export const C_TIMES = { NANO, FLASH, CW, PCT, NOTPUB, SCALE };
export const s10Cues = () => [
  { at: NANO, name: "slam-1", volume: 0.65 },
  { at: FLASH, name: "slam-2", volume: 0.7 },
  { at: CW - 4, name: "swish-2", volume: 0.45 },
  { at: PCT, name: "impact", volume: 0.6 },
  { at: NOTPUB, name: "slam-3", volume: 0.6 },
  { at: SCALE - 6, name: "whoosh", volume: 0.45 },
];

const count = (f: number, at: number, to: number, dur = 18) => to * E.out(clamp01((f - at) / dur));

const SizeCard: React.FC<{ f: number; at: number; x: number; name: string; value: number; shrink: number }> = ({ f, at, x, name, value, shrink }) => {
  const o = ap(f, at - 4, 10);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: mix(290, 60, shrink),
        width: 560,
        height: 420,
        borderRadius: 32,
        background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))",
        border: "1px solid rgba(160,180,255,0.2)",
        boxShadow: "0 30px 90px rgba(0,0,0,0.4)",
        opacity: o * mix(1, 0.75, shrink),
        transform: `scale(${mix(mix(0.9, 1, o), 0.5, shrink)})`,
        transformOrigin: "center top",
        padding: "40px 48px",
      }}
    >
      <div style={{ fontFamily: EN, fontSize: 26, color: C.mute }}>MemT-1.0</div>
      <div style={{ fontFamily: EN, fontSize: 64, fontWeight: 700, color: C.ink, marginTop: 2 }}>{name}</div>
      <div style={{ fontFamily: EN, fontSize: 176, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums", ...slamStyle(f, at) }}>
        <GradText>{Math.round(count(f, at, value))}B</GradText>
      </div>
      <div style={{ fontFamily: CN, fontSize: 24, color: C.mute }}>总参数</div>
    </div>
  );
};

export const S10Data: React.FC<{ f: number; start: number }> = ({ f, start }) => {
  const shrink = seg(f, CW - 8, 16, E.inOut);
  const toGrid = seg(f, SCALE - 8, 14, E.inOut);
  const pct = count(f, PCT, 5, 16);
  return (
    <AbsoluteFill style={{ opacity: ap(f, start, 10) }}>
      <AbsoluteFill style={{ opacity: 1 - toGrid, transform: `translateY(${-toGrid * 80}px)` }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center", opacity: ap(f, start + 4, 10) * (1 - shrink) }}>
          <Kicker>两个尺寸 · Model family</Kicker>
        </div>
        <SizeCard f={f} at={NANO} x={mix(330, 560, shrink)} name="Nano" value={36} shrink={shrink} />
        <SizeCard f={f} at={FLASH} x={mix(1030, 800, shrink)} name="Flash" value={293} shrink={shrink} />
        {shrink > 0 && (
          <>
            <div style={{ position: "absolute", left: 0, right: 0, top: 330, opacity: shrink }}>
              <Rise f={f} at={CW - 2} parts={[{ t: "Coding · Working" }]} size={48} weight={700} font={EN} step={0.8} />
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 386, textAlign: "center", fontFamily: EN, fontWeight: 800, fontSize: 300, letterSpacing: "-0.04em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums", ...slamStyle(f, PCT - 2) }}>
              <GradText>&gt;{pct.toFixed(f < PCT + 16 ? 1 : 0)}%</GradText>
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 730, textAlign: "center", fontFamily: CN, fontSize: 36, color: C.mute, opacity: ap(f, PCT + 6, 10) }}>性能提升</div>
            <div style={{ position: "absolute", left: 1290, top: 420, ...slamStyle(f, NOTPUB), transform: `${slamStyle(f, NOTPUB).transform} rotate(-6deg)` }}>
              <div style={{ padding: "12px 24px", borderRadius: 12, border: "3px solid #FFB547", color: "#FFB547", fontFamily: CN, fontSize: 30, fontWeight: 800, background: "rgba(255,181,71,0.08)" }}>
                内部测试
                <div style={{ fontSize: 20, fontWeight: 600, opacity: 0.85 }}>非公开榜单</div>
              </div>
            </div>
          </>
        )}
      </AbsoluteFill>
      {toGrid > 0 && <ScaleGrid f={f} q={toGrid} />}
    </AbsoluteFill>
  );
};

const ScaleGrid: React.FC<{ f: number; q: number }> = ({ f, q }) => {
  const COLS = 36;
  const ROWS = 12;
  const S = 26;
  const G = 8;
  const W = COLS * (S + G) - G;
  const x0 = (1920 - W) / 2;
  const y0 = 470;
  return (
    <AbsoluteFill style={{ opacity: q }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 140, textAlign: "center", fontFamily: CN, fontWeight: 900, fontSize: 120, color: C.ink, ...slamStyle(f, SCALE) }}>
        约 <GradText style={{ fontFamily: EN }}>300B</GradText> 规模
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 316, textAlign: "center", fontFamily: CN, fontSize: 44, color: C.mute, opacity: ap(f, SCALE + 10, 12) }}>算法构想 → 工程验证</div>
      {Array.from({ length: COLS * ROWS }, (_, n) => {
        const i = Math.floor(n / COLS);
        const j = n % COLS;
        const at = SCALE - 6 + j * 0.9 + i * 0.5;
        const o = seg(f, at, 10, E.out);
        const wave = Math.sin((f - at) / 9 + j * 0.25) * 0.5 + 0.5;
        const hue = mix(197, 262, j / (COLS - 1));
        return (
          <div
            key={n}
            style={{
              position: "absolute",
              left: x0 + j * (S + G),
              top: y0 + i * (S + G),
              width: S,
              height: S,
              borderRadius: 6,
              background: `hsla(${hue}, 85%, ${mix(30, 58, wave)}%, ${mix(0.3, 0.95, o)})`,
              transform: `scale(${mix(0.2, 1, o)})`,
              opacity: o,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// ═════════ S11 金句 → 粒子 ═════════
const Q1 = Wd("b13", "今天");
const Q2 = Wd("b13", "参数");
const Q3 = Wd("b13", "记忆决定");
export const BURST = TE("b13") + 4;
const PS = Q3 - 40;
const HOLD = BURST - PS - 60;
export const s11Cues = () => [
  { at: Q1, name: "swish-1", volume: 0.4 },
  { at: Q2, name: "swish-2", volume: 0.35 },
  { at: PS + 4, name: "swish-3", volume: 0.4 },
  { at: BURST, name: "impact", volume: 0.75 },
];

export const S11Quote: React.FC<{ f: number; start: number }> = ({ f, start }) => {
  const q1Out = seg(f, Q2 - 8, 10, E.in2);
  const q2Out = seg(f, BURST - 12, 7, E.in2);
  return (
    <AbsoluteFill style={{ opacity: ap(f, start, 10) }}>
      <AbsoluteFill style={{ opacity: 1 - q1Out, transform: `translateY(${-q1Out * 40}px)` }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 330 }}>
          <Rise f={f} at={Q1 - 2} parts={[{ t: "今天正确的经验，" }]} size={96} weight={800} step={1.6} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 470 }}>
          <Rise f={f} at={Q1 + 22} parts={[{ t: "会成为" }, { t: "明天的能力", accent: true }, { t: "。" }]} size={96} weight={800} step={1.6} />
        </div>
      </AbsoluteFill>
      {f >= Q2 - 4 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 200, opacity: 1 - q2Out }}>
          <Rise f={f} at={Q2 - 2} parts={[{ t: "参数决定模型的起点，", color: "rgba(226,232,255,0.7)" }]} size={64} weight={700} step={1.2} />
        </div>
      )}
    </AbsoluteFill>
  );
};

// MemParticle 用 useCurrentFrame：Film 把它放进 <Sequence from={PARTICLE_START}>
export const ParticleLayer: React.FC = () => (
  <AbsoluteFill style={{ transform: "translateY(60px)" }}>
    <MemParticle text="记忆决定它能长多高" size={150} count={9000} hold={HOLD} colors={["#27B9F3", "#FFFFFF", "#3D6BF5", "#6A3BF0", "#9FE6FF"]} />
  </AbsoluteFill>
);
export const PARTICLE_START = PS;

// ═════════ S12 收尾 ═════════
const CTA = Wd("b14", "模型权重");
const HF = Wd("b14", "Hugging");
export const s12Cues = (land: number) => [
  { at: land - 36, name: "riser", volume: 0.35 },
  { at: land, name: "impact", volume: 0.9 },
  { at: CTA, name: "pop", volume: 0.45 },
  { at: HF, name: "tap", volume: 0.6 },
];

export const S12End: React.FC<{ f: number; land: number }> = ({ f, land }) => {
  const q = seg(f, land - 6, 18, E.out);
  const line = seg(f, land + 10, 26, E.inOut);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 960 - 520,
          top: 300 - 520,
          width: 1040,
          height: 1040,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(61,107,245,0.32) 0%, rgba(106,59,240,0.1) 40%, transparent 66%)",
          opacity: q,
        }}
      />
      <div style={{ position: "absolute", left: 960 - 120, top: 196, opacity: clamp01(q * 1.4), transform: `scale(${mix(0.4, 1, q)})`, filter: q < 1 ? `blur(${(1 - q) * 16}px)` : undefined }}>
        <Mark w={240} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 384, textAlign: "center", fontFamily: EN, fontWeight: 800, fontSize: 140, letterSpacing: "-0.03em", color: C.ink, ...slamStyle(f, land + 4) }}>
        MemT <GradText>1.0</GradText>
      </div>
      <div style={{ position: "absolute", left: 960 - 330, width: 660 * line, top: 572, height: 5, borderRadius: 3, background: GRAD, boxShadow: `0 0 18px ${C.blue}` }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 612, textAlign: "center", fontFamily: CN, fontSize: 40, fontWeight: 600, color: C.ink, opacity: ap(f, CTA, 12) }}>
        记忆原生大模型
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 714, display: "flex", justifyContent: "center", ...slamStyle(f, HF - 2) }}>
        <div style={{ padding: "16px 34px", borderRadius: 40, background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(39,185,243,0.55)", fontFamily: MONO, fontSize: 32, color: C.ink, boxShadow: "0 0 40px rgba(61,107,245,0.25)" }}>
          huggingface.co/collections/<span style={{ color: C.cyan }}>MemTensor/memt-10</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1010, textAlign: "center", fontFamily: CN, fontSize: 18, color: "rgba(226,232,255,0.42)", opacity: ap(f, land + 20, 14) }}>
        信息来源：MemOS 团队发布资料与 Hugging Face model card · 性能提升为团队内部测试结果 · 配乐 Mixkit
      </div>
    </AbsoluteFill>
  );
};
export const T14 = { start: T("b14"), end: TE("b14") };
export { out };
