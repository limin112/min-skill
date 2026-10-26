import React from "react";
import gsap from "gsap";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { E, clamp01, mix, seg } from "./motion";

/**
 * Motion-design primitives shared by every film type: kinetic words, shape morphs,
 * wipes, slat reveals, HUD and grain. All motion derives from the current frame.
 */

type Ease = (t: number) => number;
export const ELASTIC = gsap.parseEase("elastic.out(1, 0.35)") as Ease;

/* ── wipes ── */

export const CircleWipe: React.FC<{ color: string; at?: number; dur?: number; x?: number; y?: number; max?: number }> = ({ color, at = 0, dur = 9, x = 960, y = 540, max = 1250 }) => {
  const f = useCurrentFrame();
  const r = mix(0, max, seg(f, at, dur, E.out));
  return <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", background: color }} />;
};

/** Reveals its children through a circle growing from (x, y): place the next scene on top of the previous one and overlap them by `dur` frames. */
export const IrisReveal: React.FC<{ x?: number; y?: number; dur?: number; max?: number; children: React.ReactNode }> = ({ x = 960, y = 540, dur = 12, max = 2300, children }) => {
  const f = useCurrentFrame();
  const r = mix(0, max, seg(f, 0, dur, E.inOut));
  return <AbsoluteFill style={{ clipPath: f >= dur ? undefined : `circle(${r}px at ${x}px ${y}px)` }}>{children}</AbsoluteFill>;
};

/** Each panel slides in as `slats` strips moving in alternating directions, one panel per `each` frames. */
export const SlatReveal: React.FC<{ panels: React.ReactNode[]; each: number; slats?: number; stagger?: number; dur?: number; width?: number; height?: number }> = ({ panels, each, slats = 8, stagger = 0.6, dur = 9, width = 1920, height = 1080 }) => {
  const f = useCurrentFrame();
  const w = width / slats;
  return (
    <AbsoluteFill>
      {panels.map((panel, idx) => {
        const at = idx * each;
        if (f < at) return null;
        return (
          <AbsoluteFill key={idx}>
            {Array.from({ length: slats }).map((_, i) => {
              const e = seg(f, at + i * stagger, dur, E.out);
              const dir = i % 2 ? 1 : -1;
              return (
                <div key={i} style={{ position: "absolute", left: i * w, top: 0, width: w + 1, height, overflow: "hidden", transform: `translateY(${(1 - e) * dir * height}px)` }}>
                  <div style={{ position: "absolute", left: -i * w, top: 0, width, height }}>{panel}</div>
                </div>
              );
            })}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

/* ── shape morph ── */

export type RadialShape = (theta: number) => number;

/** Radial distance from the origin to a polygon's edge (ray–segment intersection). */
export const polyR = (verts: [number, number][]): RadialShape => (th) => {
  const dx = Math.cos(th);
  const dy = Math.sin(th);
  let best = 1;
  let found = false;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const det = -dx * ey + ex * dy;
    if (Math.abs(det) < 1e-9) continue;
    const t = (-a[0] * ey + ex * a[1]) / det;
    const s = (dx * a[1] - dy * a[0]) / det;
    if (t > 0 && s >= -1e-6 && s <= 1 + 1e-6 && (!found || t < best)) {
      best = t;
      found = true;
    }
  }
  return best;
};

export const ngon = (n: number, r: number, rot = -Math.PI / 2, inner?: number): [number, number][] =>
  Array.from({ length: inner ? n * 2 : n }, (_, i) => {
    const rr = inner && i % 2 ? inner : r;
    const a = rot + (i / (inner ? n * 2 : n)) * Math.PI * 2;
    return [Math.cos(a) * rr, Math.sin(a) * rr];
  });

export const SHAPES = {
  circle: (() => 1) as RadialShape,
  square: polyR(ngon(4, 1.12, Math.PI / 4)),
  triangle: polyR(ngon(3, 1.2)),
  star: polyR(ngon(5, 1.2, -Math.PI / 2, 0.52)),
  hexagon: polyR(ngon(6, 1.08, 0)),
  blob: ((th) => 0.92 + 0.12 * Math.sin(3 * th + 0.5) + 0.08 * Math.sin(5 * th - 1) + 0.05 * Math.sin(7 * th)) as RadialShape,
};

export const morphPath = (a: RadialShape, b: RadialShape, e: number, R: number, samples = 240) =>
  Array.from({ length: samples }, (_, i) => {
    const th = (i / samples) * Math.PI * 2;
    const r = mix(a(th), b(th), e) * R;
    return `${i ? "L" : "M"}${(Math.cos(th) * r).toFixed(1)} ${(Math.sin(th) * r).toFixed(1)}`;
  }).join(" ") + "Z";

/** Which step of a beat-driven morph sequence frame `f` is in, and the eased blend toward the next shape. */
export const morphState = (f: number, steps: number, beat: number) => {
  const k = Math.min(steps - 2, Math.max(0, Math.floor(f / beat)));
  const e = E.inOut(clamp01((f - k * beat - beat * 0.2) / (beat * 0.66)));
  return { k, e };
};

/** Morphs through `shapes` one per beat, rotating `rotateStep`° each time, with outline ghost trails. */
export const ShapeMorph: React.FC<{
  shapes: RadialShape[];
  colors: string[];
  beat?: number;
  radius?: (f: number) => number;
  trails?: number;
  trailColor?: string;
  rotateStep?: number;
  x?: number;
  y?: number;
}> = ({ shapes, colors, beat = 15, radius = () => 300, trails = 5, trailColor = "#0A0A0B", rotateStep = 90, x = 960, y = 540 }) => {
  const f = useCurrentFrame();
  const rot = (t: number) => {
    const { k, e } = morphState(t, shapes.length, beat);
    return (k + e) * rotateStep;
  };
  const path = (t: number) => {
    const { k, e } = morphState(t, shapes.length, beat);
    return morphPath(shapes[k], shapes[k + 1], e, radius(t));
  };
  const { k, e } = morphState(f, shapes.length, beat);
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      {Array.from({ length: trails }, (_, i) => trails - i).map((g) => {
        const t = Math.max(0, f - g * 2);
        return <path key={g} d={path(t)} transform={`translate(${x} ${y}) rotate(${rot(t)})`} fill="none" stroke={trailColor} strokeOpacity={Math.max(0.02, 0.14 - g * 0.02)} strokeWidth={3} />;
      })}
      <path d={path(f)} transform={`translate(${x} ${y}) rotate(${rot(f)})`} fill={e > 0.5 ? colors[k + 1] : colors[k]} />
    </svg>
  );
};

/* ── kinetic words ── */

export type KineticVariant = "step" | "elastic" | "wave" | "strips" | "rise";

/**
 * One word, one typographic behaviour whose motion matches its meaning:
 * step = frame-by-frame reveal (timing), elastic = overshoot stretch (easing),
 * wave = sequential bounce (rhythm), strips = horizontal slices assemble (craft),
 * rise = letters rise out of a baseline mask (reveal).
 */
export const KineticWord: React.FC<{ text: string; variant: KineticVariant; color: string; size?: number; font?: string; weight?: number; at?: number }> = ({ text, variant, color, size = 280, font = '"SF Pro Display", -apple-system, "Helvetica Neue", sans-serif', weight = 900, at = 0 }) => {
  const f = useCurrentFrame() - at;
  const base: React.CSSProperties = { fontFamily: font, fontWeight: weight, fontSize: size, letterSpacing: "-0.035em", lineHeight: 1, color, display: "inline-block" };
  const letters = Array.from(text);
  if (variant === "step") {
    const n = Math.max(0, Math.min(letters.length, Math.floor(f / 2) + 1));
    return (
      <div style={base}>
        {text.slice(0, n)}
        <span style={{ opacity: 0 }}>{text.slice(n)}</span>
      </div>
    );
  }
  if (variant === "strips") {
    const strips = 6;
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <div style={{ ...base, visibility: "hidden" }}>{text}</div>
        {Array.from({ length: strips }).map((_, i) => {
          const e = seg(f, i * 1.2, 10, E.out);
          return (
            <div key={i} style={{ position: "absolute", inset: 0, clipPath: `inset(${(i / strips) * 100}% 0 ${100 - ((i + 1) / strips) * 100}% 0)`, transform: `translateX(${(1 - e) * (i % 2 ? 1 : -1) * size * 3}px)` }}>
              <div style={base}>{text}</div>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", overflow: variant === "rise" ? "hidden" : "visible", paddingBottom: variant === "rise" ? size * 0.08 : 0 }}>
      {letters.map((ch, i) => {
        let tf = "";
        if (variant === "elastic") {
          const e = ELASTIC(clamp01((f - i * 1.2) / 12));
          tf = `scaleX(${e}) scaleY(${mix(1.4, 1, e)})`;
        } else if (variant === "wave") {
          tf = `translateY(${Math.max(0, Math.sin((f - i * 1.6) * 0.55)) * -size * 0.21 * clamp01(f / 3)}px)`;
        } else {
          const e = seg(f, i * 2, 14, E.back);
          tf = `translateY(${(1 - e) * 110}%) skewY(${(1 - e) * 12}deg)`;
        }
        return (
          <span key={i} style={{ ...base, whiteSpace: "pre", transform: tf, transformOrigin: variant === "elastic" ? "0% 100%" : "50% 100%" }}>
            {ch}
          </span>
        );
      })}
    </div>
  );
};


/* ── headline & camera ── */

const hexRgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const lerpHex = (a: string, b: string, t: number) => {
  const [x, y] = [hexRgb(a), hexRgb(b)];
  return `rgb(${x.map((v, i) => Math.round(mix(v, y[i], t))).join(",")})`;
};

export type HeadlinePart = { t: string; tone?: "accent" | "muted" };

/**
 * Headline revealed character by character (works for Chinese): rise = overshoot up, elastic = stretch in,
 * slam = drop in from large and blurred. Accent parts get a per-character gradient from accent[0] to accent[1].
 */
export const KineticHeadline: React.FC<{
  parts: HeadlinePart[];
  variant?: "rise" | "elastic" | "slam";
  at?: number;
  hideAt?: number;
  size?: number;
  color?: string;
  muted?: string;
  accent?: [string, string];
  font?: string;
  weight?: number;
  align?: "center" | "flex-start";
}> = ({ parts, variant = "rise", at = 0, hideAt, size = 72, color = "#FAF9FC", muted = "rgba(250,249,252,0.6)", accent = ["#7C4DFF", "#B05CF5"], font = '"PingFang SC", "SF Pro Display", -apple-system, sans-serif', weight = 700, align = "center" }) => {
  const f = useCurrentFrame();
  const chars = parts.flatMap((p) => Array.from(p.t).map((c) => ({ c, tone: p.tone })));
  const nAccent = chars.filter((x) => x.tone === "accent").length;
  let ai = 0;
  return (
    <div style={{ display: "flex", justifyContent: align, fontFamily: font, fontWeight: weight, fontSize: size, letterSpacing: "-0.01em", lineHeight: 1.15 }}>
      {chars.map((ch, i) => {
        const t0 = at + i * (variant === "slam" ? 0.8 : 1.1);
        const hide = hideAt === undefined ? 0 : seg(f, hideAt + i * 0.5, 8, E.in2);
        let tf = "";
        let op = 1;
        let blur = 0;
        if (variant === "elastic") {
          const e = ELASTIC(clamp01((f - t0) / 14));
          tf = `scaleX(${e}) scaleY(${mix(1.5, 1, clamp01(e))})`;
          op = clamp01((f - t0) / 3);
        } else if (variant === "slam") {
          const e = seg(f, t0, 9, E.out);
          tf = `scale(${mix(2.2, 1, e)})`;
          blur = (1 - e) * 14;
          op = e;
        } else {
          const e = seg(f, t0, 14, E.back);
          tf = `translateY(${(1 - e) * 70}%) rotate(${(1 - e) * 10}deg)`;
          op = clamp01(e * 1.5);
          blur = (1 - clamp01(e)) * 8;
        }
        const c = ch.tone === "accent" ? lerpHex(accent[0], accent[1], nAccent > 1 ? ai++ / (nAccent - 1) : 0) : ch.tone === "muted" ? muted : color;
        return (
          <span key={i} style={{ display: "inline-block", whiteSpace: "pre", color: c, transform: `${tf} translateY(${hide * -60}px)`, transformOrigin: "50% 90%", opacity: op * (1 - hide), filter: blur > 0.3 ? `blur(${blur}px)` : undefined }}>
            {ch.c}
          </span>
        );
      })}
    </div>
  );
};

/** 2.5D camera for a whole scene: slow drift and push, optional whip-pan in/out. Wrap in CameraMotionBlur for the whip. */
export const Stage: React.FC<{ len: number; whipIn?: boolean; whipOut?: boolean; tilt?: number; background?: string; children: React.ReactNode }> = ({ len, whipIn, whipOut, tilt = 1, background, children }) => {
  const f = useCurrentFrame();
  const i = whipIn ? 1 - seg(f, 0, 10, E.out) : 0;
  const o = whipOut ? seg(f, len - 9, 9, E.in2) : 0;
  const ry = -i * 24 + o * 24 + Math.sin(f / 45) * 2.2 * tilt;
  const rx = Math.cos(f / 55) * 1.5 * tilt;
  return (
    <AbsoluteFill style={{ perspective: 1800, background }}>
      <AbsoluteFill style={{ transform: `translateX(${i * 1500 - o * 1500}px) rotateY(${ry}deg) rotateX(${rx}deg) scale(${1.04 + 0.035 * clamp01(f / len)})` }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Subtle whole-frame bump every `every` frames (e.g. two beats); apply as scale on the root. */
export const beatPulse = (f: number, every: number, amount = 0.008) => 1 + amount * Math.exp(-(f % every) / 4);

/* ── overlays ── */

/** Crop marks, section label, timecode and progress; `difference` blending keeps it legible on any background. */
export const Hud: React.FC<{ labels: [number, string][]; total: number; title: string; fps?: number }> = ({ labels, total, title, fps = 30 }) => {
  const f = useCurrentFrame();
  const label = [...labels].reverse().find(([at]) => f >= at)?.[1] ?? "";
  const tc = `00:00:${String(Math.floor(f / fps)).padStart(2, "0")}:${String(f % fps).padStart(2, "0")}`;
  const c = "2px solid #fff";
  const mark = (s: React.CSSProperties) => <div style={{ position: "absolute", width: 34, height: 34, ...s }} />;
  return (
    <AbsoluteFill style={{ mixBlendMode: "difference", color: "#fff", fontFamily: '"SF Mono", Menlo, monospace', fontSize: 20, letterSpacing: "0.18em", pointerEvents: "none" }}>
      {mark({ left: 48, top: 48, borderLeft: c, borderTop: c })}
      {mark({ right: 48, top: 48, borderRight: c, borderTop: c })}
      {mark({ left: 48, bottom: 48, borderLeft: c, borderBottom: c })}
      {mark({ right: 48, bottom: 48, borderRight: c, borderBottom: c })}
      <div style={{ position: "absolute", left: 100, top: 58 }}>{label}</div>
      <div style={{ position: "absolute", right: 100, top: 58 }}>{tc}</div>
      <div style={{ position: "absolute", right: 100, bottom: 58 }}>{title}</div>
      <div style={{ position: "absolute", left: 100, bottom: 64, width: 360, height: 2, background: "rgba(255,255,255,0.3)" }}>
        <div style={{ width: `${(f / total) * 100}%`, height: 2, background: "#fff" }} />
      </div>
    </AbsoluteFill>
  );
};

export const FilmGrain: React.FC<{ opacity?: number }> = ({ opacity = 0.09 }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity, mixBlendMode: "overlay" }}>
      <svg width={1920} height={1080}>
        <filter id="film-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={f % 24} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width={1920} height={1080} filter="url(#film-grain)" />
      </svg>
    </AbsoluteFill>
  );
};
