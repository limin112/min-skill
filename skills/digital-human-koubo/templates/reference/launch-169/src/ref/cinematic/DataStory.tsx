import React from "react";
import { clamp01, E, mix } from "./motion";
import { type SpringCfg, step } from "./spring";

/**
 * Data storytelling: bar-chart race, line reveal with a live value tag, donut build.
 * All values are pure functions of the frame; every change rides a closed-form spring.
 */
const hz = (x: number) => 2 * Math.PI * x;
const RANK: SpringCfg = { w: hz(2.2), z: 0.82 };
const GROW: SpringCfg = { w: hz(1.8), z: 0.95 };
const sprung = (f: number, fps: number, keys: [number, number][], c: SpringCfg) => {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * step((f - keys[i][0]) / fps, c);
  return v;
};
const fmt = (v: number, decimals = 0, prefix = "", suffix = "") => `${prefix}${v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;

export type RaceRow = { label: string; color: string; values: number[]; icon?: React.ReactNode };
/**
 * Bar chart race. values[k] is the row's value at step k; step k starts at frame start + k * stepFrames.
 * Rows re-rank on a spring, bars grow on a spring, numbers count along with the bar.
 */
export const BarRace: React.FC<{ f: number; rows: RaceRow[]; start?: number; stepFrames: number; stepLabels?: string[]; top?: number; width?: number; rowH?: number; gap?: number; fps?: number; font?: string; text?: string; muted?: string; decimals?: number; prefix?: string; suffix?: string }> = ({ f, rows, start = 0, stepFrames, stepLabels, top = 8, width = 1400, rowH = 64, gap = 16, fps = 30, font = '"SF Pro Display", "PingFang SC", sans-serif', text = "#fff", muted = "rgba(255,255,255,0.5)", decimals = 0, prefix = "", suffix = "" }) => {
  const steps = rows[0].values.length;
  const at = (k: number) => start + k * stepFrames;
  const rankAt = (k: number) => {
    const order = rows.map((r, i) => ({ i, v: r.values[k] })).sort((a, b) => b.v - a.v);
    const rank: number[] = [];
    order.forEach((o, j) => (rank[o.i] = j));
    return rank;
  };
  const ranks = Array.from({ length: steps }, (_, k) => rankAt(k));
  const maxAt = Array.from({ length: steps }, (_, k) => Math.max(...rows.map((r) => r.values[k])));
  const max = sprung(f, fps, maxAt.map((m, k) => [at(k), m]), GROW);
  const cur = Math.max(0, Math.min(steps - 1, Math.floor((f - start) / stepFrames)));
  const labelW = 260;
  const barMax = width - labelW - 200;
  return (
    <div style={{ position: "relative", width, height: top * (rowH + gap) + 60, fontFamily: font }}>
      {rows.map((r, i) => {
        const y = sprung(f, fps, ranks.map((rk, k) => [at(k), rk[i]]), RANK) * (rowH + gap);
        const v = sprung(f, fps, r.values.map((val, k) => [at(k), val]), GROW);
        const grow = E.out(clamp01((f - start) / 18));
        const w = Math.max(6, (v / Math.max(1e-6, max)) * barMax * grow);
        const visible = clamp01(top - y / (rowH + gap));
        return (
          <div key={r.label} style={{ position: "absolute", left: 0, top: y, height: rowH, width, display: "flex", alignItems: "center", opacity: visible }}>
            <div style={{ width: labelW, paddingRight: 20, boxSizing: "border-box", textAlign: "right", fontSize: rowH * 0.42, fontWeight: 700, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</div>
            <div style={{ position: "relative", width: w, height: rowH, borderRadius: rowH * 0.18, background: r.color, boxShadow: `0 0 30px ${r.color}55`, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 14, boxSizing: "border-box" }}>
              {r.icon}
            </div>
            <div style={{ marginLeft: 16, fontSize: rowH * 0.46, fontWeight: 800, color: text, fontVariantNumeric: "tabular-nums" }}>{fmt(v * grow, decimals, prefix, suffix)}</div>
          </div>
        );
      })}
      {stepLabels && (
        <div style={{ position: "absolute", right: 0, bottom: 0, fontSize: 96, fontWeight: 900, color: muted, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" }}>{stepLabels[cur]}</div>
      )}
    </div>
  );
};

export type Series = { points: number[]; color: string; label?: string };
/**
 * Line chart that draws itself; a glowing head dot carries a live value tag.
 * The x-range reveals over `dur` frames from `start`.
 */
export const LineReveal: React.FC<{ f: number; series: Series[]; start?: number; dur: number; width?: number; height?: number; min?: number; max?: number; xLabels?: string[]; grid?: number; font?: string; text?: string; muted?: string; decimals?: number; prefix?: string; suffix?: string; area?: boolean }> = ({ f, series, start = 0, dur, width = 1400, height = 600, min, max, xLabels, grid = 4, font = '"SF Pro Display", "PingFang SC", sans-serif', text = "#fff", muted = "rgba(255,255,255,0.35)", decimals = 0, prefix = "", suffix = "", area = true }) => {
  const all = series.flatMap((s) => s.points);
  const lo = min ?? Math.min(...all);
  const hi = max ?? Math.max(...all);
  const pad = { l: 20, r: 180, t: 40, b: 60 };
  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;
  const n = series[0].points.length;
  const px = (i: number) => pad.l + (i / (n - 1)) * W;
  const py = (v: number) => pad.t + H - ((v - lo) / (hi - lo || 1)) * H;
  const u = E.inOut(clamp01((f - start) / dur));
  const head = u * (n - 1);
  const valueAt = (pts: number[], x: number) => {
    const a = Math.floor(x);
    const b = Math.min(pts.length - 1, a + 1);
    return mix(pts[a], pts[b], x - a);
  };
  // smooth path via Catmull-Rom → cubic Bezier
  const path = (pts: number[]) => {
    const P = pts.map((v, i) => [px(i), py(v)]);
    let d = `M ${P[0][0]} ${P[0][1]}`;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)];
      const p1 = P[i];
      const p2 = P[i + 1];
      const p3 = P[Math.min(P.length - 1, i + 2)];
      d += ` C ${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6}, ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  };
  const clipW = pad.l + (head / (n - 1)) * W;
  const id = `lr-${series.map((s) => s.color).join("").replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={width} height={height} style={{ overflow: "visible", fontFamily: font }}>
      <defs>
        <clipPath id={`${id}-c`}>
          <rect x={0} y={0} width={clipW} height={height} />
        </clipPath>
        {series.map((s, i) => (
          <linearGradient key={i} id={`${id}-g${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      {Array.from({ length: grid + 1 }, (_, i) => {
        const y = pad.t + (H * i) / grid;
        const o = clamp01((f - start + 10 - i * 2) / 8);
        return <line key={i} x1={pad.l} x2={pad.l + W * o} y1={y} y2={y} stroke={muted} strokeWidth={1} strokeDasharray="4 8" />;
      })}
      {xLabels?.map((l, i) => (
        <text key={l} x={px((i / (xLabels.length - 1)) * (n - 1))} y={height - 18} fill={muted} fontSize={22} textAnchor="middle" opacity={head >= (i / (xLabels.length - 1)) * (n - 1) - 0.3 ? 1 : 0.3}>
          {l}
        </text>
      ))}
      <g clipPath={`url(#${id}-c)`}>
        {series.map((s, i) => (
          <g key={i}>
            {area && <path d={`${path(s.points)} L ${px(n - 1)} ${pad.t + H} L ${px(0)} ${pad.t + H} Z`} fill={`url(#${id}-g${i})`} />}
            <path d={path(s.points)} fill="none" stroke={s.color} strokeWidth={6} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 10px ${s.color})` }} />
          </g>
        ))}
      </g>
      {u > 0.001 &&
        series.map((s, i) => {
          const v = valueAt(s.points, head);
          const x = px(head);
          const y = py(v);
          return (
            <g key={`h${i}`}>
              <circle cx={x} cy={y} r={14} fill={s.color} opacity={0.3} />
              <circle cx={x} cy={y} r={8} fill="#fff" />
              <g transform={`translate(${x + 22} ${y - 26})`}>
                <rect width={170} height={52} rx={12} fill="rgba(12,12,14,0.85)" stroke={s.color} strokeWidth={2} />
                <text x={16} y={35} fill="#fff" fontSize={28} fontWeight={800} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {fmt(v, decimals, prefix, suffix)}
                </text>
              </g>
              {s.label && (
                <text x={x + 22} y={y + 58} fill={s.color} fontSize={22} fontWeight={700}>
                  {s.label}
                </text>
              )}
            </g>
          );
        })}
    </svg>
  );
};

export type Slice = { value: number; color: string; label: string };
/** Donut that builds slice by slice, each slice on its own spring; center shows the running total. */
export const DonutBuild: React.FC<{ f: number; slices: Slice[]; start?: number; each?: number; size?: number; thick?: number; fps?: number; font?: string; text?: string; center?: (total: number) => React.ReactNode; gapDeg?: number }> = ({ f, slices, start = 0, each = 8, size = 520, thick = 70, fps = 30, font = '"SF Pro Display", "PingFang SC", sans-serif', text = "#fff", center, gapDeg = 1.5 }) => {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const R = size / 2 - thick / 2;
  const C = 2 * Math.PI * R;
  let acc = 0;
  let shown = 0;
  return (
    <div style={{ position: "relative", width: size, height: size, fontFamily: font }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={thick} />
        {slices.map((s, i) => {
          const k = Math.min(1.02, step((f - start - i * each) / fps, GROW));
          const frac = s.value / total;
          const len = Math.max(0, frac * C * k - (gapDeg / 360) * C);
          const rot = (acc / total) * 360 - 90;
          acc += s.value;
          shown += s.value * clamp01(k);
          return <circle key={s.label} cx={size / 2} cy={size / 2} r={R} fill="none" stroke={s.color} strokeWidth={thick} strokeDasharray={`${len} ${C}`} transform={`rotate(${rot} ${size / 2} ${size / 2})`} />;
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: text, fontWeight: 900, fontSize: size * 0.16, fontVariantNumeric: "tabular-nums" }}>{center ? center(shown) : Math.round(shown).toLocaleString("en-US")}</div>
    </div>
  );
};
