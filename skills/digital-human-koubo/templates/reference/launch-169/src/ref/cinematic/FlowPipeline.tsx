import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { useBrand, V } from "./brand";
import { IconTile, type LucideIcon } from "./IconTile";
import type { Cue } from "./sfx";
import { E, clamp01, mix, seg } from "./motion";

export type FlowNode = { label: string; sub: string; icon: LucideIcon };

const LEAD = 24;
const STEP = 16;

export const flowFrames = (n: number) => LEAD + n * STEP + 44;

export const flowCues = (n: number, offset: number): Cue[] => [
  { at: offset, name: "swish-2", volume: 0.4 },
  ...Array.from({ length: n }, (_, i) => ({ at: offset + LEAD + i * STEP, name: "done", volume: 0.45 })),
  { at: offset + LEAD + n * STEP + 4, name: "pop", volume: 0.5 },
];

/**
 * Business workflow: nodes light up in order while a pulse travels along the connector,
 * then a foundation bar (knowledge base, data layer…) lights under all of them.
 */
export const FlowPipeline: React.FC<{ title: string; kicker?: string; nodes: FlowNode[]; base?: string }> = ({ title, kicker, nodes, base }) => {
  const f = useCurrentFrame();
  const { width, durationInFrames } = useVideoConfig();
  const b = useBrand();
  const n = nodes.length;
  const span = Math.min(1500, width - 300);
  const gap = span / (n - 1);
  const left = (width - span) / 2;
  const cy = 520;
  const pulse = clamp01((f - LEAD) / ((n - 1) * STEP));
  const baseP = seg(f, LEAD + n * STEP, 16, E.out);
  const push = mix(1.08, 1, seg(f, 0, durationInFrames, E.sine));
  const fade = seg(f, 0, 6, E.linear) * (1 - seg(f, durationInFrames - 6, 6, E.linear));
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 60%, ${b.accent2}1f, transparent 65%), ${b.ink}`, opacity: fade, transform: `scale(${push})` }}>
      <div style={{ position: "absolute", top: 120, width: "100%", textAlign: "center" }}>
        {kicker && <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 20, letterSpacing: "0.1em", color: V.accent, opacity: seg(f, 2, 8) }}>{kicker}</div>}
        <div style={{ marginTop: 22, fontFamily: V.body, fontWeight: 700, fontSize: 56, color: "#F5F7FA", opacity: seg(f, 4, 10), transform: `translateY(${(1 - seg(f, 4, 16, E.out)) * 20}px)` }}>{title}</div>
      </div>
      <svg width={width} height={1080} style={{ position: "absolute", inset: 0 }}>
        <line x1={left} y1={cy} x2={left + span} y2={cy} stroke="rgba(245,247,250,0.12)" strokeWidth={4} strokeDasharray="10 12" />
        <line x1={left} y1={cy} x2={left + span * pulse} y2={cy} style={{ stroke: b.accent }} strokeWidth={4} />
        {f >= LEAD && pulse < 1 && <circle cx={left + span * pulse} cy={cy} r={12} style={{ fill: b.accent, filter: `drop-shadow(0 0 16px ${b.accent})` }} />}
      </svg>
      {nodes.map((nd, i) => {
        const at = LEAD + i * STEP;
        const on = seg(f, at, 10, E.back);
        const x = left + i * gap;
        return (
          <div key={nd.label} style={{ position: "absolute", left: x - 150, top: cy - 70, width: 300, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ transform: `scale(${mix(0.88, 1, on)})` }}>
              <IconTile icon={nd.icon} size={140} on={clamp01(on)} />
            </div>
            <div style={{ marginTop: 26, fontFamily: V.body, fontWeight: 700, fontSize: 38, color: on > 0.05 ? "#F5F7FA" : "rgba(245,247,250,0.35)" }}>{nd.label}</div>
            <div style={{ marginTop: 10, fontFamily: V.body, fontSize: 22, lineHeight: 1.4, textAlign: "center", whiteSpace: "pre-line", color: "rgba(245,247,250,0.6)", opacity: clamp01(on) }}>{nd.sub}</div>
          </div>
        );
      })}
      {base && (
        <div
          style={{
            position: "absolute",
            left,
            top: cy + 250,
            width: span,
            height: 74,
            borderRadius: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: V.body,
            fontWeight: 600,
            fontSize: 28,
            color: "#F5F7FA",
            background: `linear-gradient(90deg, ${b.accent2}55, ${b.accent}55)`,
            border: `1px solid ${b.accent}88`,
            opacity: baseP,
            transform: `scaleX(${mix(0.3, 1, baseP)})`,
          }}
        >
          {base}
        </div>
      )}
    </AbsoluteFill>
  );
};
