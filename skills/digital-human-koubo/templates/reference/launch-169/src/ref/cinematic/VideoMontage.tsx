import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useBrand, V } from "./brand";
import type { Cue } from "./sfx";
import { E, clamp01, mix, seg } from "./motion";

export type MontageClip = { src: string; from?: number; label?: string };
export type MontageWord = { beat: number; text: string; accent?: boolean; clear?: boolean };

/** Frames for a montage: every clip holds `beatsPerClip` beats. */
export const montageFrames = (clips: number, beat: number, beatsPerClip = 2) => Math.round(clips * beatsPerClip * beat);

export const montageCues = (clips: number, beat: number, offset: number, beatsPerClip = 2): Cue[] =>
  Array.from({ length: clips }, (_, i) => ({
    at: Math.round(offset + i * beatsPerClip * beat),
    name: i === 0 ? "impact" : `slam-${(i % 3) + 1}`,
    volume: i === 0 ? 0.5 : 0.4,
  }));

const Clip: React.FC<{ clip: MontageClip; len: number; index: number }> = ({ clip, len, index }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = useBrand();
  const zoom = mix(1.14, 1.02, seg(f, 0, len, E.out));
  const drift = (index % 2 ? -1 : 1) * mix(-14, 14, f / len);
  const flash = Math.max(0, 1 - f / 4);
  const labelIn = seg(f, 3, 8, E.out);
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom}) translateX(${drift}px)` }}>
        <OffthreadVideo src={staticFile(clip.src)} startFrom={Math.round((clip.from ?? 0) * fps)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff", opacity: flash * 0.55 }} />
      {clip.label && (
        <div
          style={{
            position: "absolute",
            right: 70,
            bottom: 110,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 20px",
            borderRadius: 999,
            background: "rgba(20,20,20,0.55)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.18)",
            fontFamily: V.body,
            fontWeight: 600,
            fontSize: 24,
            color: "#fff",
            opacity: labelIn,
            transform: `translateY(${(1 - labelIn) * 14}px)`,
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: b.accent }} />
          {clip.label}
        </div>
      )}
    </AbsoluteFill>
  );
};

/**
 * Beat-cut full-bleed footage: each clip punches in and drifts, a white flash marks the cut,
 * a label chip names the model or use case, and a headline builds word by word on beats.
 */
export const VideoMontage: React.FC<{ clips: MontageClip[]; beat: number; beatsPerClip?: number; words?: MontageWord[]; letterbox?: boolean }> = ({
  clips,
  beat,
  beatsPerClip = 2,
  words = [],
  letterbox = true,
}) => {
  const f = useCurrentFrame();
  const len = Math.round(beatsPerClip * beat);
  const beatNow = f / beat;
  const lastClear = Math.max(-1, ...words.filter((w) => w.clear && w.beat <= beatNow).map((w) => w.beat));
  const shown = words.filter((w) => w.beat <= beatNow && w.beat >= lastClear);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {clips.map((c, i) => (
        <Sequence key={i} from={i * len} durationInFrames={len} layout="none">
          <Clip clip={c} len={len} index={i} />
        </Sequence>
      ))}
      <AbsoluteFill style={{ background: "linear-gradient(transparent 55%, rgba(0,0,0,0.55))" }} />
      {letterbox && (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 64, background: "#000" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 64, background: "#000" }} />
        </>
      )}
      <div style={{ position: "absolute", left: 100, bottom: 120, display: "flex", flexWrap: "wrap", columnGap: 28, maxWidth: 1300 }}>
        {shown.map((w) => {
          const p = seg(f, w.beat * beat, 7, E.out);
          return (
            <span key={`${w.beat}-${w.text}`} style={{ overflow: "hidden", display: "inline-block", paddingBottom: 8 }}>
              <span
                style={{
                  display: "inline-block",
                  fontFamily: V.display,
                  fontWeight: 800,
                  fontSize: 120,
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                  color: w.accent ? V.accent : "#fff",
                  transform: `translateY(${(1 - p) * 105}%) skewX(${(1 - p) * -8}deg)`,
                  opacity: clamp01(p * 2),
                  textShadow: "0 6px 30px rgba(0,0,0,0.35)",
                }}
              >
                {w.text}
              </span>
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
