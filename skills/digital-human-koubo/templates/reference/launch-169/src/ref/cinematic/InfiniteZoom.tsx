import React from "react";
import { AbsoluteFill } from "remotion";
import { clamp01, E, mix } from "./motion";

/**
 * Infinite zoom: the camera flies through a "portal" in each scene into the next one, forever.
 * Level i+1 lives inside level i at portal (cx, cy) with relative size k (fraction of frame width).
 * The camera zooms exponentially about the portal's fixed point, so the motion is seamless and
 * constant-speed; at integer progress the next level fills the frame exactly.
 *
 *   <InfiniteZoom p={f / 45} levels={[{ node: <Img …/>, portal: { x: 0.62, y: 0.48, k: 0.18, shape: "circle" } }, …]} />
 */
export type ZoomLevel = { node: React.ReactNode; portal: { x: number; y: number; k: number; shape?: "rect" | "circle" | "round" } };
type Aff = { s: number; tx: number; ty: number };
const compose = (a: Aff, b: Aff): Aff => ({ s: a.s * b.s, tx: a.s * b.tx + a.tx, ty: a.s * b.ty + a.ty }); // a∘b
const inv = (a: Aff): Aff => ({ s: 1 / a.s, tx: -a.tx / a.s, ty: -a.ty / a.s });

export const InfiniteZoom: React.FC<{ p: number; levels: ZoomLevel[]; width?: number; height?: number; loop?: boolean; ease?: (u: number) => number; ahead?: number; frame?: (i: number, reveal: number) => React.ReactNode }> = ({ p, levels, width = 1920, height = 1080, loop = true, ease = (u) => u, ahead = 3, frame }) => {
  const W = width;
  const H = height;
  const L = levels.length;
  const lv = (i: number) => levels[((i % L) + L) % L];
  const n = Math.floor(p);
  const u = ease(p - n);
  // child i+1 → parent i
  const child = (i: number): Aff => {
    const { x, y, k } = lv(i).portal;
    return { s: k, tx: x * W - k * (W / 2), ty: y * H - k * (H / 2) };
  };
  // camera: zoom about the fixed point of level n's portal map
  const { k } = lv(n).portal;
  const c = child(n);
  const Fx = c.tx / (1 - k);
  const Fy = c.ty / (1 - k);
  const z = Math.pow(1 / k, u);
  const cam: Aff = { s: z, tx: Fx - z * Fx, ty: Fy - z * Fy };
  const first = loop ? n - 1 : Math.max(0, n - 1);
  const last = loop ? n + ahead : Math.min(L - 1, n + ahead);
  const items: React.ReactNode[] = [];
  // map from level j to level n coordinates
  const toN = (j: number): Aff => {
    let a: Aff = { s: 1, tx: 0, ty: 0 };
    if (j >= n) {
      for (let i = n; i < j; i++) a = compose(a, child(i));
    } else {
      for (let i = j; i < n; i++) a = compose(a, child(i));
      a = inv(a);
    }
    return a;
  };
  for (let j = first; j <= last; j++) {
    const m = compose(cam, toN(j));
    if (m.s * W < 2) continue;
    const incoming = j === n + 1;
    const shape = lv(j - 1).portal.shape ?? "rect";
    // an incoming circular portal opens its clip to full frame by the time it arrives
    const open = incoming ? E.inOut(clamp01((u - 0.55) / 0.45)) : j > n + 1 ? 0 : 1;
    let clip: string | undefined;
    if (j > n && shape !== "rect") {
      const r0 = shape === "circle" ? H / 2 : H * 0.08;
      if (shape === "circle") clip = `circle(${mix(r0, Math.hypot(W, H) / 2, open)}px at 50% 50%)`;
      else clip = `inset(0 round ${mix(r0, 0, open)}px)`;
    }
    items.push(
      <div key={j} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, overflow: "hidden", transformOrigin: "0 0", transform: `translate(${m.tx}px, ${m.ty}px) scale(${m.s})`, clipPath: clip }}>
        {lv(j).node}
        {frame?.(j, j > n ? open : 1)}
      </div>,
    );
  }
  return <AbsoluteFill style={{ overflow: "hidden" }}>{items}</AbsoluteFill>;
};

/** Newspaper-cutout frame (white border + soft shadow + halftone) for the vintage-collage look. */
export const Cutout: React.FC<{ children: React.ReactNode; border?: number; tilt?: number; style?: React.CSSProperties }> = ({ children, border = 14, tilt = 0, style }) => (
  <div style={{ position: "relative", padding: border, background: "#f4f1ea", boxShadow: "0 18px 40px rgba(0,0,0,0.45)", transform: `rotate(${tilt}deg)`, ...style }}>
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", filter: "grayscale(1) contrast(1.25)" }}>
      {children}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(0,0,0,0.35) 1px, transparent 1.6px)", backgroundSize: "6px 6px", mixBlendMode: "multiply" }} />
    </div>
  </div>
);
