import React from "react";
import { AbsoluteFill, random } from "remotion";
import { clamp01, E, mix } from "./motion";

/**
 * Liquid / metaball ("gooey") looks. Everything inside <Goo> is blurred then alpha-thresholded,
 * so shapes that touch melt into one surface. Pure SVG filter → deterministic per frame.
 * Caveats: a filter flattens 3D, so don't put <Goo> inside preserve-3d; keep blur ≈ 0.4–0.6 × blob radius.
 */
export const GooDefs: React.FC<{ id: string; blur?: number; sharp?: number }> = ({ id, blur = 18, sharp = 22 }) => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <defs>
      <filter id={id} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="b" />
        <feColorMatrix in="b" mode="matrix" values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${sharp} -${sharp * 0.45}`} result="g" />
        <feComposite in="SourceGraphic" in2="g" operator="atop" />
      </filter>
    </defs>
  </svg>
);
export const Goo: React.FC<{ id: string; blur?: number; sharp?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ id, blur, sharp, style, children }) => (
  <AbsoluteFill style={style}>
    <GooDefs id={id} blur={blur} sharp={sharp} />
    <AbsoluteFill style={{ filter: `url(#${id})` }}>{children}</AbsoluteFill>
  </AbsoluteFill>
);

export type Blob = { x: number; y: number; r: number; color?: string };
/** Draw blobs as plain circles (put them inside <Goo>). */
/** `screenFill` paints every blob with one frame-sized background (e.g. CHROME) so merged blobs read as one surface. */
export const Blobs: React.FC<{ blobs: Blob[]; color?: string; screenFill?: string; w?: number; h?: number }> = ({ blobs, color = "#fff", screenFill, w = 1920, h = 1080 }) => (
  <>
    {blobs.map((b, i) =>
      b.r <= 0.5 ? null : (
        <div
          key={i}
          style={{
            position: "absolute",
            left: b.x - b.r,
            top: b.y - b.r,
            width: b.r * 2,
            height: b.r * 2,
            borderRadius: "50%",
            background: screenFill ?? b.color ?? color,
            backgroundSize: screenFill ? `${w}px ${h}px` : undefined,
            backgroundPosition: screenFill ? `${-(b.x - b.r)}px ${-(b.y - b.r)}px` : undefined,
          }}
        />
      ),
    )}
  </>
);

/** Interpolate two blob layouts with per-blob stagger: the "split / merge" move. */
export const morphBlobs = (a: Blob[], b: Blob[], t: number, stagger = 0.35, ease = E.inOut): Blob[] =>
  a.map((p, i) => {
    const q = b[i % b.length];
    const d = a.length > 1 ? (i / (a.length - 1)) * stagger : 0;
    const u = ease(clamp01((t - d) / (1 - stagger)));
    // bulge mid-flight so blobs stretch into necks instead of sliding
    const bulge = Math.sin(u * Math.PI) * 0.15;
    return { x: mix(p.x, q.x, u), y: mix(p.y, q.y, u), r: mix(p.r, q.r, u) * (1 + bulge), color: q.color ?? p.color };
  });

/** Layouts for morphBlobs. */
export const layouts = {
  row: (n: number, cx: number, cy: number, gap: number, r: number): Blob[] => Array.from({ length: n }, (_, i) => ({ x: cx + (i - (n - 1) / 2) * gap, y: cy, r })),
  ring: (n: number, cx: number, cy: number, R: number, r: number, rot = 0): Blob[] => Array.from({ length: n }, (_, i) => ({ x: cx + Math.cos((i / n) * Math.PI * 2 + rot) * R, y: cy + Math.sin((i / n) * Math.PI * 2 + rot) * R, r })),
  /** all blobs piled into one drop (radius grows so area is roughly kept) */
  merge: (n: number, cx: number, cy: number, R: number): Blob[] => Array.from({ length: n }, (_, i) => ({ x: cx + Math.cos(i * 2.4) * R * 0.18, y: cy + Math.sin(i * 2.4) * R * 0.18, r: R * (0.55 + (i % 3) * 0.12) })),
  scatter: (n: number, w: number, h: number, rMin: number, rMax: number, seed = "sc"): Blob[] => Array.from({ length: n }, (_, i) => ({ x: random(`${seed}x${i}`) * w, y: random(`${seed}y${i}`) * h, r: mix(rMin, rMax, random(`${seed}r${i}`)) })),
};

/** Lava-lamp field: slow orbiting blobs, good as a live background. */
export const LavaField: React.FC<{ f: number; n?: number; colors?: string[]; w?: number; h?: number; speed?: number; seed?: string; rMin?: number; rMax?: number }> = ({ f, n = 9, colors = ["#fff"], w = 1920, h = 1080, speed = 1, seed = "lava", rMin = 90, rMax = 220 }) => (
  <Blobs
    blobs={Array.from({ length: n }, (_, i) => {
      const r = (k: string) => random(`${seed}${k}${i}`);
      const t = (f / 30) * speed;
      return {
        x: w * (0.15 + r("x") * 0.7) + Math.sin(t * (0.3 + r("a") * 0.5) + r("p") * 6) * w * 0.18,
        y: h * (0.15 + r("y") * 0.7) + Math.cos(t * (0.25 + r("b") * 0.45) + r("q") * 6) * h * 0.22,
        r: mix(rMin, rMax, r("r")) * (1 + Math.sin(t * 0.8 + i) * 0.08),
        color: colors[i % colors.length],
      };
    })}
  />
);

/** Liquid fill transition: drips grow from an edge and swallow the frame. p: 0 → 1. */
export const LiquidWipe: React.FC<{ p: number; color: string; from?: "top" | "bottom"; drips?: number; seed?: string; id?: string }> = ({ p, color, from = "top", drips = 14, seed = "drip", id = "goo-wipe" }) => {
  if (p <= 0) return null;
  const W = 1920;
  const H = 1080;
  const blobs: Blob[] = [];
  for (let i = 0; i < drips; i++) {
    const r0 = random(`${seed}r${i}`);
    const lag = random(`${seed}l${i}`) * 0.35;
    const u = E.in2(clamp01((p - lag) / (1 - lag)));
    const x = ((i + 0.5) / drips) * W + (r0 - 0.5) * 60;
    const len = u * H * 1.25;
    const r = 70 + r0 * 60;
    for (let k = 0; k <= 4; k++) {
      const y = (len * k) / 4;
      blobs.push({ x, y: from === "top" ? y - r * 0.5 : H - y + r * 0.5, r: r * (1 + u * 1.6) * (1 - k * 0.08) });
    }
  }
  const band = E.in2(clamp01(p * 1.2)) * H * 0.35;
  return (
    <Goo id={id} blur={26} sharp={24}>
      <div style={{ position: "absolute", left: 0, right: 0, [from]: 0, height: band + 40, background: color }} />
      <Blobs blobs={blobs} color={color} />
      {p > 0.92 && <AbsoluteFill style={{ background: color, opacity: clamp01((p - 0.92) / 0.08) }} />}
    </Goo>
  );
};

/** Text that condenses out of liquid: blobs on each glyph melt into the letters. p: 0 → 1. */
export const LiquidText: React.FC<{ p: number; text: string; size?: number; color?: string; font?: string; weight?: number; id?: string; letterGap?: number }> = ({ p, text, size = 220, color = "#fff", font = '"SF Pro Display", "PingFang SC", sans-serif', weight = 900, id = "goo-text", letterGap = 0.62 }) => {
  const chars = Array.from(text);
  const w = chars.length * size * letterGap;
  const blobP = 1 - E.out(clamp01((p - 0.35) / 0.65));
  const textP = E.inOut(clamp01((p - 0.2) / 0.6));
  // the goo pass gives the melt; a crisp copy takes over at the end so the final letters are sharp
  const crisp = E.inOut(clamp01((p - 0.72) / 0.28));
  return (
    <AbsoluteFill>
    <AbsoluteFill style={{ opacity: 1 - crisp }}>
    <Goo id={id} blur={size * 0.09} sharp={20}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width: w, height: size * 1.2 }}>
          {chars.map((_, i) => {
            const cx = (i + 0.5) * size * letterGap;
            const k = clamp01(p * 2.4 - i * 0.12);
            const r = size * 0.36 * E.back(k) * (0.35 + blobP * 0.65);
            return <div key={i} style={{ position: "absolute", left: cx - r, top: size * 0.6 - r + (1 - k) * size * 0.8, width: r * 2, height: r * 2, borderRadius: "50%", background: color, opacity: blobP > 0.02 ? 1 : 0 }} />;
          })}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font, fontWeight: weight, fontSize: size, color, letterSpacing: "-0.02em", opacity: textP, whiteSpace: "nowrap" }}>{text}</div>
        </div>
      </AbsoluteFill>
    </Goo>
    </AbsoluteFill>
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: crisp }}>
      <div style={{ fontFamily: font, fontWeight: weight, fontSize: size, color, letterSpacing: "-0.02em", whiteSpace: "nowrap", filter: crisp < 0.99 ? `blur(${(1 - crisp) * 6}px)` : undefined }}>{text}</div>
    </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Chrome / liquid-metal shading laid over a goo layer (use as the goo layer's children background). */
export const CHROME = "linear-gradient(160deg, #f7f9fb 0%, #9aa3ad 22%, #eef2f5 38%, #5b636c 55%, #d9dee3 72%, #7c858f 100%)";
