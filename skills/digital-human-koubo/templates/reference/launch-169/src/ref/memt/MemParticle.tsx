import React, { useLayoutEffect, useMemo, useRef } from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { E, clamp01 } from "../cinematic/motion";

const W = 1920;
const H = 1080;
const COUNT = 6500;
const CX = W / 2;
const CY = H / 2;
const DEFAULT_COLORS = ["#D7FF3B", "#FFFFFF", "#2B59FF", "#D7FF3B", "#FF3B2F"];
const DEFAULT_FONT = '"SF Pro Display", "PingFang SC", -apple-system, "Helvetica Neue", sans-serif';

const sampleText = (text: string, size: number, font: string) => {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `900 ${size}px ${font}`;
  g.fillText(text, CX, CY);
  const d = g.getImageData(0, 0, W, H).data;
  const pts: [number, number][] = [];
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) if (d[(y * W + x) * 4 + 3] > 128) pts.push([x, y]);
  return pts;
};

type P = { a: number; r: number; w: number; d: number; tx: number; ty: number; sp: number; c: string; s: number };

/** Particles swirl, converge into `text`, hold, then burst outward with trails (~75 frames). Needs ~6000+ particles for large type. */
export const MemParticle: React.FC<{ text: string; size?: number; colors?: string[]; font?: string; count?: number; background?: string; hold?: number }> = ({ text, size = 250, colors = DEFAULT_COLORS, font = DEFAULT_FONT, count = COUNT, background = "transparent", hold = 0 }) => {
  const f = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);
  const parts = useMemo<P[]>(() => {
    const pts = sampleText(text, size, font);
    return Array.from({ length: count }, (_, i) => {
      const tp = pts[Math.floor(random(`t${i}`) * pts.length)] ?? [CX, CY];
      return {
        a: random(`a${i}`) * Math.PI * 2,
        r: 260 + random(`r${i}`) * 700,
        w: 0.03 + random(`w${i}`) * 0.05,
        d: random(`d${i}`) * 10,
        tx: tp[0],
        ty: tp[1],
        sp: 18 + random(`s${i}`) * 50,
        c: colors[i % colors.length],
        s: 2.2 + random(`z${i}`) * 2.6,
      };
    });
  }, [text, size, font, count, colors]);

  useLayoutEffect(() => {
    const g = ref.current?.getContext("2d");
    if (!g) return;
    const pos = (p: P, t: number): [number, number] => {
      const ang = p.a + p.w * t * 2.2;
      const rr = p.r * (1 - 0.35 * clamp01(t / 40));
      const sx = CX + Math.cos(ang) * rr;
      const sy = CY + Math.sin(ang) * rr * 0.62;
      const k = E.inOut(clamp01((t - 22 - p.d) / 20));
      let x = sx + (p.tx - sx) * k;
      let y = sy + (p.ty - sy) * k;
      if (t > 50) {
        x += Math.sin(t * 0.4 + p.a * 5) * 0.8;
        y += Math.cos(t * 0.37 + p.a * 3) * 0.8;
      }
      if (t > 60 + hold) {
        const u = t - 60 - hold;
        const dx = p.tx - CX + (random(`ex${p.a}`) - 0.5) * 200;
        const dy = p.ty - CY + (random(`ey${p.a}`) - 0.5) * 200;
        const len = Math.hypot(dx, dy) || 1;
        const dist = p.sp * Math.pow(u, 1.35);
        x += (dx / len) * dist;
        y += (dy / len) * dist;
      }
      return [x, y];
    };
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = "lighter";
    const fade = 1 - clamp01((f - 62 - hold) / 13);
    for (const p of parts) {
      const [x, y] = pos(p, f);
      const [px, py] = pos(p, f - 1.6);
      g.strokeStyle = p.c;
      g.globalAlpha = 0.95 * fade;
      g.lineWidth = p.s;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(x + 0.01, y);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }, [f, parts]);

  return (
    <AbsoluteFill style={{ background }}>
      <canvas ref={ref} width={W} height={H} style={{ width: W, height: H }} />
    </AbsoluteFill>
  );
};
