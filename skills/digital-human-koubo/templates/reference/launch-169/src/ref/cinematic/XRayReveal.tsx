import React from "react";
import { AbsoluteFill } from "remotion";
import { clamp01, mix } from "./motion";

/**
 * X-ray / spotlight reveal: a lens follows a cursor path and wipes the outside away to show
 * what's inside (structure, wireframe, code, data). Two layers, one CSS mask — deterministic.
 *
 *   <XRayReveal f={f} path={[[0, 400, 500], [40, 1200, 480]]} outer={<Img src={shot}/>} inner={<Blueprint src={shot}/>} />
 * path: [frame, x, y] keys (linear between keys, eased). `r` can be animated the same way.
 */
export type XKey = [number, number, number];
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const along = (keys: XKey[], f: number) => {
  if (f <= keys[0][0]) return { x: keys[0][1], y: keys[0][2] };
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, x0, y0] = keys[i];
    const [t1, x1, y1] = keys[i + 1];
    if (f <= t1) {
      const u = ease(clamp01((f - t0) / (t1 - t0)));
      return { x: mix(x0, x1, u), y: mix(y0, y1, u) };
    }
  }
  const l = keys[keys.length - 1];
  return { x: l[1], y: l[2] };
};

export type Callout = { x: number; y: number; label: string; sub?: string };
export const XRayReveal: React.FC<{
  f: number;
  outer: React.ReactNode;
  inner: React.ReactNode;
  path: XKey[];
  r?: number | ((f: number) => number);
  soft?: number;
  ring?: string;
  callouts?: Callout[];
  accent?: string;
  font?: string;
  mode?: "lens" | "scan";
}> = ({ f, outer, inner, path, r = 220, soft = 18, ring = "rgba(120,220,255,0.9)", callouts = [], accent = "#7FE3FF", font = '"SF Mono", Menlo, monospace', mode = "lens" }) => {
  const { x, y } = along(path, f);
  const R = typeof r === "function" ? r(f) : r;
  const mask =
    mode === "lens"
      ? `radial-gradient(circle ${R}px at ${x}px ${y}px, transparent ${Math.max(0, R - soft)}px, #000 ${R}px)`
      : `linear-gradient(90deg, transparent ${x - soft}px, #000 ${x + soft}px)`;
  return (
    <AbsoluteFill>
      <AbsoluteFill>{inner}</AbsoluteFill>
      <AbsoluteFill style={{ WebkitMaskImage: mask, maskImage: mask }}>{outer}</AbsoluteFill>
      {mode === "lens" ? (
        <>
          <div style={{ position: "absolute", left: x - R, top: y - R, width: R * 2, height: R * 2, borderRadius: "50%", border: `2px solid ${ring}`, boxShadow: `0 0 30px ${ring}, inset 0 0 40px rgba(120,220,255,0.25)` }} />
          {[0, 90, 180, 270].map((a) => (
            <div key={a} style={{ position: "absolute", left: x - 1, top: y - R - 14, width: 2, height: 22, background: ring, transformOrigin: `1px ${R + 14}px`, transform: `rotate(${a + f * 0.6}deg)` }} />
          ))}
          <div style={{ position: "absolute", left: x + R * 0.72, top: y + R * 0.72, fontFamily: font, fontSize: 18, letterSpacing: "0.15em", color: accent, whiteSpace: "nowrap" }}>
            X {Math.round(x)} · Y {Math.round(y)}
          </div>
        </>
      ) : (
        <div style={{ position: "absolute", left: x - 1.5, top: 0, width: 3, height: "100%", background: ring, boxShadow: `0 0 24px 6px ${ring}` }} />
      )}
      {callouts.map((c) => {
        const d = mode === "lens" ? Math.hypot(c.x - x, c.y - y) : c.x < x ? 0 : 1e9;
        const on = clamp01((R * 0.95 - d) / 40);
        if (on <= 0) return null;
        return (
          <div key={c.label} style={{ position: "absolute", left: c.x, top: c.y, opacity: on }}>
            <div style={{ position: "absolute", left: -7, top: -7, width: 14, height: 14, borderRadius: 7, background: accent, boxShadow: `0 0 16px ${accent}` }} />
            <div style={{ position: "absolute", left: 18, top: -22, width: 70 * on, height: 2, background: accent }} />
            <div style={{ position: "absolute", left: 96, top: -46, whiteSpace: "nowrap", fontFamily: font, color: "#fff", padding: "8px 14px", borderRadius: 10, background: "rgba(8,10,14,0.82)", boxShadow: `0 0 0 1px ${accent}55`, transform: `translateX(${(1 - on) * -12}px)` }}>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{c.label}</div>
              {c.sub && <div style={{ fontSize: 18, color: accent, marginTop: 4 }}>{c.sub}</div>}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Turn any screenshot/photo into its "inside" view: inverted cyan blueprint + grid + scanlines. */
export const Blueprint: React.FC<{ children: React.ReactNode; tint?: string; bg?: string; grid?: number }> = ({ children, tint = "#39C8FF", bg = "#031423", grid = 48 }) => (
  <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
    <AbsoluteFill style={{ filter: "grayscale(1) invert(1) contrast(2.2) brightness(0.9)", mixBlendMode: "screen", opacity: 0.85 }}>{children}</AbsoluteFill>
    <AbsoluteFill style={{ background: tint, mixBlendMode: "multiply" }} />
    <AbsoluteFill style={{ backgroundImage: `linear-gradient(rgba(57,200,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(57,200,255,0.18) 1px, transparent 1px)`, backgroundSize: `${grid}px ${grid}px` }} />
    <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 4px)" }} />
  </AbsoluteFill>
);
