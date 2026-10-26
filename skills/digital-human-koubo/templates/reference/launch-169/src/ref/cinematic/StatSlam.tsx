import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { useBrand, V } from "./brand";
import type { Cue } from "./sfx";
import { E, clamp01, mix, seg } from "./motion";

export type Stat = { value: number; prefix?: string; suffix?: string; label: string; decimals?: number };

/** Length for `n` stats at one per `beat`, with a lead-in beat and a two-beat hold. */
export const statSlamFrames = (n: number, beat: number) => Math.round(beat * (n + 3));

export const statSlamCues = (n: number, beat: number, offset: number): Cue[] =>
  Array.from({ length: n }, (_, i) => ({ at: Math.round(offset + beat * (i + 1)), name: `slam-${(i % 3) + 1}`, volume: 0.5 }));

/** Big numbers land one per beat, count up and shake the frame; all stay on screen as a row. */
export const StatSlam: React.FC<{ stats: Stat[]; beat: number; title?: string }> = ({ stats, beat, title }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const b = useBrand();
  const hits = stats.map((_, i) => beat * (i + 1));
  const lastHit = Math.max(...hits.filter((h) => h <= f), -100);
  const shake = Math.max(0, 1 - (f - lastHit) / 6);
  const sx = Math.sin(f * 7.3) * 10 * shake;
  const sy = Math.cos(f * 5.1) * 8 * shake;
  const fade = seg(f, 0, 5, E.linear) * (1 - seg(f, durationInFrames - 6, 6, E.linear));
  return (
    <AbsoluteFill style={{ background: b.ink, opacity: fade, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `linear-gradient(transparent 0 49.5%, ${b.accent}10 50%, transparent 50.5%)`, backgroundSize: "100% 12px" }} />
      {title && (
        <div style={{ position: "absolute", top: 110, width: "100%", textAlign: "center", fontFamily: "'Press Start 2P', monospace", fontSize: 24, letterSpacing: "0.1em", color: V.accent, opacity: seg(f, 2, 8) }}>
          {title}
        </div>
      )}
      <AbsoluteFill style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 0, transform: `translate(${sx}px, ${sy}px)` }}>
        {stats.map((s, i) => {
          const local = f - hits[i];
          const on = local >= 0;
          const land = seg(local, 0, 8, E.out);
          const count = seg(local, 0, beat * 1.4, E.out);
          const flash = on ? Math.max(0, 1 - local / 10) : 0;
          const v = (s.value * count).toFixed(s.decimals ?? 0);
          return (
            <div
              key={s.label}
              style={{
                width: 430,
                height: 420,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                borderLeft: i === 0 ? "none" : "1px solid rgba(245,247,250,0.1)",
                background: `color-mix(in srgb, ${b.accent} ${18 * flash}%, transparent)`,
                opacity: on ? 1 : 0.12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  transform: `scale(${on ? mix(2.2, 1, land) : 0.9})`,
                  filter: `blur(${on ? (1 - land) * 6 : 0}px)`,
                  color: "#F5F7FA",
                }}
              >
                {s.prefix && <span style={{ fontFamily: V.body, fontWeight: 800, fontSize: 60 }}>{s.prefix}</span>}
                <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 84, color: i % 2 ? V.accent2 : V.accent, fontVariantNumeric: "tabular-nums" }}>{on ? v : "0"}</span>
                {s.suffix && <span style={{ fontFamily: V.body, fontWeight: 800, fontSize: 64, marginLeft: 6 }}>{s.suffix}</span>}
              </div>
              <div style={{ marginTop: 34, fontFamily: V.body, fontWeight: 600, fontSize: 30, color: "rgba(245,247,250,0.75)", opacity: clamp01(local / 6) }}>{s.label}</div>
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
