import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { useBrand, V } from "./brand";
import type { Cue } from "./sfx";
import { E, clamp01, mix, seg, track } from "./motion";

export type Repo = { name: string; desc: string; stars: number; lang: string; langColor: string };

const STEP = 7;
const CARD_W = 520;

export const repoStackFrames = (n: number) => 30 + n * STEP + 70;

export const repoStackCues = (n: number, offset: number): Cue[] => [
  { at: offset, name: "whoosh", volume: 0.45 },
  ...Array.from({ length: n }, (_, i) => ({ at: offset + 20 + i * STEP, name: "tap", volume: 0.4 })),
  { at: offset + 20 + n * STEP + 16, name: "pop", volume: 0.5 },
];

const Star: React.FC<{ color?: string; size?: number }> = ({ color = "currentColor", size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" style={{ fill: color, verticalAlign: "-3px" }}>
    <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
  </svg>
);

/**
 * Repository cards float in on a tilted 3D wall while star counts roll up; a total counter
 * sits top-left. Also works for products, case studies or any "card + metric" list.
 */
export const RepoStack: React.FC<{ repos: Repo[]; title: string; totalLabel?: string; total?: number; owner?: string }> = ({
  repos,
  title,
  totalLabel = "STARS",
  total,
  owner,
}) => {
  const f = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const b = useBrand();
  const sum = total ?? repos.reduce((a, r) => a + r.stars, 0);
  const cols = 3;
  const cam = track(f, [
    { f: 0, rx: 24, ry: -26, s: 0.7, x: 200 },
    { f: 30 + repos.length * STEP, rx: 12, ry: -12, s: 0.9, x: 120, ease: E.out },
    { f: durationInFrames, rx: 8, ry: -6, s: 0.96, x: 90 },
  ]);
  const countP = seg(f, 20, 20 + repos.length * STEP, E.out);
  const fade = seg(f, 0, 6, E.linear) * (1 - seg(f, durationInFrames - 6, 6, E.linear));
  return (
    <AbsoluteFill style={{ background: b.ink, opacity: fade, perspective: 1800, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 110, top: 90, zIndex: 2 }}>
        <div style={{ fontFamily: V.body, fontWeight: 700, fontSize: 50, color: "#F5F7FA", opacity: seg(f, 4, 10), transform: `translateY(${(1 - seg(f, 4, 16, E.out)) * 20}px)` }}>{title}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 20 }}>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 76, color: V.accent, fontVariantNumeric: "tabular-nums" }}>{Math.round(sum * countP).toLocaleString("en-US")}</span>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 22, color: "rgba(245,247,250,0.6)" }}>
            <Star color="#E3B341" size={22} /> {totalLabel}
          </span>
        </div>
        {owner && <div style={{ marginTop: 16, fontFamily: V.body, fontSize: 24, color: "rgba(245,247,250,0.5)", opacity: seg(f, 14, 10) }}>{owner}</div>}
      </div>
      <div
        style={{
          position: "absolute",
          left: width / 2 - (cols * CARD_W + (cols - 1) * 28) / 2 + cam.x,
          top: height / 2 - 120,
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, ${CARD_W}px)`,
          gap: 28,
          transformStyle: "preserve-3d",
          transform: `scale(${cam.s}) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg)`,
        }}
      >
        {repos.map((r, i) => {
          const p = seg(f, 14 + i * STEP, 22, E.out);
          const stars = Math.round(r.stars * seg(f, 18 + i * STEP, 30, E.out));
          const top = i === 0;
          return (
            <div
              key={r.name}
              style={{
                height: 168,
                boxSizing: "border-box",
                padding: "22px 24px",
                borderRadius: 14,
                background: top ? `linear-gradient(135deg, #111A22, #0F2A2A)` : "#0D1117",
                border: `1px solid ${top ? b.accent : "rgba(255,255,255,0.12)"}`,
                boxShadow: top ? `0 0 40px ${b.accent}33` : "0 20px 40px rgba(0,0,0,0.4)",
                fontFamily: V.body,
                opacity: clamp01(p * 2),
                transform: `translateZ(${mix(-600, top ? 40 : 0, p)}px) translateY(${(1 - p) * 60}px)`,
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: "#58A6FF" }}>{r.name}</div>
              <div style={{ fontSize: 17, lineHeight: 1.45, color: "rgba(230,237,243,0.65)", marginTop: 8, height: 50, overflow: "hidden" }}>{r.desc}</div>
              <div style={{ display: "flex", gap: 22, alignItems: "center", marginTop: 12, fontSize: 17, color: "rgba(230,237,243,0.65)" }}>
                <span>
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: r.langColor, marginRight: 8 }} />
                  {r.lang}
                </span>
                <span style={{ color: top ? "#E3B341" : undefined, fontVariantNumeric: "tabular-nums" }}>
                  <Star size={17} /> {stars.toLocaleString("en-US")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
