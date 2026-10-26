import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { E, clamp01, mix, seg } from "./motion";

const FONT = '"SF Pro Display", -apple-system, "Helvetica Neue", sans-serif';

const Cell: React.FC<{ level: number; glow: number }> = ({ level, glow }) => (
  <div style={{ position: "relative", width: 210, height: 560, borderRadius: 60, padding: 12, boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(255,255,255,0.22)", boxShadow: `0 0 ${80 * glow}px rgba(48,209,88,${0.35 * glow}), inset 0 1px 0 rgba(255,255,255,0.25)` }}>
    <div style={{ position: "absolute", top: -26, left: 75, width: 60, height: 18, borderRadius: 8, background: "rgba(255,255,255,0.22)" }} />
    <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, height: `calc(${level * 100}% - ${24 * level}px)`, borderRadius: 48, background: "linear-gradient(180deg, #7CF29A 0%, #30D158 45%, #1E9E43 100%)", boxShadow: "inset 0 2px 0 rgba(255,255,255,0.5)" }} />
    <div style={{ position: "absolute", inset: 12, borderRadius: 48, background: "linear-gradient(100deg, rgba(255,255,255,0.18) 0%, transparent 35%)" }} />
  </div>
);

/** Two glass cells charge side by side while the headline number counts up. */
export const DualBattery: React.FC<{ value: number; unit: string; label: string; note: string }> = ({ value, unit, label, note }) => {
  const f = useCurrentFrame();
  const a = seg(f, 4, 36, E.inOut);
  const b = seg(f, 10, 36, E.inOut);
  const count = seg(f, 6, 40, E.out);
  const glow = seg(f, 30, 16, E.out);
  const push = mix(1.06, 1, seg(f, 0, 60, E.out));
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 55%, #0b1a10 0%, #000 65%)", alignItems: "center", justifyContent: "center", transform: `scale(${push})` }}>
      <div style={{ display: "flex", gap: 56, marginTop: 180 }}>
        <Cell level={a} glow={glow} />
        <Cell level={b} glow={glow} />
      </div>
      <div style={{ marginTop: 90, textAlign: "center", fontFamily: FONT, color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 14 }}>
          <span style={{ fontSize: 190, fontWeight: 700, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>{Math.round(value * count)}</span>
          <span style={{ fontSize: 56, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{unit}</span>
        </div>
        <div style={{ fontSize: 40, fontWeight: 500, color: "rgba(255,255,255,0.72)", opacity: seg(f, 16, 12) }}>{label}</div>
        <div style={{ marginTop: 22, fontSize: 30, fontWeight: 500, color: "#30D158", opacity: clamp01(seg(f, 34, 12)) }}>{note}</div>
      </div>
    </AbsoluteFill>
  );
};
