import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { V } from "./brand";
import { E, clamp01, mix, seg } from "./motion";

const SANS = V.body;
const SERIF = V.display;
const ORANGE = V.accent;
const FG = "#F5F3EF";
const CARD = "#2E2E2E";

const Headline: React.FC<{ text: string; f: number }> = ({ text, f }) => (
  <div style={{ display: "flex", flexWrap: "wrap", columnGap: 26, rowGap: 0, paddingBottom: 12 }}>
    {text.split(" ").map((w, i) => {
      const p = seg(f, 2 + i * 3, 16, E.out);
      return (
        <span key={i} style={{ display: "inline-block", overflow: "hidden" }}>
        <span
          style={{
            display: "inline-block",
            fontFamily: SERIF,
            fontWeight: 500,
            fontSize: 92,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            color: FG,
            transform: `translateY(${(1 - p) * 110}%)`,
          }}
        >
          {w}
        </span>
        </span>
      );
    })}
  </div>
);

const Tick: React.FC<{ p: number }> = ({ p }) => (
  <div style={{ width: 30, height: 30, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${mix(0.2, 1, p)})`, opacity: clamp01(p * 2) }}>
    <svg width={16} height={16} viewBox="0 0 14 14">
      <path d="M2.5 7.5 L5.5 10.5 L11.5 3.5" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

const Checklist: React.FC<{ f: number; items: string[] }> = ({ f, items }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 620 }}>
    {items.map((s, i) => {
      const inP = seg(f, 10 + i * 5, 14, E.out);
      return (
        <div key={s} style={{ display: "flex", alignItems: "center", gap: 18, padding: "18px 22px", borderRadius: 16, background: CARD, opacity: inP, transform: `translateX(${(1 - inP) * 80}px)` }}>
          <div style={{ fontFamily: SANS, fontSize: 18, color: ORANGE, width: 34 }}>[{i + 1}]</div>
          <div style={{ flex: 1, fontFamily: SANS, fontSize: 24, color: FG }}>{s}</div>
          <Tick p={seg(f, 20 + i * 5, 10, E.back)} />
        </div>
      );
    })}
  </div>
);

/** Formula typing window inside a beat, for syncing key sounds. */
export const FORMULA_TYPING = { start: 8, frames: 16 };

const Formula: React.FC<{ f: number; cell: string; formula: string; label: string; value: number }> = ({
  f,
  cell,
  formula,
  label,
  value,
}) => {
  const chars = Math.floor(clamp01((f - FORMULA_TYPING.start) / FORMULA_TYPING.frames) * formula.length);
  const result = seg(f, 26, 12, E.out);
  return (
    <div style={{ width: 620, borderRadius: 18, background: CARD, overflow: "hidden", opacity: seg(f, 4, 10) }}>
      <div style={{ display: "flex", gap: 20, padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", fontFamily: SANS, fontSize: 26 }}>
        <span style={{ color: "rgba(245,243,239,0.5)" }}>{cell}</span>
        <span style={{ color: "rgba(245,243,239,0.5)", fontStyle: "italic" }}>fx</span>
        <span style={{ color: "#CDE8A0", fontFamily: "Menlo, monospace" }}>
          {formula.slice(0, chars)}
          <span style={{ opacity: Math.floor(f / 8) % 2 ? 1 : 0.2 }}>|</span>
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 24px" }}>
        <span style={{ fontFamily: SANS, fontSize: 24, color: "rgba(245,243,239,0.6)" }}>{label}</span>
        <span style={{ fontFamily: SANS, fontSize: 40, color: FG, fontVariantNumeric: "tabular-nums", padding: "4px 12px", border: `2px solid ${result > 0.5 ? ORANGE : "transparent"}`, borderRadius: 8 }}>
          {Math.round(value * result).toLocaleString("en-US")}
        </span>
      </div>
    </div>
  );
};

const Lock: React.FC<{ f: number; file: string; note: string }> = ({ f, file, note }) => {
  const close = seg(f, 18, 10, E.back);
  const glow = seg(f, 26, 14, E.out);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28, width: 620, padding: "26px 28px", borderRadius: 18, background: CARD, opacity: seg(f, 4, 10), boxShadow: `0 0 ${mix(0, 60, glow)}px color-mix(in srgb, ${ORANGE} ${35 * glow}%, transparent)` }}>
      <svg width={70} height={84} viewBox="0 0 70 84">
        <path d={`M17 ${mix(26, 36, close)} V${mix(10, 22, close)} a18 18 0 0 1 36 0 V36`} fill="none" style={{ stroke: ORANGE }} strokeWidth={7} strokeLinecap="round" transform={`translate(0 ${mix(-10, 0, close)})`} />
        <rect x={6} y={36} width={58} height={44} rx={10} style={{ fill: ORANGE }} />
        <circle cx={35} cy={56} r={6} fill="#141414" />
      </svg>
      <div style={{ fontFamily: SANS }}>
        <div style={{ fontSize: 28, color: FG }}>{file}</div>
        <div style={{ fontSize: 20, color: "rgba(245,243,239,0.55)", marginTop: 4 }}>{note}</div>
      </div>
    </div>
  );
};

export type ProofVisual =
  | { kind: "checklist"; items: string[] }
  | { kind: "formula"; cell: string; formula: string; label: string; value: number }
  | { kind: "lock"; file: string; note: string };
export type ProofBeat = { text: string; visual: ProofVisual };

const Visual: React.FC<{ f: number; v: ProofVisual }> = ({ f, v }) => {
  if (v.kind === "checklist") return <Checklist f={f} items={v.items} />;
  if (v.kind === "formula") return <Formula f={f} {...v} />;
  return <Lock f={f} {...v} />;
};

/** Short claims, `each` frames apiece, each proven by a small interaction. Length = beats.length * each. */
export const ProofBeats: React.FC<{ beats: ProofBeat[]; eyebrow?: string; each?: number }> = ({
  beats,
  eyebrow,
  each = 40,
}) => {
  const f = useCurrentFrame();
  const n = beats.length;
  const i = Math.min(n - 1, Math.floor(f / each));
  const local = f - i * each;
  const out = i < n - 1 ? seg(local, each - 6, 6, E.in) : 0;
  return (
    <AbsoluteFill style={{ background: "#1C1C1C", justifyContent: "center", alignItems: "center" }}>
      {eyebrow && (
        <div style={{ position: "absolute", top: 90, fontFamily: SANS, fontSize: 24, letterSpacing: "0.24em", color: ORANGE, opacity: seg(f, 0, 10) }}>
          {eyebrow.toUpperCase()}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 90, opacity: 1 - out, transform: `translateY(${out * -30}px)` }}>
        <div style={{ width: 760 }}>
          <Headline text={beats[i].text} f={local} />
        </div>
        <Visual f={local} v={beats[i].visual} />
      </div>
      <div style={{ position: "absolute", bottom: 80, display: "flex", gap: 12 }}>
        {beats.map((_, k) => (
          <div key={k} style={{ width: k === i ? 44 : 12, height: 6, borderRadius: 3, background: k === i ? ORANGE : "rgba(245,243,239,0.25)" }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};
